// One turn of the coach, as a trace PostHog can draw.
//
// PostHog's LLM analytics reads three events: `$ai_trace` for the request,
// `$ai_generation` for a model call inside it, and `$ai_span` for a step that
// wasn't one — for us, a tool reading Strava. posthog.ts knows how to write the
// three; this module knows *when*, which is the part the AI SDK already tells
// us and which nothing else in the app should be inferring from the outside.
//
// It hangs off the SDK's own lifecycle callbacks rather than a wrapper around
// the model. That is deliberate: `withTracing` from @posthog/ai throws on an AI
// SDK v7 model and asks for an OpenTelemetry exporter, and `onFinish` alone
// only ever sees the *last* step — a coach answer that reads Strava twice
// before writing a word is three model calls, and averaging them into one event
// is exactly what hides the slow one.
//
// Everything here is a no-op when PostHog is switched off, and every callback
// swallows nothing: the SDK awaits these and discards what they throw, so the
// capture helpers log rather than raise.
import { randomUUID } from "node:crypto";
import type {
  LanguageModelCallEndEvent,
  LanguageModelCallStartEvent,
  ModelMessage,
  ToolExecutionEndEvent,
} from "ai";
import {
  captureLlmGeneration,
  captureLlmSpan,
  captureLlmTrace,
} from "./posthog.js";

/**
 * The header posthog-js's session id travels in.
 *
 * Its name is PostHog's, not ours: `tracing_headers` in the browser SDK writes
 * exactly this, and apps/web sets it by hand on the chat request for the same
 * reason — one header is cheaper than patching every `fetch` in the app.
 */
export const POSTHOG_SESSION_HEADER = "x-posthog-session-id";

/** What one turn is, before any of it has happened. */
export interface Turn {
  /** The better-auth user id — the same value `userId` carries in the logs. */
  distinctId: string;
  /** What the trace is called in PostHog: "coach turn", "post-run debrief". */
  name: string;
  /** Whether the athlete watched it arrive. Sets `$ai_stream`. */
  streamed?: boolean;
  /**
   * Groups a conversation's turns under one `$ai_session_id`. The thread id
   * for the coach; a debrief nobody asked for belongs to no conversation.
   */
  conversationId?: string;
  /**
   * The browser replay this turn came from, when a browser started it. It is
   * what turns a slow trace into "watch what they were doing" — see the
   * X-POSTHOG-SESSION-ID header the chat transport sends.
   */
  replaySessionId?: string;
  /** Carried on every event in the turn, so a filter reaches all of them. */
  properties?: Record<string, unknown>;
}

/** The AI SDK callbacks that file a turn, plus the one call that closes it. */
export interface ObservedTurn {
  /** Everything below is filed under this. Log it and a trace is findable. */
  traceId: string;
  /** Spread into `streamText` / `generateText`. */
  callbacks: {
    onLanguageModelCallStart: (event: LanguageModelCallStartEvent) => void;
    onLanguageModelCallEnd: (event: LanguageModelCallEndEvent) => void;
    onToolExecutionEnd: (event: ToolExecutionEndEvent) => void;
  };
  /**
   * Files the `$ai_trace`. Safe to call twice — a stream that dies after the
   * model finished reaches both `onFinish` and `onError`, and the turn is
   * whichever got there first.
   */
  end(result: {
    input?: unknown;
    output?: unknown;
    error?: unknown;
    /** Merged over the turn's own, for what is only known at the end. */
    properties?: Record<string, unknown>;
  }): void;
}

/**
 * A tool that answered `{ error: "…" }` failed, whatever the SDK thinks.
 *
 * That shape is `stravaFailure` in coach.ts: it turns a dead upstream into a
 * sentence the model can read instead of an exception, which is right for the
 * athlete and wrong for a dashboard — the tool did not do what it was asked.
 * Without this the trace shows a green tool call and a vague answer.
 */
function refusedWith(output: unknown): string | undefined {
  if (typeof output !== "object" || output === null) return undefined;
  const error = (output as { error?: unknown }).error;
  return typeof error === "string" ? error : undefined;
}

/**
 * What the model said, in the shape PostHog reads.
 *
 * Only tool calls need rewriting, and they need it badly: ingestion counts a
 * tool call only when it arrives as `{ type: "tool-call", function: { name } }`,
 * which is what `@posthog/ai`'s own Vercel wrapper rewrites its parts into. The
 * AI SDK's `{ type: "tool-call", toolName, input }` passes straight through
 * ingestion without being seen — `$ai_tools_called` stays empty and the trace
 * list's tool column stays blank, however many spans we file next to it.
 */
function outputChoices(
  content: LanguageModelCallEndEvent["content"],
): unknown[] {
  const parts = content.map((part) =>
    part.type === "tool-call"
      ? {
          type: "tool-call",
          id: part.toolCallId,
          function: {
            name: part.toolName,
            arguments:
              typeof part.input === "string"
                ? part.input
                : JSON.stringify(part.input),
          },
        }
      : part,
  );

  return [{ role: "assistant", content: parts }];
}

/**
 * The messages the model was handed, as PostHog wants to show them.
 *
 * The system prompt is prepended rather than dropped, because "why did it
 * answer that" is usually a question about the prompt. All of it is redacted
 * unless POSTHOG_LLM_CAPTURE_CONTENT is set.
 */
function promptMessages(
  instructions: LanguageModelCallStartEvent["instructions"],
  messages: ModelMessage[],
): unknown[] {
  if (!instructions) return messages;
  // `instructions` is one of three shapes by the time the SDK reports it: the
  // string that was passed as `system`, that string already turned into a
  // message, or several of them.
  if (typeof instructions === "string") {
    return [{ role: "system", content: instructions }, ...messages];
  }
  return [
    ...(Array.isArray(instructions) ? instructions : [instructions]),
    ...messages,
  ];
}

/**
 * Starts a trace, and hands back the callbacks that fill it in.
 *
 * The turn ends when `end` is called, not when the last model call returns —
 * a coach answer is only finished once the stream has been written out, and
 * that latency is the one the athlete felt.
 */
export function observeTurn(turn: Turn): ObservedTurn {
  const traceId = randomUUID();
  const startedAt = Date.now();

  const context = {
    distinctId: turn.distinctId,
    traceId,
    conversationId: turn.conversationId,
    replaySessionId: turn.replaySessionId,
    properties: turn.properties,
  };

  /** The model call a tool call hangs under; the trace until one has run. */
  let parentOfTools = traceId;
  /**
   * What the model call in flight was given. The SDK reports the prompt when a
   * call starts and the tokens when it ends, and steps run one at a time, so
   * one slot is enough to put the two halves back together.
   */
  let inFlight:
    | {
        modelId: string;
        provider: string;
        /** This call's own start, not the turn's — see `end`. */
        startedAt: number;
        input: unknown[];
        tools: readonly unknown[] | undefined;
      }
    | undefined;
  let ended = false;

  return {
    traceId,

    callbacks: {
      onLanguageModelCallStart: (event) => {
        inFlight = {
          modelId: event.modelId,
          provider: event.provider,
          startedAt: Date.now(),
          input: promptMessages(event.instructions, event.messages),
          tools: event.tools,
        };
      },

      onLanguageModelCallEnd: (event) => {
        const spanId = randomUUID();
        // Whatever tools this call asked for hang under it, not under the turn.
        parentOfTools = spanId;

        captureLlmGeneration({
          ...context,
          spanId,
          parentId: traceId,
          modelId: event.modelId,
          provider: event.provider,
          latencySeconds: event.performance.responseTimeMs / 1000,
          timeToFirstTokenSeconds:
            event.performance.timeToFirstOutputMs === undefined
              ? undefined
              : event.performance.timeToFirstOutputMs / 1000,
          streamed: turn.streamed,
          inputTokens: event.usage.inputTokens,
          outputTokens: event.usage.outputTokens,
          reasoningTokens: event.usage.outputTokenDetails.reasoningTokens,
          cacheReadTokens: event.usage.inputTokenDetails.cacheReadTokens,
          cacheWriteTokens: event.usage.inputTokenDetails.cacheWriteTokens,
          input: inFlight?.input ?? [],
          output: outputChoices(event.content),
          finishReason: event.finishReason,
          completionId: event.responseId,
          tools: inFlight?.tools ? [...inFlight.tools] : undefined,
        });

        inFlight = undefined;
      },

      onToolExecutionEnd: (event) => {
        const threw = event.toolOutput.type === "tool-error";
        const output = threw ? undefined : event.toolOutput.output;

        captureLlmSpan({
          ...context,
          spanId: event.toolCall.toolCallId,
          parentId: parentOfTools,
          spanName: event.toolCall.toolName,
          latencySeconds: event.toolExecutionMs / 1000,
          input: event.toolCall.input,
          output,
          error: threw ? event.toolOutput.error : refusedWith(output),
        });
      },
    },

    end({ input, output, error, properties }) {
      if (ended) return;
      ended = true;

      // A model that never answered files no generation of its own — the SDK
      // reports the call's end, and there wasn't one. Without this the turn
      // shows as a failed trace over a model with a perfect success rate.
      //
      // Timed from the call that failed, not from the turn: by the third step
      // the turn is seconds old through no fault of the call that broke, and a
      // generation that claims those seconds is the one the latency panel
      // blames. A turn cut short files no generation at all — the provider
      // never reported its tokens, and a zero-token generation would drag every
      // per-call average with it. The trace carries `cut_short` instead.
      if (error && inFlight) {
        captureLlmGeneration({
          ...context,
          parentId: traceId,
          modelId: inFlight.modelId,
          provider: inFlight.provider,
          latencySeconds: (Date.now() - inFlight.startedAt) / 1000,
          streamed: turn.streamed,
          input: inFlight.input,
          output: null,
          error,
        });
        inFlight = undefined;
      }

      captureLlmTrace({
        ...context,
        properties: { ...context.properties, ...properties },
        spanName: turn.name,
        latencySeconds: (Date.now() - startedAt) / 1000,
        input,
        output,
        error,
      });
    },
  };
}
