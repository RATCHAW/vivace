import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { swaggerUI } from "@hono/swagger-ui";
import type { Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { streamSSE } from "hono/streaming";
import {
  convertToModelMessages,
  createIdGenerator,
  stepCountIs,
  streamText,
  validateUIMessages,
  type UIMessage,
} from "ai";
import { DEFAULT_TEMPLATE_ID, DEFAULT_THEME, getTemplate } from "@repo/video";
import { auth } from "./auth.js";
import { track, trackError } from "./analytics.js";
import { logger } from "./logger.js";
import { captureServerException, isFeatureEnabledFor } from "./posthog.js";
import { observeTurn, POSTHOG_SESSION_HEADER } from "./ai-observability.js";
import { identify, requestLogger, type AppEnv } from "./request-logger.js";
import {
  AthleteSchema,
  ClientLogAcceptedSchema,
  ClientLogBatchSchema,
  CoachBriefingSchema,
  CoachChatRequestSchema,
  CoachContextPatchSchema,
  CoachContextSchema,
  CoachPlanSchema,
  CoachThreadDetailSchema,
  CoachThreadSchema,
  type CoachThreadDetail,
  ErrorSchema,
  HealthSchema,
  PlanProgressSchema,
  RunRenderOptionsSchema,
  type RunRenderOptions,
  RunRenderStateSchema,
  RunSchema,
  RunStreamsSchema,
  StravaEventSchema,
  VideoTemplateSchema,
  type ClientLogLevel,
  type StravaEvent,
} from "./schemas.js";
import {
  fetchAthlete,
  fetchRun,
  fetchRuns,
  fetchRunStreams,
  StravaApiError,
} from "./strava.js";
import {
  fetchLambdaProgress,
  renderPropsHash,
  resolveRenderTarget,
  startLambdaRender,
} from "./render.js";
import {
  getRunRender,
  saveStartedRender,
  toRunRender,
  updateRunRender,
} from "./render-store.js";
import {
  attachedRun,
  COACH_NOT_CONFIGURED,
  coachFailure,
  coachMessageMetadataSchema,
  coachSystemPrompt,
  createCoachTools,
  dropUnannouncedToolInput,
  getCoachConfig,
  type CoachFailure,
} from "./coach.js";
import { buildBriefing, todayLocal } from "./briefing.js";
import { saveContext, savePlan } from "./coach-store.js";
import { planProgress } from "./training.js";
import { postRunDebrief } from "./debrief.js";
import {
  claimEvent,
  pruneEvents,
  userForAthlete,
  verifyWebhookSignature,
  verifyToken,
  WEBHOOK_PATH,
  webhookSigningSecret,
} from "./webhook.js";
import {
  createThread,
  deleteThread,
  findDebrief,
  getMessages,
  getThread,
  listThreads,
  saveMessage,
  setTitleIfUnset,
  titleFrom,
  truncateForRegenerate,
} from "./chat-store.js";

/** Where the OpenAPI document and Swagger UI live. */
export const OPENAPI_DOCUMENT_PATH = "/api/openapi.json";
export const SWAGGER_UI_PATH = "/api/docs";

/**
 * Fed to `app.doc31()` at runtime and to `scripts/emit-openapi.ts` at build
 * time, so the served document and the committed one can't drift.
 */
export const openAPIConfig = {
  openapi: "3.1.0",
  info: {
    title: "Strava Login App API",
    version: "0.0.0",
    description:
      "Sign in with Strava, then read your profile. Requests are authenticated " +
      "with the better-auth session cookie, so 'Try it out' works from a browser " +
      "that is already signed in. The auth endpoints themselves (/api/auth/*) are " +
      "documented separately at /api/auth/reference.",
  },
  // Relative so the document is correct behind the Vite dev proxy, nginx, and
  // a direct hit on the API port alike.
  servers: [{ url: "/", description: "Same origin" }],
  tags: [
    { name: "Meta", description: "Liveness and documentation" },
    { name: "Athlete", description: "The signed-in athlete's Strava profile" },
    {
      name: "Runs",
      description: "The signed-in athlete's runs and their streams",
    },
    { name: "Coach", description: "Conversations with the AI running coach" },
    {
      name: "Webhooks",
      description:
        "Strava push subscription callbacks — called by Strava, not the browser",
    },
    {
      name: "Telemetry",
      description: "Browser events and errors, forwarded to Loki",
    },
  ],
};

export const app = new OpenAPIHono<AppEnv>({
  // Without a hook, a request that fails schema validation gets Zod's own
  // error body and no log line. Both are fixed here, for every route at once.
  defaultHook: (result, c) => {
    if (result.success) return;
    c.get("log").warn(
      {
        event: "request.invalid",
        route: c.req.routePath,
        issues: result.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
      "Request failed validation",
    );
    return c.json({ error: "Invalid request" }, 400);
  },
});

// First in the chain so every request — including the mounted better-auth
// routes and anything that throws — produces exactly one `http_request` line.
app.use("*", requestLogger);

app.use(
  "*",
  secureHeaders({
    // The browser normally reaches the API through a same-origin proxy, but
    // direct CORS access remains supported for explicitly trusted origins.
    crossOriginResourcePolicy: "cross-origin",
    referrerPolicy: "strict-origin-when-cross-origin",
    xFrameOptions: "DENY",
    permissionsPolicy: {
      camera: [],
      microphone: [],
      geolocation: [],
    },
  }),
);

// File attachments are base64-encoded inside coach messages, so legitimate
// requests need more room than a conventional JSON API. They still get a hard
// ceiling before parsing, while narrower public endpoints add tighter limits.
app.use(
  "/api/*",
  bodyLimit({
    maxSize: 16 * 1024 * 1024,
    onError: (c) => c.json({ error: "Request body too large" }, 413),
  }),
);

app.onError((err, c) => {
  // The request logger already emitted the summary line; this one carries the
  // stack, which is the thing you actually want in Grafana when a 500 shows up.
  // Falls back to the bare logger: this is the last line of defence, so it must
  // not itself depend on the middleware having run.
  (c.get("log") ?? logger).error(
    { event: "unhandled_error", route: c.req.routePath, err },
    err.message,
  );
  captureServerException(err, c.get("userId"), {
    event: "unhandled_error",
    route: c.req.routePath,
    requestId: c.get("requestId"),
  });
  return c.json({ error: "Internal server error" }, 500);
});

app.use(
  "/api/*",
  cors({
    origin: process.env.WEB_ORIGIN ?? "http://localhost:5173",
    credentials: true,
  }),
);

// better-auth owns its own routes (and its own OpenAPI document — see the
// openAPI() plugin in auth.ts), so they are mounted rather than described here.
app.on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw));

app.openAPIRegistry.registerComponent("securitySchemes", "sessionCookie", {
  type: "apiKey",
  in: "cookie",
  name: "better-auth.session_token",
  description: "Set by better-auth after the Strava OAuth callback.",
});

/**
 * The session behind the request, or null when there isn't one.
 *
 * Also stamps the caller onto the request context, which is what puts `userId`
 * on the `http_request` line and on every later line the handler logs.
 */
async function currentUser(c: Context<AppEnv>) {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) {
    c.get("log").info(
      { event: "auth.unauthenticated", route: c.req.routePath },
      "Request without a session",
    );
    return null;
  }
  identify(c, session.user.id);
  return session;
}

/**
 * The stored Strava token for a user, refreshed by better-auth when expired.
 * A refresh that fails is an expired grant, not a server fault — the caller
 * turns null into a 401 telling the athlete to sign in again.
 */
async function stravaAccessToken(
  c: Context<AppEnv>,
  userId: string,
): Promise<string | null> {
  try {
    const { accessToken } = await auth.api.getAccessToken({
      body: { providerId: "strava", userId },
    });
    if (!accessToken) {
      c.get("log").warn(
        { event: "auth.strava_token_missing" },
        "No Strava token",
      );
      return null;
    }
    return accessToken;
  } catch (err) {
    c.get("log").error(
      { event: "auth.strava_token_refresh_failed", err },
      "Could not refresh the Strava token",
    );
    return null;
  }
}

/**
 * The same token lookup, for work that has no request behind it.
 *
 * The webhook processes an event after the response has gone, so there is no
 * `Context` to log through and no caller to return a 401 to.
 */
async function stravaTokenFor(userId: string): Promise<string | null> {
  try {
    const { accessToken } = await auth.api.getAccessToken({
      body: { providerId: "strava", userId },
    });
    return accessToken ?? null;
  } catch (err) {
    logger.error(
      { event: "auth.strava_token_refresh_failed", userId, err },
      "Could not refresh the Strava token",
    );
    return null;
  }
}

/** One place to record an upstream Strava failure before it becomes a 4xx/5xx. */
function logStravaFailure(
  c: Context<AppEnv>,
  err: unknown,
  action: string,
): void {
  if (err instanceof StravaApiError) {
    const missingScope = err.status === 401 || err.status === 403;
    c.get("log").warn(
      {
        event: "strava.request_failed",
        action,
        status: err.status,
        missingScope,
      },
      `Strava rejected ${action}`,
    );
    return;
  }
  c.get("log").error(
    { event: "strava.request_failed", action, err },
    `${action} failed`,
  );
}

const healthRoute = createRoute({
  method: "get",
  path: "/health",
  operationId: "getHealth",
  tags: ["Meta"],
  summary: "Liveness probe",
  responses: {
    200: {
      description: "The API is up.",
      content: { "application/json": { schema: HealthSchema } },
    },
  },
});

app.openapi(healthRoute, (c) => c.json({ status: "ok" } as const, 200));

const athleteRoute = createRoute({
  method: "get",
  path: "/api/me/strava",
  operationId: "getStravaAthlete",
  tags: ["Athlete"],
  summary: "Get the signed-in athlete",
  description:
    "Reads the session, takes the stored Strava access token (refreshing it when " +
    "expired), and proxies GET /athlete from the Strava API.",
  security: [{ sessionCookie: [] }],
  responses: {
    200: {
      description: "The athlete's Strava profile.",
      content: { "application/json": { schema: AthleteSchema } },
    },
    401: {
      description: "No valid session.",
      content: { "application/json": { schema: ErrorSchema } },
    },
    502: {
      description: "Strava rejected or failed the upstream request.",
      content: { "application/json": { schema: ErrorSchema } },
    },
  },
});

app.openapi(athleteRoute, async (c) => {
  const session = await currentUser(c);
  if (!session) return c.json({ error: "Not signed in" }, 401);

  const accessToken = await stravaAccessToken(c, session.user.id);
  if (!accessToken) return c.json({ error: "No Strava access token" }, 401);

  try {
    return c.json(await fetchAthlete(accessToken), 200);
  } catch (err) {
    logStravaFailure(c, err, "fetch athlete");
    if (err instanceof StravaApiError)
      return c.json({ error: err.message }, 502);
    throw err;
  }
});

// Reading activities needs the activity:read scope, so a 401/403 from Strava
// means the stored token predates it — the fix is signing out and back in.
const MISSING_SCOPE_ERROR =
  "Strava denied access. Sign out and back in to grant activity permissions.";

const runsRoute = createRoute({
  method: "get",
  path: "/api/me/runs",
  operationId: "getRuns",
  tags: ["Runs"],
  summary: "List the signed-in athlete's runs",
  description:
    "Proxies GET /athlete/activities from the Strava API and keeps only " +
    "run-type activities (Run, TrailRun, VirtualRun).",
  security: [{ sessionCookie: [] }],
  responses: {
    200: {
      description: "The athlete's runs, most recent first.",
      content: { "application/json": { schema: z.array(RunSchema) } },
    },
    401: {
      description: "No valid session.",
      content: { "application/json": { schema: ErrorSchema } },
    },
    403: {
      description:
        "The stored Strava token lacks the activity:read scope; sign out and back in.",
      content: { "application/json": { schema: ErrorSchema } },
    },
    502: {
      description: "Strava rejected or failed the upstream request.",
      content: { "application/json": { schema: ErrorSchema } },
    },
  },
});

app.openapi(runsRoute, async (c) => {
  const session = await currentUser(c);
  if (!session) return c.json({ error: "Not signed in" }, 401);

  const accessToken = await stravaAccessToken(c, session.user.id);
  if (!accessToken) return c.json({ error: "No Strava access token" }, 401);

  try {
    const runs = await fetchRuns(accessToken);
    track(c, "runs.listed", { count: runs.length }, "Listed runs");
    return c.json(runs, 200);
  } catch (err) {
    logStravaFailure(c, err, "list runs");
    if (err instanceof StravaApiError) {
      if (err.status === 401 || err.status === 403) {
        return c.json({ error: MISSING_SCOPE_ERROR }, 403);
      }
      return c.json({ error: err.message }, 502);
    }
    throw err;
  }
});

const runStreamsRoute = createRoute({
  method: "get",
  path: "/api/runs/{id}/streams",
  operationId: "getRunStreams",
  tags: ["Runs"],
  summary: "Get one run's GPS and sensor streams",
  description:
    "Proxies GET /activities/{id}/streams from the Strava API. Activities " +
    "without streams (e.g. manual entries) yield an empty object.",
  security: [{ sessionCookie: [] }],
  request: {
    // Path segments are strings on the wire; the handler converts.
    params: z.object({
      id: z
        .string()
        .regex(/^\d+$/)
        .openapi({
          param: { name: "id", in: "path" },
          example: "987654321",
        }),
    }),
  },
  responses: {
    200: {
      description: "The run's streams, keyed by type.",
      content: { "application/json": { schema: RunStreamsSchema } },
    },
    401: {
      description: "No valid session.",
      content: { "application/json": { schema: ErrorSchema } },
    },
    403: {
      description:
        "The stored Strava token lacks the activity:read scope; sign out and back in.",
      content: { "application/json": { schema: ErrorSchema } },
    },
    502: {
      description: "Strava rejected or failed the upstream request.",
      content: { "application/json": { schema: ErrorSchema } },
    },
  },
});

app.openapi(runStreamsRoute, async (c) => {
  const session = await currentUser(c);
  if (!session) return c.json({ error: "Not signed in" }, 401);

  const accessToken = await stravaAccessToken(c, session.user.id);
  if (!accessToken) return c.json({ error: "No Strava access token" }, 401);

  const { id } = c.req.valid("param");
  try {
    return c.json(await fetchRunStreams(accessToken, Number(id)), 200);
  } catch (err) {
    logStravaFailure(c, err, "fetch run streams");
    if (err instanceof StravaApiError) {
      if (err.status === 401 || err.status === 403) {
        return c.json({ error: MISSING_SCOPE_ERROR }, 403);
      }
      return c.json({ error: err.message }, 502);
    }
    throw err;
  }
});

// Path segments are strings on the wire; the handlers convert.
const RunIdParamsSchema = z.object({
  id: z
    .string()
    .regex(/^\d+$/)
    .openapi({
      param: { name: "id", in: "path" },
      example: "987654321",
    }),
});

const RENDER_NOT_CONFIGURED =
  "Video rendering is not configured. Deploy Remotion Lambda " +
  "(pnpm video:deploy) and set REMOTION_FUNCTION_NAME / " +
  "REMOTION_SERVE_URL in apps/api/.env.";

/** Which template's render a GET is about. A run holds one per template, so
 *  asking without saying which means the default cut. */
const TemplateQuerySchema = z.object({
  template: VideoTemplateSchema.default(DEFAULT_TEMPLATE_ID).openapi({
    param: { name: "template", in: "query", required: false },
  }),
});

/**
 * The PostHog flag that can switch rendering off — per athlete, or for
 * everyone — without a deploy. The browser reads the same flag to hide the
 * button (see RenderControls); this check is what actually enforces it.
 */
export const RENDER_FLAG = "video-render";

const RENDER_DISABLED =
  "Video rendering is temporarily switched off. It should be back shortly.";

const getRunRenderRoute = createRoute({
  method: "get",
  path: "/api/runs/{id}/render",
  operationId: "getRunRender",
  tags: ["Runs"],
  summary: "Get one run's stored render",
  description:
    "Reads the persisted render state for this run, athlete and template. " +
    "`render` is null when this run has never been rendered with this " +
    "template. While a render is in flight, live progress comes from the SSE " +
    "endpoint, which also keeps this state up to date.",
  security: [{ sessionCookie: [] }],
  request: { params: RunIdParamsSchema, query: TemplateQuerySchema },
  responses: {
    200: {
      description: "The stored render, or null if none exists.",
      content: { "application/json": { schema: RunRenderStateSchema } },
    },
    401: {
      description: "No valid session.",
      content: { "application/json": { schema: ErrorSchema } },
    },
  },
});

app.openapi(getRunRenderRoute, async (c) => {
  const session = await currentUser(c);
  if (!session) return c.json({ error: "Not signed in" }, 401);

  const { id } = c.req.valid("param");
  const { template } = c.req.valid("query");
  const row = await getRunRender(session.user.id, Number(id), template);
  return c.json({ render: row ? toRunRender(row) : null }, 200);
});

const startRunRenderRoute = createRoute({
  method: "post",
  path: "/api/runs/{id}/render",
  operationId: "startRunRender",
  tags: ["Runs"],
  summary: "Render this run's video on Remotion Lambda",
  description:
    "Fetches the run and its streams from Strava, starts a Remotion Lambda " +
    "render of the chosen template, and persists the render state. The MP4 " +
    "lands in the Remotion S3 bucket. Idempotent while a render is in flight " +
    "or already done with the same options — those return the existing state; " +
    "a failed render, or one whose options no longer match, is rendered again. " +
    "Each template gets its own render, so switching template does not " +
    "replace the video already made with the last one. The body is optional " +
    "and defaults to the plain replay.",
  security: [{ sessionCookie: [] }],
  request: {
    params: RunIdParamsSchema,
    body: {
      content: { "application/json": { schema: RunRenderOptionsSchema } },
    },
  },
  responses: {
    200: {
      description: "The render that is now in flight (or already finished).",
      content: { "application/json": { schema: RunRenderStateSchema } },
    },
    401: {
      description: "No valid session.",
      content: { "application/json": { schema: ErrorSchema } },
    },
    403: {
      description:
        "The stored Strava token lacks the activity:read scope; sign out and back in.",
      content: { "application/json": { schema: ErrorSchema } },
    },
    502: {
      description: "Strava or Lambda failed the upstream request.",
      content: { "application/json": { schema: ErrorSchema } },
    },
    503: {
      description:
        "Remotion Lambda is not configured on this server, or rendering is " +
        "switched off for this athlete by the `video-render` feature flag.",
      content: { "application/json": { schema: ErrorSchema } },
    },
  },
});

app.openapi(startRunRenderRoute, async (c) => {
  const session = await currentUser(c);
  if (!session) return c.json({ error: "Not signed in" }, 401);

  const log = c.get("log");

  const { id } = c.req.valid("param");
  const activityId = Number(id);
  // The body is optional, so the validator — and with it the schema's defaults —
  // is skipped entirely when a caller posts nothing.
  const body: RunRenderOptions | undefined = c.req.valid("json");
  const template = body?.template ?? DEFAULT_TEMPLATE_ID;
  // A template that draws no runner has nothing to put a face on, so the option
  // is dropped here rather than stored as an answer that changed nothing.
  const showAvatar =
    (body?.show_avatar ?? false) && getTemplate(template).supportsAvatar;
  // Same rule for the look: a template whose plate isn't ours to re-tint stores
  // the default rather than an answer that changed nothing.
  const theme = getTemplate(template).supportsTheme
    ? (body?.theme ?? DEFAULT_THEME)
    : DEFAULT_THEME;
  const options = { showAvatar, theme };

  const target = resolveRenderTarget(template);
  if (!target) {
    log.warn(
      { event: "render.not_configured", template },
      "Remotion Lambda is not configured",
    );
    return c.json({ error: RENDER_NOT_CONFIGURED }, 503);
  }

  // A Lambda render is the one thing here that costs real money per click, so
  // it gets a kill switch. Defaults to on: with PostHog absent, or the flag
  // never created, this is the behaviour the app shipped with.
  if (!(await isFeatureEnabledFor(RENDER_FLAG, session.user.id, true))) {
    log.warn(
      { event: "render.flag_off", flag: RENDER_FLAG },
      "Rendering is switched off",
    );
    return c.json({ error: RENDER_DISABLED }, 503);
  }

  // Don't double-render: an in-flight or finished render is simply returned —
  // unless it was made with different options, which makes it a different video.
  const propsHash = renderPropsHash(template, options);
  const existing = await getRunRender(session.user.id, activityId, template);
  if (
    existing &&
    existing.status !== "error" &&
    existing.propsHash === propsHash
  ) {
    track(
      c,
      "render.reused",
      { activityId, template, status: existing.status, showAvatar, theme },
      "Returned the existing render",
    );
    return c.json({ render: toRunRender(existing) }, 200);
  }

  const accessToken = await stravaAccessToken(c, session.user.id);
  if (!accessToken) return c.json({ error: "No Strava access token" }, 401);

  try {
    const [run, streams, athlete] = await Promise.all([
      fetchRun(accessToken, activityId),
      fetchRunStreams(accessToken, activityId),
      // Read from Strava rather than taken from the request: the browser does
      // not get to choose the picture that is baked into the video.
      showAvatar ? fetchAthlete(accessToken) : null,
    ]);
    const { renderId, bucketName } = await startLambdaRender(
      target,
      run,
      streams,
      athlete?.profile ?? "",
      theme,
    );
    const row = await saveStartedRender({
      userId: session.user.id,
      activityId,
      template,
      renderId,
      bucketName,
      region: target.region,
      functionName: target.functionName,
      serveUrl: target.serveUrl,
      options,
      propsHash,
    });
    track(
      c,
      "render.started",
      {
        activityId,
        template,
        renderId,
        bucketName,
        showAvatar,
        theme,
        retry: Boolean(existing),
      },
      "Started a Lambda render",
    );
    return c.json({ render: toRunRender(row) }, 200);
  } catch (err) {
    if (err instanceof StravaApiError) {
      logStravaFailure(c, err, "fetch the run to render");
      if (err.status === 401 || err.status === 403) {
        return c.json({ error: MISSING_SCOPE_ERROR }, 403);
      }
      return c.json({ error: err.message }, 502);
    }
    // Lambda refused the render (bad serve URL, missing AWS permissions, a
    // composition the deployed bundle doesn't hold, …).
    const message =
      err instanceof Error ? err.message : "Failed to start the render";
    trackError(
      c,
      "render.start_failed",
      err,
      { activityId, template, serveUrl: target.serveUrl },
      message,
    );
    return c.json({ error: message }, 502);
  }
});

const runRenderProgressRoute = createRoute({
  method: "get",
  path: "/api/runs/{id}/render/progress",
  operationId: "streamRunRenderProgress",
  tags: ["Runs"],
  summary: "Stream a render's progress (SSE)",
  description:
    "Server-sent events. While this run's render of the given template is in " +
    "flight, polls Remotion Lambda every ~1.5s, persists the result, and emits " +
    "the updated RunRender as a JSON message. The final message has status " +
    "`done` or `error`, after which the stream closes; a lone `null` message " +
    "means there is no render. Consumed with EventSource, not the generated " +
    "client.",
  security: [{ sessionCookie: [] }],
  request: { params: RunIdParamsSchema, query: TemplateQuerySchema },
  responses: {
    200: {
      description: "An event stream of RunRender JSON messages.",
      content: { "text/event-stream": { schema: z.string() } },
    },
    401: {
      description: "No valid session.",
      content: { "application/json": { schema: ErrorSchema } },
    },
    503: {
      description: "Remotion Lambda is not configured on this server.",
      content: { "application/json": { schema: ErrorSchema } },
    },
  },
});

const PROGRESS_POLL_MS = 1500;

app.openapi(runRenderProgressRoute, async (c) => {
  const session = await currentUser(c);
  if (!session) return c.json({ error: "Not signed in" }, 401);

  const log = c.get("log");
  const { id } = c.req.valid("param");
  const { template } = c.req.valid("query");
  const target = resolveRenderTarget(template);
  if (!target) {
    log.warn(
      { event: "render.not_configured", template },
      "Remotion Lambda is not configured",
    );
    return c.json({ error: RENDER_NOT_CONFIGURED }, 503);
  }

  const activityId = Number(id);
  const userId = session.user.id;

  return streamSSE(c, async (stream) => {
    let aborted = false;
    stream.onAbort(() => {
      aborted = true;
    });

    while (!aborted) {
      const row = await getRunRender(userId, activityId, template);
      if (!row) {
        // Nothing to watch — tell the client so it can close instead of
        // letting EventSource reconnect forever.
        await stream.writeSSE({ data: "null" });
        return;
      }
      if (row.status !== "rendering") {
        await stream.writeSSE({ data: JSON.stringify(toRunRender(row)) });
        return;
      }

      try {
        // The row's own function is what the render was started on; the
        // resolved target only covers rows written before it was recorded.
        const progress = await fetchLambdaProgress({
          region: row.region ?? target.region,
          functionName: row.functionName ?? target.functionName,
          renderId: row.renderId,
          bucketName: row.bucketName,
        });
        const updated = await updateRunRender(
          userId,
          activityId,
          template,
          progress,
        );
        await stream.writeSSE({ data: JSON.stringify(toRunRender(updated)) });
        if (updated.status !== "rendering") {
          const finished = {
            event: "render.finished",
            activityId,
            template,
            renderId: updated.renderId,
            status: updated.status,
            durationMs:
              updated.updatedAt.getTime() - updated.createdAt.getTime(),
            error: updated.error,
          };
          if (updated.status === "error") {
            trackError(
              c,
              "render.finished",
              new Error(updated.error ?? "Render failed on Lambda"),
              finished,
              "Render failed on Lambda",
            );
          } else {
            track(c, "render.finished", finished, "Render finished");
          }
          return;
        }
      } catch (err) {
        // A flaky poll is not a failed render — try again next tick. Logged
        // because a render that never finishes usually starts here.
        log.warn(
          { event: "render.progress_poll_failed", activityId, template, err },
          "Poll failed",
        );
      }
      await stream.sleep(PROGRESS_POLL_MS);
    }
  });
});

// --- Coach --------------------------------------------------------------------

const ThreadIdParamsSchema = z.object({
  id: z.string().openapi({
    param: { name: "id", in: "path" },
    example: "8f2c1e34-9a1b-4f6d-8f0e-3b6a1c9d2e77",
  }),
});

const listCoachThreadsRoute = createRoute({
  method: "get",
  path: "/api/coach/threads",
  operationId: "listCoachThreads",
  tags: ["Coach"],
  summary: "List the athlete's coach conversations",
  description:
    "Most recently used first. A thread with no messages has a null title.",
  security: [{ sessionCookie: [] }],
  responses: {
    200: {
      description: "The athlete's conversations.",
      content: { "application/json": { schema: z.array(CoachThreadSchema) } },
    },
    401: {
      description: "No valid session.",
      content: { "application/json": { schema: ErrorSchema } },
    },
  },
});

app.openapi(listCoachThreadsRoute, async (c) => {
  const session = await currentUser(c);
  if (!session) return c.json({ error: "Not signed in" }, 401);
  return c.json(await listThreads(session.user.id), 200);
});

const createCoachThreadRoute = createRoute({
  method: "post",
  path: "/api/coach/threads",
  operationId: "createCoachThread",
  tags: ["Coach"],
  summary: "Start a new coach conversation",
  description:
    "Returns an empty thread. Its title is filled in from the first message " +
    "the athlete sends to it.",
  security: [{ sessionCookie: [] }],
  responses: {
    201: {
      description: "The new conversation.",
      content: { "application/json": { schema: CoachThreadSchema } },
    },
    401: {
      description: "No valid session.",
      content: { "application/json": { schema: ErrorSchema } },
    },
  },
});

app.openapi(createCoachThreadRoute, async (c) => {
  const session = await currentUser(c);
  if (!session) return c.json({ error: "Not signed in" }, 401);
  return c.json(await createThread(session.user.id), 201);
});

const getCoachThreadRoute = createRoute({
  method: "get",
  path: "/api/coach/threads/{id}",
  operationId: "getCoachThread",
  tags: ["Coach"],
  summary: "Read one conversation",
  description: "The thread and its full transcript, oldest message first.",
  security: [{ sessionCookie: [] }],
  request: { params: ThreadIdParamsSchema },
  responses: {
    200: {
      description: "The conversation and its messages.",
      content: { "application/json": { schema: CoachThreadDetailSchema } },
    },
    401: {
      description: "No valid session.",
      content: { "application/json": { schema: ErrorSchema } },
    },
    404: {
      description: "No such conversation for this athlete.",
      content: { "application/json": { schema: ErrorSchema } },
    },
  },
});

app.openapi(getCoachThreadRoute, async (c) => {
  const session = await currentUser(c);
  if (!session) return c.json({ error: "Not signed in" }, 401);

  const { id } = c.req.valid("param");
  const thread = await getThread(session.user.id, id);
  if (!thread) return c.json({ error: "No such conversation" }, 404);

  // The stored parts are UIMessage parts; the schema describes them loosely.
  const messages = (await getMessages(id)) as CoachThreadDetail["messages"];
  return c.json({ thread, messages }, 200);
});

const deleteCoachThreadRoute = createRoute({
  method: "delete",
  path: "/api/coach/threads/{id}",
  operationId: "deleteCoachThread",
  tags: ["Coach"],
  summary: "Delete one conversation",
  description: "Removes the thread and every message in it.",
  security: [{ sessionCookie: [] }],
  request: { params: ThreadIdParamsSchema },
  responses: {
    204: { description: "Deleted." },
    401: {
      description: "No valid session.",
      content: { "application/json": { schema: ErrorSchema } },
    },
    404: {
      description: "No such conversation for this athlete.",
      content: { "application/json": { schema: ErrorSchema } },
    },
  },
});

app.openapi(deleteCoachThreadRoute, async (c) => {
  const session = await currentUser(c);
  if (!session) return c.json({ error: "Not signed in" }, 401);

  const { id } = c.req.valid("param");
  const deleted = await deleteThread(session.user.id, id);
  if (!deleted) return c.json({ error: "No such conversation" }, 404);
  return c.body(null, 204);
});

const coachBriefingRoute = createRoute({
  method: "get",
  path: "/api/coach/briefing",
  operationId: "getCoachBriefing",
  tags: ["Coach"],
  summary: "The coach's read on the athlete, before they ask anything",
  description:
    "Everything the Coach screen's rails show: the goal race the coach " +
    "remembers, this week's accepted plan measured against what was actually " +
    "run, the measured training signals (load ratio, easy-run intensity, " +
    "aerobic decoupling, shoe mileage) and the queue of things worth asking " +
    "about. Signals that cannot be computed from the athlete's data are " +
    "omitted rather than returned empty.",
  security: [{ sessionCookie: [] }],
  responses: {
    200: {
      description: "The athlete's briefing.",
      content: { "application/json": { schema: CoachBriefingSchema } },
    },
    401: {
      description: "No valid session.",
      content: { "application/json": { schema: ErrorSchema } },
    },
    403: {
      description:
        "The stored Strava token lacks the activity:read scope; sign out and back in.",
      content: { "application/json": { schema: ErrorSchema } },
    },
    502: {
      description: "Strava rejected or failed the upstream request.",
      content: { "application/json": { schema: ErrorSchema } },
    },
  },
});

app.openapi(coachBriefingRoute, async (c) => {
  const session = await currentUser(c);
  if (!session) return c.json({ error: "Not signed in" }, 401);

  const accessToken = await stravaAccessToken(c, session.user.id);
  if (!accessToken) return c.json({ error: "No Strava access token" }, 401);

  try {
    const briefing = await buildBriefing(accessToken, session.user.id);
    track(
      c,
      "coach.briefing_built",
      {
        signals: briefing.signals.length,
        queue: briefing.queue.length,
        hasPlan: briefing.plan !== null,
      },
      "Built the coach briefing",
    );
    return c.json(briefing, 200);
  } catch (err) {
    logStravaFailure(c, err, "build coach briefing");
    if (err instanceof StravaApiError) {
      if (err.status === 401 || err.status === 403) {
        return c.json({ error: MISSING_SCOPE_ERROR }, 403);
      }
      return c.json({ error: err.message }, 502);
    }
    throw err;
  }
});

const updateCoachContextRoute = createRoute({
  method: "put",
  path: "/api/coach/context",
  operationId: "updateCoachContext",
  tags: ["Coach"],
  summary: "Change what the coach remembers between threads",
  description:
    "Merges into the stored context. An omitted field is left alone; a field " +
    "sent as null is cleared — that is the difference between changing the " +
    "target time and dropping the race. The coach writes here too, through " +
    "its setAthleteContext tool.",
  security: [{ sessionCookie: [] }],
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: CoachContextPatchSchema } },
    },
  },
  responses: {
    200: {
      description: "The context after the change.",
      content: { "application/json": { schema: CoachContextSchema } },
    },
    401: {
      description: "No valid session.",
      content: { "application/json": { schema: ErrorSchema } },
    },
  },
});

app.openapi(updateCoachContextRoute, async (c) => {
  const session = await currentUser(c);
  if (!session) return c.json({ error: "Not signed in" }, 401);

  const patch = c.req.valid("json");
  const context = await saveContext(session.user.id, patch);
  track(
    c,
    "coach.context_updated",
    { fields: Object.keys(patch) },
    "Athlete context updated",
  );
  return c.json(context, 200);
});

const acceptCoachPlanRoute = createRoute({
  method: "post",
  path: "/api/coach/plan",
  operationId: "acceptCoachPlan",
  tags: ["Coach"],
  summary: "Accept a week the coach proposed",
  description:
    "Stores the seven sessions as the athlete's week and returns them measured " +
    "against what they have already run. Accepting again for the same week " +
    "replaces it, which is what a revision is.",
  security: [{ sessionCookie: [] }],
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: CoachPlanSchema } },
    },
  },
  responses: {
    200: {
      description: "The accepted week, against what was actually run.",
      content: { "application/json": { schema: PlanProgressSchema } },
    },
    401: {
      description: "No valid session.",
      content: { "application/json": { schema: ErrorSchema } },
    },
    403: {
      description:
        "The stored Strava token lacks the activity:read scope; sign out and back in.",
      content: { "application/json": { schema: ErrorSchema } },
    },
    502: {
      description: "Strava rejected or failed the upstream request.",
      content: { "application/json": { schema: ErrorSchema } },
    },
  },
});

app.openapi(acceptCoachPlanRoute, async (c) => {
  const session = await currentUser(c);
  if (!session) return c.json({ error: "Not signed in" }, 401);

  const accessToken = await stravaAccessToken(c, session.user.id);
  if (!accessToken) return c.json({ error: "No Strava access token" }, 401);

  const plan = await savePlan(session.user.id, c.req.valid("json"));
  track(
    c,
    "coach.plan_accepted",
    { weekStarting: plan.week_starting, sessions: plan.sessions.length },
    "Week accepted",
  );

  try {
    const runs = await fetchRuns(accessToken);
    return c.json(
      {
        ...planProgress(plan.sessions, runs, plan.week_starting, todayLocal()),
        label: plan.label,
      },
      200,
    );
  } catch (err) {
    logStravaFailure(c, err, "measure the accepted plan");
    if (err instanceof StravaApiError) {
      if (err.status === 401 || err.status === 403) {
        return c.json({ error: MISSING_SCOPE_ERROR }, 403);
      }
      return c.json({ error: err.message }, 502);
    }
    throw err;
  }
});

/** Enough room for a few tool calls and the answer that follows them. */
const COACH_MAX_STEPS = 8;

const coachChatRoute = createRoute({
  method: "post",
  path: "/api/coach/chat",
  operationId: "coachChat",
  tags: ["Coach"],
  summary: "Send a message and stream the coach's reply",
  description:
    "Loads the thread's transcript, appends the incoming message, and streams " +
    "the model's answer as an AI SDK UI message stream — text, reasoning and " +
    "tool calls as they happen. Both the athlete's message and the finished " +
    "reply are persisted, so the browser never has to send the history back. " +
    "Consumed by `useChat` from @ai-sdk/react, not by the generated client.",
  security: [{ sessionCookie: [] }],
  request: {
    body: {
      content: { "application/json": { schema: CoachChatRequestSchema } },
    },
  },
  responses: {
    200: {
      description:
        "A UI message stream of the coach's reply. A turn that fails after " +
        "the stream is open ends in an error chunk carrying a `CoachFailure` " +
        "reason — `rate_limited`, `unavailable`, `failed` — never the " +
        "provider's own message.",
      content: { "text/event-stream": { schema: z.string() } },
    },
    400: {
      description: "The request named no message to answer.",
      content: { "application/json": { schema: ErrorSchema } },
    },
    401: {
      description: "No valid session.",
      content: { "application/json": { schema: ErrorSchema } },
    },
    404: {
      description: "No such conversation for this athlete.",
      content: { "application/json": { schema: ErrorSchema } },
    },
    503: {
      description:
        "No model API key is configured on this server; `error` is the " +
        "`not_configured` reason, and the instructions are in the server log.",
      content: { "application/json": { schema: ErrorSchema } },
    },
  },
});

app.openapi(coachChatRoute, async (c) => {
  const session = await currentUser(c);
  if (!session) return c.json({ error: "Not signed in" }, 401);

  const log = c.get("log");
  const config = getCoachConfig();
  if (!config) {
    // The instructions are for whoever runs the server, so they go to the log.
    // The athlete gets the reason and apps/web writes the sentence.
    log.warn({ event: "coach.not_configured" }, COACH_NOT_CONFIGURED);
    return c.json({ error: "not_configured" satisfies CoachFailure }, 503);
  }

  const body = c.req.valid("json");
  const thread = await getThread(session.user.id, body.thread_id);
  if (!thread) return c.json({ error: "No such conversation" }, 404);

  const accessToken = await stravaAccessToken(c, session.user.id);
  if (!accessToken) return c.json({ error: "No Strava access token" }, 401);

  // A rewritten question: a submit that names a message already in the
  // transcript, rather than adding one to the end of it.
  const editedMessageId =
    body.trigger === "regenerate-message" ? undefined : body.message_id;

  if (body.trigger === "regenerate-message") {
    if (body.message_id) {
      await truncateForRegenerate(thread.id, body.message_id);
    }
  } else {
    if (!body.message) return c.json({ error: "No message to answer" }, 400);
    // `validateUIMessages` is the SDK's own guard against a malformed parts
    // array reaching the model — the OpenAPI schema only checks the envelope.
    // The metadata schema has to be named or the attached run is dropped.
    const [message] = await validateUIMessages({
      messages: [body.message],
      metadataSchema: coachMessageMetadataSchema,
    });
    // The browser cut its own transcript at the message being replaced before
    // it sent this; the stored one has to land in the same place, or the model
    // would answer a question it can still see the old wording of. The row for
    // the question itself survives — `saveMessage` writes the new words over
    // it, keeping its place in the conversation.
    if (editedMessageId) {
      await truncateForRegenerate(thread.id, editedMessageId);
    }
    await saveMessage(thread.id, message);
    const title = titleFrom(message);
    if (title) await setTitleIfUnset(thread.id, title);
  }

  const messages: UIMessage[] = await getMessages(thread.id);

  // The interesting part of a coach turn isn't in the URL: which thread, and
  // whether the athlete asked something new, rewrote the question, or re-rolled
  // the last answer.
  track(
    c,
    "coach.turn_started",
    {
      threadId: thread.id,
      trigger: body.trigger,
      edited: editedMessageId !== undefined,
      messages: messages.length,
    },
    "Answering a coach turn",
  );

  const today = todayLocal();

  // Every model call and every tool call in this answer, into PostHog's LLM
  // analytics as one trace. The session header is what links it to the replay
  // of the athlete sitting there waiting for it; the thread is what groups the
  // turn with the rest of the conversation.
  const turn = observeTurn({
    distinctId: session.user.id,
    name: "coach turn",
    streamed: true,
    conversationId: thread.id,
    replaySessionId: c.req.header(POSTHOG_SESSION_HEADER),
    properties: {
      thread_id: thread.id,
      trigger: body.trigger,
      range_weeks: body.range_weeks,
    },
  });

  const result = streamText({
    model: config.model,
    system: coachSystemPrompt(today, body.range_weeks, attachedRun(messages)),
    messages: await convertToModelMessages(messages),
    tools: createCoachTools({
      accessToken,
      userId: session.user.id,
      today,
      rangeWeeks: body.range_weeks,
    }),
    // Every tool call costs a round trip; the cap keeps a confused model from
    // looping through the athlete's whole history.
    stopWhen: stepCountIs(COACH_MAX_STEPS),
    // A gateway routes to whatever upstream it likes, and not all of them
    // announce a tool call before streaming its arguments. Diagnostics, not
    // analytics: this describes the provider, not the athlete.
    experimental_transform: dropUnannouncedToolInput((toolCallId) => {
      log.warn(
        {
          event: "coach.tool_input_unannounced",
          toolCallId,
          modelId: config.modelId,
        },
        "Dropped tool arguments the model stream never announced",
      );
    }),
    ...turn.callbacks,
    onFinish: ({ text }) => {
      turn.end({ input: messages, output: text });
    },
    // A model that never answered. `toUIMessageStreamResponse`'s onError below
    // is what the athlete sees; this is what the trace records.
    onError: ({ error }) => {
      turn.end({ input: messages, error });
    },
    // Only reachable if something ever passes an abort signal — nothing does
    // today, and the athlete's stop button doesn't: it closes the browser's end
    // of the stream, which the server never hears about. `onEnd` below is what
    // covers that case.
    onAbort: () => {
      turn.end({ input: messages, properties: { cut_short: true } });
    },
  });

  return result.toUIMessageStreamResponse({
    // With the transcript attached the SDK reuses ids on regenerate, which is
    // what makes `saveMessage`'s upsert replace rather than duplicate.
    originalMessages: messages,
    generateMessageId: createIdGenerator({ prefix: "msg", size: 16 }),
    // The trace this answer is being written under, sent with the first chunk
    // and stored on the message. It is what lets the athlete's thumbs-down
    // reach the same trace in PostHog as the tokens and tool calls that
    // produced the answer — a rating that doesn't name a trace is a number
    // with nothing to explain it.
    messageMetadata: ({ part }) =>
      part.type === "start" ? { trace_id: turn.traceId } : undefined,
    onEnd: async ({ responseMessage }) => {
      await saveMessage(thread.id, responseMessage);
      track(
        c,
        "coach.turn_finished",
        { threadId: thread.id },
        "Coach answered",
      );
      // The only callback that runs whatever happened. An answer the athlete
      // stopped reaches *nothing* above — not onFinish, not onAbort, because
      // cancelling the response stream isn't an abort as far as `streamText` is
      // concerned — so without this the turn's generations and tool spans would
      // hang under a trace that never arrives.
      //
      // `end` files once, and by here the two callbacks that beat it to it have
      // already run (onFinish on the way out, onError during generation), so
      // `cut_short` marks exactly the turns nothing else finished.
      turn.end({
        input: messages,
        output: responseMessage,
        properties: { cut_short: true },
      });
    },
    onError: (error) => {
      // The default swallows everything as "An error occurred." — a coach that
      // can't reach its model should say why, to the athlete and to Grafana.
      // The stream is already open, so this never becomes a 5xx: without a log
      // line a failing model is invisible on the server.
      trackError(
        c,
        "coach.turn_failed",
        error,
        { threadId: thread.id },
        "Coach failed",
      );
      // The reason, not the provider's sentence. "Insufficient credits — top up
      // at llmgateway.io/billing" is a message to whoever holds the key, and it
      // went to the line above.
      return coachFailure(error);
    },
  });
});

// --- Strava webhook -----------------------------------------------------------
// Both of these are called by Strava, never by the browser, so neither carries
// a session. See webhook.ts for the two-second budget both of them work to.

const webhookValidationRoute = createRoute({
  method: "get",
  path: WEBHOOK_PATH,
  operationId: "validateStravaWebhook",
  tags: ["Webhooks"],
  summary: "Answer Strava's subscription challenge",
  description:
    "Strava calls this while `POST /push_subscriptions` is in flight and " +
    'expects `{ "hub.challenge": … }` back within two seconds. The challenge ' +
    "is only echoed when `hub.verify_token` matches the server's " +
    "STRAVA_WEBHOOK_VERIFY_TOKEN, so somebody else's subscription cannot point " +
    "at this callback.",
  request: {
    query: z.object({
      "hub.mode": z.string().openapi({ example: "subscribe" }),
      "hub.challenge": z
        .string()
        .openapi({ example: "15f7d1a91c1f40f8a748fd134752feb3" }),
      "hub.verify_token": z.string(),
    }),
  },
  responses: {
    200: {
      description: "The challenge, echoed.",
      content: {
        "application/json": {
          schema: z.object({ "hub.challenge": z.string() }),
        },
      },
    },
    403: {
      description: "The verify token did not match, or none is configured.",
      content: { "application/json": { schema: ErrorSchema } },
    },
  },
});

app.openapi(webhookValidationRoute, (c) => {
  const query = c.req.valid("query");
  const expected = verifyToken();
  const log = c.get("log");

  if (!expected) {
    log.error(
      { event: "webhook.no_verify_token" },
      "STRAVA_WEBHOOK_VERIFY_TOKEN is not set; refusing to validate",
    );
    return c.json({ error: "Webhooks are not configured on this server" }, 403);
  }

  if (
    query["hub.mode"] !== "subscribe" ||
    query["hub.verify_token"] !== expected
  ) {
    log.warn(
      { event: "webhook.validation_rejected", mode: query["hub.mode"] },
      "Rejected a subscription challenge",
    );
    return c.json({ error: "Bad verify token" }, 403);
  }

  log.info(
    { event: "webhook.validated" },
    "Answered Strava's subscription challenge",
  );
  return c.json({ "hub.challenge": query["hub.challenge"] }, 200);
});

const webhookEventRoute = createRoute({
  method: "post",
  path: WEBHOOK_PATH,
  operationId: "receiveStravaWebhook",
  tags: ["Webhooks"],
  summary: "Receive a Strava activity or athlete event",
  description:
    "Authenticated with Strava's X-Strava-Signature header, then acknowledged " +
    "immediately and processed afterwards: Strava requires a 200 " +
    "within two seconds and retries up to three times otherwise, which is far " +
    "less time than reading an activity and writing a debrief takes. A new run " +
    'becomes a post-run debrief in the athlete\'s "Post-run debriefs" thread; ' +
    "everything else is recorded and ignored.",
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: StravaEventSchema } },
    },
  },
  responses: {
    200: {
      description: "Authenticated and acknowledged.",
      content: {
        "application/json": { schema: z.object({ received: z.literal(true) }) },
      },
    },
    403: {
      description: "The delivery signature was absent, invalid, or stale.",
      content: { "application/json": { schema: ErrorSchema } },
    },
    413: {
      description: "The request body exceeded the webhook limit.",
      content: { "application/json": { schema: ErrorSchema } },
    },
    503: {
      description: "Webhook signature verification is not configured.",
      content: { "application/json": { schema: ErrorSchema } },
    },
  },
});

app.use(
  WEBHOOK_PATH,
  bodyLimit({
    maxSize: 64 * 1024,
    onError: (c) => c.json({ error: "Request body too large" }, 413),
  }),
);

app.use(WEBHOOK_PATH, async (c, next) => {
  if (c.req.method !== "POST") return next();

  const secret = webhookSigningSecret();
  const log = c.get("log");
  if (!secret) {
    log.error(
      { event: "webhook.no_signing_secret" },
      "STRAVA_WEBHOOK_SIGNING_SECRET is not set; refusing the event",
    );
    return c.json({ error: "Webhooks are not configured on this server" }, 503);
  }

  // Read a clone so OpenAPI's JSON validator still receives the untouched body.
  const rawBody = await c.req.raw.clone().text();
  if (
    !verifyWebhookSignature(
      rawBody,
      c.req.header("x-strava-signature") ?? null,
      secret,
    )
  ) {
    log.warn(
      { event: "webhook.signature_rejected" },
      "Rejected a Strava webhook event",
    );
    return c.json({ error: "Invalid webhook signature" }, 403);
  }

  return next();
});

/**
 * The work behind an acknowledged event.
 *
 * Deliberately returns nothing and throws nothing: it runs after the response
 * has gone, so a failure here can only ever be a log line.
 */
async function processStravaEvent(event: StravaEvent): Promise<void> {
  const log = logger.child({
    event_source: "strava_webhook",
    objectId: event.object_id,
  });

  const userId = await userForAthlete(event.owner_id);
  if (!userId) {
    log.info(
      { event: "webhook.unknown_athlete", ownerId: event.owner_id },
      "Event for an athlete who has not connected here",
    );
    return;
  }

  if (event.object_type === "athlete") {
    // The only athlete event Strava sends is a deauthorisation.
    if (event.updates.authorized === "false") {
      log.warn(
        { event: "webhook.deauthorized", userId },
        "Athlete revoked access",
      );
    }
    return;
  }

  if (event.aspect_type !== "create") {
    log.info(
      { event: "webhook.activity_ignored", userId, aspect: event.aspect_type },
      "Not a new activity",
    );
    return;
  }

  if (await findDebrief(userId, event.object_id)) {
    log.info(
      { event: "webhook.already_debriefed", userId },
      "Run already debriefed",
    );
    return;
  }

  const accessToken = await stravaTokenFor(userId);
  if (!accessToken) {
    log.warn(
      { event: "webhook.no_token", userId },
      "No Strava token for this athlete",
    );
    return;
  }

  await postRunDebrief(userId, accessToken, event.object_id);
}

app.openapi(webhookEventRoute, async (c) => {
  const event = c.req.valid("json");
  const log = c.get("log");

  log.info(
    {
      event: "webhook.received",
      objectType: event.object_type,
      aspect: event.aspect_type,
      objectId: event.object_id,
    },
    "Strava webhook event",
  );

  // Claimed before the ack so a retry that arrives while the first one is still
  // working is turned away rather than racing it.
  const mine = await claimEvent(event);
  if (mine) {
    // Floating on purpose: the response must not wait for this. Nothing can
    // reject — processStravaEvent swallows and logs — but the catch is kept so
    // a future bug in it cannot take the process down.
    void processStravaEvent(event)
      .then(() => pruneEvents())
      .catch((err: unknown) => {
        logger.error(
          {
            event: "webhook.processing_failed",
            objectId: event.object_id,
            err,
          },
          "Failed to process a Strava event",
        );
      });
  }

  return c.json({ received: true } as const, 200);
});

const clientLogsRoute = createRoute({
  method: "post",
  path: "/api/logs",
  operationId: "postClientLogs",
  tags: ["Telemetry"],
  summary: "Forward a batch of browser events",
  description:
    "Re-logs events the browser recorded — user actions, failed requests, " +
    "uncaught errors — through the server logger, so client and server lines " +
    "share one stream in Loki. Deliberately open to signed-out callers: a " +
    "crash on the sign-in page is exactly what this is for. The session, when " +
    "there is one, only adds attribution.",
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: ClientLogBatchSchema } },
    },
  },
  responses: {
    202: {
      description: "The batch was accepted for logging.",
      content: { "application/json": { schema: ClientLogAcceptedSchema } },
    },
  },
});

// Nothing legitimate comes close to 32 KB; the endpoint is unauthenticated, so
// the ceiling is enforced before the body is parsed.
app.use(
  clientLogsRoute.path,
  bodyLimit({
    maxSize: 32 * 1024,
    onError: (c) => c.json({ error: "Log batch too large" }, 413),
  }),
);

app.openapi(clientLogsRoute, async (c) => {
  const { events } = c.req.valid("json");

  const session = await auth.api
    .getSession({ headers: c.req.raw.headers })
    .catch(() => null);
  if (session) identify(c, session.user.id);

  const log = c.get("log");
  for (const event of events) {
    const level: ClientLogLevel = event.level;
    log[level](
      {
        event: event.event,
        // The one field that separates a browser line from a server line.
        source: "web",
        path: event.path,
        clientTs: event.ts,
        ...(event.context ? { context: event.context } : {}),
      },
      event.message ?? event.event,
    );
  }

  return c.json({ accepted: events.length }, 202);
});

app.doc31(OPENAPI_DOCUMENT_PATH, openAPIConfig);
app.get(SWAGGER_UI_PATH, swaggerUI({ url: OPENAPI_DOCUMENT_PATH }));
