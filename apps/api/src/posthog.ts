// The PostHog client for the API — product analytics, error tracking, server
// -side feature flags, and LLM traces for the coach.
//
// PostHog answers "what are athletes doing, and is the product working for
// them"; the pino logger in logger.ts answers "what did this process do". They
// are fed from the same call sites (see analytics.ts) so a new event can't
// reach one and miss the other.
//
// Everything here is a no-op when POSTHOG_KEY is unset. That is the normal
// state of a fresh clone and of the test suite, and no feature may depend on
// PostHog being reachable.
import "dotenv/config";
import { captureAiGeneration } from "@posthog/ai";
import { PostHog } from "posthog-node";
import { appEnv, logger } from "./logger.js";

/** Tests must not open a batching HTTP client or talk to a real project. */
const isTest = process.env.NODE_ENV === "test" || Boolean(process.env.VITEST);

const key = process.env.POSTHOG_KEY;

/** US cloud unless the project lives in the EU or on a self-hosted instance. */
const host = process.env.POSTHOG_HOST || "https://us.i.posthog.com";

function createClient(): PostHog | null {
  if (!key || isTest) return null;

  const client = new PostHog(key, {
    host,
    // A request handler must never wait on analytics: batch, and let the
    // shutdown hook drain what's left.
    flushAt: 20,
    flushInterval: 10_000,
  });

  // Ingestion failures are PostHog's problem, not the request's — but a silent
  // one means a dashboard quietly stops filling in.
  client.on("error", (err: unknown) => {
    logger.warn(
      { event: "posthog.request_failed", err },
      "PostHog rejected a batch",
    );
  });

  logger.info({ event: "posthog.enabled", host }, "PostHog analytics enabled");
  return client;
}

const client = createClient();

/** Whether anything below will actually leave the process. */
export const posthogEnabled = client !== null;

/**
 * `environment` on every event, and on the person behind it.
 *
 * A PostHog project is one silo of data, so a laptop pointed at a real key
 * writes its test athletes into the same Persons list as production's. Nothing
 * in an event says where it came from unless we put it there — this is that
 * property, and it is what "Filter out internal and test users" and a
 * `environment = production` filter on the Persons list both read.
 *
 * `$set` rather than `$set_once`: an athlete's environment is wherever they
 * were last seen, so a real person who is also the one testing locally is not
 * stuck as `development` forever.
 *
 * A separate PostHog project for development is stronger than a property — the
 * data never arrives at all — and this doesn't replace it. It is what keeps the
 * project honest for everyone who hasn't set one up. See the README.
 */
function withEnvironment(
  properties: Record<string, unknown> | undefined,
  { person = false }: { person?: boolean } = {},
): Record<string, unknown> {
  return {
    ...properties,
    environment: appEnv,
    ...(person ? { $set: { environment: appEnv } } : {}),
  };
}

interface UserEvent {
  /** The better-auth user id — the same value `userId` carries in the logs. */
  distinctId: string;
  event: string;
  properties?: Record<string, unknown>;
}

/**
 * One thing an athlete did. Prefer `track()` in analytics.ts, which records it
 * in the logs at the same time.
 */
export function captureUserEvent({
  distinctId,
  event,
  properties,
}: UserEvent): void {
  client?.capture({
    distinctId,
    event,
    // An athlete doing something is the one place a person definitely exists,
    // so it is where the person's own `environment` is written.
    properties: withEnvironment(properties, { person: true }),
  });
}

/**
 * One thing that broke, for PostHog Error Tracking.
 *
 * `distinctId` is optional because the most interesting failures happen before
 * anyone is identified; those group under a synthetic id rather than being
 * dropped.
 */
export function captureServerException(
  error: unknown,
  distinctId: string | undefined,
  properties?: Record<string, unknown>,
): void {
  client?.captureException(
    error,
    distinctId ?? "server",
    withEnvironment({
      ...properties,
      // Separates API faults from the browser's in the same project.
      source: "api",
    }),
  );
}

/**
 * Evaluates a flag for one athlete.
 *
 * `fallback` is what happens when PostHog is off, unreachable, or has never
 * heard of the flag — which must always be the behaviour the app shipped with,
 * so that deleting the flag (or the whole integration) changes nothing.
 */
export async function isFeatureEnabledFor(
  flag: string,
  distinctId: string,
  fallback: boolean,
): Promise<boolean> {
  if (!client) return fallback;
  try {
    const flags = await client.evaluateFlags(distinctId);
    // `getFlag`, not `isEnabled`: the latter reports an unknown flag as *off*,
    // so the day PostHog is switched on — before anyone has created the flag —
    // it would silently disable the feature. Only an explicit value wins.
    const value = flags.getFlag(flag);
    return value === undefined ? fallback : value !== false;
  } catch (err) {
    logger.warn(
      { event: "posthog.flag_failed", flag, err },
      "Could not read a flag",
    );
    return fallback;
  }
}

/** A multivariate flag's answer for one athlete: which arm, and its config. */
export interface FeatureVariant {
  /**
   * What the flag evaluated to — the variant key for a multivariate flag
   * (`control`, `sonnet-terse`), or `true` for a plain boolean one that exists
   * only to carry a payload, which is PostHog's remote config.
   */
  value: string | true;
  /**
   * The variant's JSON payload, exactly as it was typed into PostHog.
   *
   * Deliberately `unknown`: a payload is edited in a browser textarea by
   * whoever has access to the project, with no review and no deploy. The caller
   * parses it and falls back on anything it doesn't recognise.
   */
  payload: unknown;
}

/**
 * Evaluates a flag for one athlete and hands back the payload that says what
 * the variant actually *is* — the built-in way to vary more than a boolean
 * without inventing a config mechanism.
 *
 * `null` — PostHog off, unreachable, no such flag, or this athlete outside the
 * rollout — means the shipped behaviour, exactly as `isFeatureEnabledFor`'s
 * fallback does. That is what makes deleting the flag a safe act.
 *
 * `getFlag` is called before `getFlagPayload` on purpose: only the first counts
 * as an access, and an access is what sends `$feature_flag_called`. That event
 * is the exposure an experiment computes its statistics from, so it has to fire
 * where the athlete actually receives the variant and nowhere else.
 */
export async function getFeatureVariantFor(
  flag: string,
  distinctId: string,
): Promise<FeatureVariant | null> {
  if (!client) return null;
  try {
    const flags = await client.evaluateFlags(distinctId);
    const value = flags.getFlag(flag);
    // `false` is the athlete in the holdout, `undefined` the flag not existing.
    // Neither is a variant, and both mean what the app shipped with.
    if (value === undefined || value === false) return null;
    return { value, payload: flags.getFlagPayload(flag) };
  } catch (err) {
    logger.warn(
      { event: "posthog.flag_failed", flag, err },
      "Could not read a flag",
    );
    return null;
  }
}

/**
 * Whether the athlete's words and the coach's reply are sent to PostHog
 * alongside the numbers.
 *
 * Off by default. Token counts, cost, latency and errors are what you need to
 * run the feature; the transcript of someone's training conversation is not
 * something to ship to a third party unless it was asked for. Set
 * POSTHOG_LLM_CAPTURE_CONTENT=true to debug answer quality.
 */
const captureLlmContent = process.env.POSTHOG_LLM_CAPTURE_CONTENT === "true";

/**
 * Where one LLM event sits in the tree PostHog draws.
 *
 * A turn is a `$ai_trace` with a `$ai_generation` per model call and an
 * `$ai_span` per tool call hanging off it. All three carry the same
 * `traceId`, which is the only thing that groups them — omit it and every
 * event becomes its own one-line trace. ai-observability.ts is what fills
 * these in; nothing else should be building them by hand.
 */
interface LlmEventContext {
  distinctId: string;
  /** The turn. Every event from one coach answer shares it. */
  traceId: string;
  /** This event's own id, so what it caused can point back at it. */
  spanId?: string;
  /** The event above: the trace, or the generation that asked for a tool. */
  parentId?: string;
  /** What it is called in the trace tree — "coach turn", "getRunSplits". */
  spanName?: string;
  /** Groups a conversation's turns. The thread id, for the coach. */
  conversationId?: string;
  /** The replay this turn came from, when a browser started it. */
  replaySessionId?: string;
  properties?: Record<string, unknown>;
}

/** The `$ai_*` properties every event in a trace carries. */
function contextProperties(context: LlmEventContext): Record<string, unknown> {
  return withEnvironment({
    $ai_trace_id: context.traceId,
    ...(context.spanId ? { $ai_span_id: context.spanId } : {}),
    ...(context.parentId ? { $ai_parent_id: context.parentId } : {}),
    ...(context.spanName ? { $ai_span_name: context.spanName } : {}),
    ...(context.conversationId
      ? { $ai_session_id: context.conversationId }
      : {}),
    // Not an $ai_ property: this is the replay's own id, and it is what makes
    // "watch what the athlete was doing" a link from the trace.
    ...(context.replaySessionId
      ? { $session_id: context.replaySessionId }
      : {}),
    ...context.properties,
  });
}

/** `$ai_is_error` / `$ai_error`, in the shape `@posthog/ai` writes them. */
function errorProperties(error: unknown): Record<string, unknown> {
  return {
    $ai_is_error: true,
    $ai_error: error instanceof Error ? error.message : String(error),
  };
}

/** Content is redacted unless POSTHOG_LLM_CAPTURE_CONTENT says otherwise. */
function stateOrNull(value: unknown): unknown {
  return captureLlmContent ? value : null;
}

/** Ingestion is best-effort: a failed event must never fail the turn. */
function capture(event: string, distinctId: string, properties: object): void {
  try {
    client?.capture({ distinctId, event, properties });
  } catch (err) {
    logger.warn(
      { event: "posthog.ai_capture_failed", ai_event: event, err },
      "LLM event not sent",
    );
  }
}

export interface LlmGeneration extends LlmEventContext {
  modelId: string;
  /** The AI SDK's provider id — `gateway` for anything the gateway routes. */
  provider?: string;
  /** Wall-clock seconds the model call took. */
  latencySeconds: number;
  /** Streaming only — the wait the athlete actually feels. */
  timeToFirstTokenSeconds?: number;
  streamed?: boolean;
  inputTokens?: number;
  outputTokens?: number;
  /** The model's thinking tokens. Billed as output, invisible in the reply. */
  reasoningTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  input: unknown;
  output: unknown;
  finishReason?: string;
  /** The provider's own id for the response, for a support conversation. */
  completionId?: string;
  /** The tool definitions the model was given, for `$ai_tools`. */
  tools?: unknown[];
  error?: unknown;
}

/**
 * The vendor PostHog prices the call against.
 *
 * Its table is keyed on the vendor ("deepseek"), not on the SDK's provider id —
 * and through a gateway that id is `gateway` for everything it routes, which
 * would price every call in the app at nothing. The gateway's model ids carry
 * the vendor in front of the slash, so that is what to read; the provider id's
 * first segment ("google.generative-ai" → "google") is what a model reached
 * directly would have.
 */
function vendorOf({ modelId, provider }: LlmGeneration): string {
  const [vendor, model] = modelId.split("/");
  if (model) return vendor;
  return provider?.split(".")[0] ?? "gateway";
}

/**
 * One model call, as a `$ai_generation` event: PostHog's LLM analytics reads
 * these for tokens, cost, latency and error rate per athlete and per model.
 *
 * One *call*, not one turn — a coach answer that reads Strava twice before it
 * writes anything is three of these under one trace, which is the only way the
 * slow one is visible.
 *
 * `captureAiGeneration` is the same primitive `@posthog/ai`'s own wrappers
 * funnel through. It is used directly rather than `withTracing`, which throws
 * on an AI SDK v7 model and tells you to set up an OpenTelemetry exporter —
 * a whole tracing stack in this process to reach an event the SDK already
 * hands us the numbers for.
 */
export function captureLlmGeneration(generation: LlmGeneration): void {
  if (!client) return;

  void captureAiGeneration(client, {
    distinctId: generation.distinctId,
    model: generation.modelId,
    provider: vendorOf(generation),
    input: generation.input,
    output: generation.output,
    latency: generation.latencySeconds,
    timeToFirstToken: generation.timeToFirstTokenSeconds,
    usage: {
      inputTokens: generation.inputTokens,
      outputTokens: generation.outputTokens,
      reasoningTokens: generation.reasoningTokens,
      cacheReadInputTokens: generation.cacheReadTokens,
      cacheCreationInputTokens: generation.cacheWriteTokens,
    },
    // Redacts $ai_input / $ai_output; every metric still arrives.
    privacyMode: !captureLlmContent,
    stopReason: generation.finishReason,
    completionId: generation.completionId,
    tools: generation.tools,
    error: generation.error,
    properties: {
      ...contextProperties(generation),
      ...(generation.streamed === undefined
        ? {}
        : { $ai_stream: generation.streamed }),
    },
    // captureAiGeneration reads $ai_trace_id off its own option, not ours.
    traceId: generation.traceId,
  }).catch((err: unknown) => {
    logger.warn(
      { event: "posthog.ai_capture_failed", err },
      "LLM event not sent",
    );
  });
}

export interface LlmSpan extends LlmEventContext {
  /** Seconds the step took. */
  latencySeconds: number;
  input: unknown;
  output: unknown;
  error?: unknown;
}

/**
 * One step inside a turn that wasn't a model call — for us, a tool reading
 * Strava. `$ai_span` is what turns "the answer took nine seconds" into "seven
 * of them were `getRunSplits`".
 */
export function captureLlmSpan(span: LlmSpan): void {
  capture("$ai_span", span.distinctId, {
    ...contextProperties(span),
    $ai_input_state: stateOrNull(span.input),
    $ai_output_state: stateOrNull(span.output),
    $ai_latency: span.latencySeconds,
    ...(span.error ? errorProperties(span.error) : {}),
  });
}

export interface LlmTrace extends LlmEventContext {
  /** Seconds from the request arriving to the last token. */
  latencySeconds: number;
  input: unknown;
  output: unknown;
  error?: unknown;
}

/**
 * The whole turn, as its own `$ai_trace` event.
 *
 * PostHog will synthesise a trace from the events under it, so this is not
 * strictly required — but a synthesised one has no name, no total latency and
 * no answer on it, which is exactly what the trace list shows.
 */
export function captureLlmTrace(trace: LlmTrace): void {
  capture("$ai_trace", trace.distinctId, {
    ...contextProperties(trace),
    $ai_input_state: stateOrNull(trace.input),
    $ai_output_state: stateOrNull(trace.output),
    $ai_latency: trace.latencySeconds,
    ...(trace.error ? errorProperties(trace.error) : {}),
  });
}

/**
 * Drains the queue on the way out. Without this, the events from the last ten
 * seconds of a process's life — which include whatever killed it — never ship.
 */
export async function shutdownPostHog(): Promise<void> {
  await client?.shutdown();
}
