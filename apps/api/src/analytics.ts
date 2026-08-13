// One call site, two destinations.
//
// A user action is both a log line (Loki: "what did this process do, and when")
// and a product event (PostHog: "what are athletes doing"). Recording it twice
// by hand is how the two drift apart, so handlers call `track()` / `trackError()`
// and this decides where it goes.
//
// Not everything belongs in both. Diagnostics — `auth.unauthenticated`,
// `strava.request_failed`, `request.invalid`, a flaky progress poll — stay on
// `c.get("log")` directly: they say something about the server, not about the
// athlete, and in PostHog they would be noise you pay to store.
import type { Context } from "hono";
import { captureServerException, captureUserEvent } from "./posthog.js";
import type { AppEnv } from "./request-logger.js";

/**
 * Something an athlete did: logged with its `event` name and sent to PostHog
 * under the same name, attributed to whoever is signed in.
 *
 * Properties are logged as siblings of `event` (so a dashboard can group by
 * them) and sent as PostHog properties.
 */
export function track(
  c: Context<AppEnv>,
  event: string,
  properties: Record<string, unknown> = {},
  message?: string,
): void {
  c.get("log").info({ event, ...properties }, message ?? event);

  // Anonymous actions are still worth a log line, but PostHog wants people —
  // and every route that calls this has already identified the caller.
  const distinctId = c.get("userId");
  if (distinctId) captureUserEvent({ distinctId, event, properties });
}

/**
 * Something that broke while an athlete was trying to do something: an error
 * line with the stack, plus a PostHog exception so it shows up in Error
 * Tracking next to the events that led to it.
 */
export function trackError(
  c: Context<AppEnv>,
  event: string,
  err: unknown,
  properties: Record<string, unknown> = {},
  message?: string,
): void {
  c.get("log").error(
    { event, ...properties, err },
    message ?? (err instanceof Error ? err.message : event),
  );

  captureServerException(err, c.get("userId"), {
    event,
    ...properties,
    requestId: c.get("requestId"),
    route: c.req.routePath,
  });
}
