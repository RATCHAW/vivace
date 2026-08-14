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
import { logger } from "./logger.js";

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
  client?.capture({ distinctId, event, properties });
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
  client?.captureException(error, distinctId ?? "server", {
    ...properties,
    // Separates API faults from the browser's in the same project.
    source: "api",
  });
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

interface CoachGeneration {
  distinctId: string;
  modelId: string;
  /** Wall-clock seconds from request to final token. */
  latencySeconds: number;
  inputTokens?: number;
  outputTokens?: number;
  input: unknown;
  output: unknown;
  finishReason?: string;
  properties?: Record<string, unknown>;
  error?: unknown;
}

/**
 * One coach turn, as a `$ai_generation` event: PostHog's LLM analytics reads
 * these for tokens, cost, latency and error rate per athlete and per model.
 *
 * `captureAiGeneration` is the same primitive `@posthog/ai`'s own wrappers
 * funnel through. It is used directly rather than `withTracing`, which throws
 * on an AI SDK v7 model and tells you to set up an OpenTelemetry exporter —
 * a whole tracing stack in this process to reach an event we can send from
 * `onFinish`, where the SDK already hands us the numbers.
 */
export function captureCoachGeneration(generation: CoachGeneration): void {
  if (!client) return;

  void captureAiGeneration(client, {
    distinctId: generation.distinctId,
    model: generation.modelId,
    provider: "google",
    input: generation.input,
    output: generation.output,
    latency: generation.latencySeconds,
    usage: {
      inputTokens: generation.inputTokens,
      outputTokens: generation.outputTokens,
    },
    // Redacts $ai_input / $ai_output; every metric still arrives.
    privacyMode: !captureLlmContent,
    stopReason: generation.finishReason,
    error: generation.error,
    properties: { $ai_span_name: "coach turn", ...generation.properties },
  }).catch((err: unknown) => {
    logger.warn(
      { event: "posthog.ai_capture_failed", err },
      "LLM event not sent",
    );
  });
}

/**
 * Drains the queue on the way out. Without this, the events from the last ten
 * seconds of a process's life — which include whatever killed it — never ship.
 */
export async function shutdownPostHog(): Promise<void> {
  await client?.shutdown();
}
