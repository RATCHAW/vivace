// The typed API surface for the app. Everything under ./generated comes from
// apps/api/openapi.json via @hey-api/openapi-ts — don't hand-edit it, run
// `pnpm generate` at the repo root instead.
//
// Import from `@/api`, not from the generated files directly, so the client is
// configured and its errors are normalised before the first request goes out.

import type { UIMessage } from "ai";
import { client } from "./generated/client.gen";
import { postClientLogs } from "./generated/sdk.gen";
import type {
  ApiError,
  ClientLogEvent,
  CoachMessage,
  RunRender,
  VideoTemplate,
} from "./generated/types.gen";

client.setConfig({
  // Same-origin: Vite proxies /api to the Hono server in dev, nginx in Docker.
  baseUrl: "/",
  // Send the better-auth session cookie.
  credentials: "include",
});

/**
 * A failed request, with the status attached.
 *
 * The generated client throws the parsed response body as-is — for us that's
 * the OpenAPI `ApiError` schema, `{ error: string }` — which loses the status
 * and isn't an `Error`. An error interceptor wraps every failure in this so
 * React Query can tell a dead session (401, don't retry) from a flaky upstream.
 * It still implements `ApiError`, which is what the generated query options
 * declare as their error type, so callers can read `.error` either way.
 */
export class ApiRequestError extends Error implements ApiError {
  readonly error: string;

  constructor(
    readonly status: number,
    body: unknown,
  ) {
    const message = describe(status, body);
    super(message);
    this.name = "ApiRequestError";
    this.error = message;
  }
}

function describe(status: number, body: unknown): string {
  if (typeof body === "object" && body !== null && "error" in body) {
    return String((body as { error: unknown }).error);
  }
  return status ? `Request failed (${status})` : "Network request failed";
}

client.interceptors.error.use(
  (error, response: Response | undefined) =>
    new ApiRequestError(response?.status ?? 0, error),
);

/**
 * Live render progress for one run, over server-sent events.
 *
 * One of the three hand-written escapes below: the generated client (and the
 * TanStack layer on top of it) can't express a text/event-stream response, so
 * GET /api/runs/{id}/render/progress is consumed with EventSource instead.
 * The path mirrors the `streamRunRenderProgress` operation in the OpenAPI
 * document — change it there and this must follow.
 *
 * Each message is a full `RunRender` JSON. The server closes the stream after
 * a terminal status (`done`/`error`), or after a lone `null` when there is no
 * render — both of which close the source here so EventSource doesn't
 * reconnect forever. Returns an unsubscribe function.
 *
 * `template` says which of the run's renders to watch: a run holds one per
 * template, and they progress independently.
 */
export function subscribeRunRenderProgress(
  activityId: number,
  template: VideoTemplate,
  onUpdate: (render: RunRender) => void,
): () => void {
  const source = new EventSource(
    `/api/runs/${activityId}/render/progress?template=${encodeURIComponent(template)}`,
  );
  source.onmessage = (event) => {
    const render = JSON.parse(event.data) as RunRender | null;
    if (render === null) {
      source.close();
      return;
    }
    onUpdate(render);
    if (render.status !== "rendering") source.close();
  };
  return () => source.close();
}

/**
 * Ships a batch of browser events to POST /api/logs, where the server re-logs
 * them into Loki. Called by `@/lib/logger` — track things through `trackEvent`
 * / `trackError` there, not through this.
 *
 * The normal path is the generated `postClientLogs` operation. `beacon` is for
 * the last flush before the page goes away, where a pending fetch is killed
 * mid-flight: `navigator.sendBeacon` is the only transport a browser promises
 * to finish, and it takes a URL and a body, not a client.
 *
 * Failures are swallowed on purpose. Telemetry that breaks the app, or that
 * retries into a loop when the log endpoint is the thing that's down, is worse
 * than a missing log line.
 */
export function sendClientLogs(
  events: ClientLogEvent[],
  { beacon = false }: { beacon?: boolean } = {},
): void {
  if (events.length === 0) return;
  const body = { events };

  if (beacon && typeof navigator !== "undefined" && navigator.sendBeacon) {
    navigator.sendBeacon(
      "/api/logs",
      new Blob([JSON.stringify(body)], { type: "application/json" }),
    );
    return;
  }

  void postClientLogs({ body }).catch(() => {});
}

/** Where `useChat` posts, mirroring the `coachChat` operation in the document. */
export const COACH_CHAT_PATH = "/api/coach/chat";

/**
 * A stored transcript, back in the shape `useChat` wants.
 *
 * Hand-written for the same reason as `subscribeRunRenderProgress` above: the
 * generated client can't express it. A `UIMessage` part is a union that grows
 * with every model capability,
 * so the OpenAPI schema describes it as "an object with a `type`" rather than
 * re-deriving the AI SDK's types in Zod. The API only ever stores parts the SDK
 * itself produced, so this cast is narrowing back to the truth — and it lives
 * here, once, instead of at every call site.
 */
export function toUIMessages(messages: CoachMessage[]): UIMessage[] {
  return messages as unknown as UIMessage[];
}

export { client };
export * from "./generated/@tanstack/react-query.gen";
export type {
  Athlete,
  ApiError,
  ClientLogContext,
  ClientLogEvent,
  CoachBriefing,
  CoachContext,
  CoachMessage,
  CoachPlan,
  CoachQueueItem,
  CoachSignal,
  CoachThread,
  CoachThreadDetail,
  CoachTone,
  PlanProgress,
  PlannedSession,
  Run,
  RunRender,
  RunRenderState,
  RunStreams,
  VideoTemplate,
} from "./generated/types.gen";
