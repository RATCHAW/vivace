// Browser-side instrumentation. Everything recorded here goes to both tools:
// batched to POST /api/logs, where the server re-logs it into the same Loki
// stream as its own lines, and captured in PostHog as a product event.
//
// Two entry points: `trackEvent` for something the user did, `trackError` for
// something that broke. Names are dotted and low-cardinality (`ui.page_view`,
// not `ui.page_view./runs`) because dashboards group by them — anything
// variable belongs in `context`.
//
// One funnel, two destinations, because the alternative — a `posthog.capture`
// next to every `trackEvent` — is how the two views of the app drift apart.
import { sendClientLogs, type ClientLogContext, type ClientLogEvent } from "@/api";
import { capturePostHogEvent, capturePostHogException } from "@/lib/posthog";

/** The server rejects longer batches; matches ClientLogBatchSchema. */
const MAX_BATCH = 50;
/** Long enough to coalesce a burst of clicks, short enough to feel live. */
const FLUSH_INTERVAL_MS = 5_000;
/** A stack is the useful part of an error; the whole thing is rarely needed. */
const MAX_STACK_CHARS = 1_000;

let queue: ClientLogEvent[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let installed = false;

function enqueue(
  level: ClientLogEvent["level"],
  event: string,
  message?: string,
  context?: ClientLogContext,
): void {
  queue.push({
    level,
    event,
    message,
    path: window.location.pathname,
    context,
    ts: new Date().toISOString(),
  });

  // An error is the reason someone opens Grafana — don't sit on it for 5s.
  if (level === "error" || queue.length >= MAX_BATCH) flushClientLogs();
  else timer ??= setTimeout(() => flushClientLogs(), FLUSH_INTERVAL_MS);
}

/**
 * Events PostHog records for itself. Sending our own copy would double every
 * number on the web-analytics dashboards.
 */
const POSTHOG_CAPTURES_NATIVELY = new Set(["ui.page_view"]);

/** Something the user did. */
export function trackEvent(event: string, context?: ClientLogContext): void {
  enqueue("info", event, undefined, context);
  if (!POSTHOG_CAPTURES_NATIVELY.has(event)) capturePostHogEvent(event, context);
}

/** Something that broke, with whatever the thrower gave us. */
export function trackError(
  event: string,
  cause: unknown,
  context?: ClientLogContext,
): void {
  const error = cause instanceof Error ? cause : null;
  enqueue("error", event, error?.message ?? String(cause), {
    ...context,
    ...(error?.name ? { name: error.name } : {}),
    ...(error?.stack ? { stack: error.stack.slice(0, MAX_STACK_CHARS) } : {}),
  });

  // PostHog wants the Error itself — it reads the stack for grouping, which a
  // truncated string can't support.
  capturePostHogException(error ?? new Error(String(cause)), { event, ...context });
}

/**
 * Sends what's queued. `beacon` switches to `navigator.sendBeacon` for the
 * flush that happens as the page is being torn down.
 */
export function flushClientLogs(options?: { beacon?: boolean }): void {
  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }
  if (queue.length === 0) return;

  const pending = queue;
  queue = [];
  for (let i = 0; i < pending.length; i += MAX_BATCH) {
    sendClientLogs(pending.slice(i, i + MAX_BATCH), options);
  }
}

/**
 * Catches what no component can: uncaught exceptions, dropped promises, and
 * the events still queued when the tab goes away. Called once from main.tsx.
 */
export function installClientLogging(): void {
  if (installed) return;
  installed = true;

  window.addEventListener("error", (event) => {
    trackError("browser.error", event.error ?? event.message, {
      source: event.filename,
      line: event.lineno,
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    trackError("browser.unhandled_rejection", event.reason);
  });

  // `visibilitychange` → hidden is the last moment a mobile browser reliably
  // gives you; `pagehide` covers desktop navigation away. Both are idempotent
  // because an empty queue sends nothing.
  const flushOnExit = () => flushClientLogs({ beacon: true });
  window.addEventListener("pagehide", flushOnExit);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushOnExit();
  });
}
