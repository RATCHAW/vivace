// Request-scoped logging: one `http_request` line per request, plus the
// per-request child logger that every handler logs through.
//
// This is where "who did what" comes from — the line carries the route, the
// status, how long it took and, once a handler has identified the caller,
// `userId`. Grafana's "user actions" table is a filter over these lines.
import { randomUUID } from "node:crypto";
import type { Context, MiddlewareHandler } from "hono";
import type { Logger } from "pino";
import { logger } from "./logger.js";

/**
 * The Hono environment for this app. `OpenAPIHono<AppEnv>` threads it through
 * every handler, so `c.get("log")` is typed.
 */
export interface AppEnv {
  Variables: {
    /** Echoed back as `x-request-id`; ties a client report to server lines. */
    requestId: string;
    /** `logger` bound to this request — always prefer it over `logger`. */
    log: Logger;
    /** Set by handlers once the session is read; absent when signed out. */
    userId?: string;
  };
}

/** Health checks are constant traffic and no signal — log them at debug. */
const QUIET_PATHS = new Set(["/health"]);

export const requestLogger: MiddlewareHandler<AppEnv> = async (c, next) => {
  // Honour an inbound id so a proxy's or the browser's id survives the hop.
  const requestId = c.req.header("x-request-id") ?? randomUUID();
  const started = performance.now();

  c.set("requestId", requestId);
  c.set("log", logger.child({ requestId }));
  c.header("x-request-id", requestId);

  try {
    await next();
  } catch (err) {
    // The response is produced by app.onError; the summary line belongs here
    // so that every request gets exactly one, whatever the outcome.
    complete(c, started, 500, err);
    throw err;
  }

  complete(c, started, c.res.status);
};

function complete(
  c: Context<AppEnv>,
  started: number,
  status: number,
  err?: unknown,
): void {
  const log = c.get("log") ?? logger;
  const fields = {
    event: "http_request",
    method: c.req.method,
    // The template (`/api/runs/:id/render`), so a dashboard can group by route
    // instead of by every activity id that has ever been rendered.
    route: c.req.routePath,
    path: c.req.path,
    status,
    durationMs: Math.round(performance.now() - started),
    userId: c.get("userId"),
    userAgent: c.req.header("user-agent"),
    ip: clientIp(c),
    ...(err ? { err } : {}),
  };

  const message = `${c.req.method} ${c.req.path} ${status}`;

  if (status >= 500) log.error(fields, message);
  else if (status >= 400) log.warn(fields, message);
  else if (QUIET_PATHS.has(c.req.path)) log.debug(fields, message);
  else log.info(fields, message);
}

/** Behind nginx the socket address is the proxy's, so trust the header first. */
function clientIp(c: Context<AppEnv>): string | undefined {
  const forwarded = c.req.header("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() ?? c.req.header("x-real-ip");
}

/**
 * Marks the caller on the request context so the `http_request` line — and
 * every later line from this request — is attributable to a user.
 */
export function identify(c: Context<AppEnv>, userId: string): void {
  c.set("userId", userId);
  c.set("log", c.get("log").child({ userId }));
}
