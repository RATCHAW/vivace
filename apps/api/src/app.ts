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
import {
  avatarSource,
  DEFAULT_TEMPLATE_ID,
  DEFAULT_THEME,
  getTemplate,
} from "@repo/video";
import { auth } from "./auth.js";
import { track, trackError } from "./analytics.js";
import { logger } from "./logger.js";
import { captureServerException, isFeatureEnabledFor } from "./posthog.js";
import { observeTurn, POSTHOG_SESSION_HEADER } from "./ai-observability.js";
import { identify, requestLogger, type AppEnv } from "./request-logger.js";
import {
  AcceptRunInviteSchema,
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
  RunInviteCandidatesSchema,
  RunInviteListSchema,
  RunInvitePreviewSchema,
  RunInviteSchema,
  type RunInvite,
  type RunPartner,
  RunPartnerStateSchema,
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
  acceptedInviteForRun,
  acceptInvite,
  createInvite,
  declineInvite,
  getInvite,
  isOpen,
  listInvitesForRun,
  revokeAllForUser,
  revokeInvite,
  type InviteRow,
} from "./invite-store.js";
import { rankCandidates } from "./pairing.js";
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
    {
      name: "Invites",
      description:
        "Inviting another athlete who ran the same run to appear in its video",
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

/**
 * The other runner on a run, read with their own Strava token.
 *
 * That token is the whole point: a second athlete's pace is not readable any
 * other way, so this returning something *is* the evidence that an invitation
 * was accepted and the grant behind it is still live. Null covers all three ways
 * there is nobody to draw — nobody accepted, the invitee disconnected Strava, or
 * the row is half-answered — and every caller treats them the same, because to
 * the athlete looking at the picker they are the same.
 *
 * Strava failures are thrown rather than swallowed: a partner we cannot read
 * *right now* is a 502, not a film with one runner in it.
 */
async function loadRunPartner(
  userId: string,
  activityId: number,
): Promise<{ invite: InviteRow; partner: RunPartner | null } | null> {
  const invite = await acceptedInviteForRun(userId, activityId);
  if (!invite?.inviteeUserId || invite.inviteeActivityId == null) return null;

  const token = await stravaTokenFor(invite.inviteeUserId);
  if (!token) {
    logger.warn(
      { event: "invite.invitee_token_missing", activityId },
      "The partner's Strava grant is gone",
    );
    return { invite, partner: null };
  }

  const [activity, streams, athlete] = await Promise.all([
    fetchRun(token, invite.inviteeActivityId),
    fetchRunStreams(token, invite.inviteeActivityId),
    fetchAthlete(token),
  ]);
  return {
    invite,
    partner: {
      name: athlete.firstname,
      // Strava hands back a sprite name for an athlete with no picture; the
      // catalogue's own reader is what turns that into "no avatar".
      avatar_url: avatarSource(athlete.profile),
      activity,
      streams,
    },
  };
}

const runPartnerRoute = createRoute({
  method: "get",
  path: "/api/runs/{id}/partner",
  operationId: "getRunPartner",
  tags: ["Runs"],
  summary: "Get the other runner on this run, if somebody accepted",
  description:
    "The run and streams of whoever accepted an invitation to appear in this " +
    "run's video, read with their own Strava token. `partner` is null when " +
    "nobody has accepted, or when the athlete who did has since disconnected " +
    "Strava — the browser reads it to decide whether the two-runner templates " +
    "can be offered, and to play them without going back to Strava itself.",
  security: [{ sessionCookie: [] }],
  request: { params: RunIdParamsSchema },
  responses: {
    200: {
      description: "The other runner, or null if there isn't one.",
      content: { "application/json": { schema: RunPartnerStateSchema } },
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

app.openapi(runPartnerRoute, async (c) => {
  const session = await currentUser(c);
  if (!session) return c.json({ error: "Not signed in" }, 401);

  const { id } = c.req.valid("param");
  try {
    const found = await loadRunPartner(session.user.id, Number(id));
    return c.json({ partner: found?.partner ?? null }, 200);
  } catch (err) {
    logStravaFailure(c, err, "fetch the partner's run");
    if (err instanceof StravaApiError) {
      return c.json({ error: err.message }, 502);
    }
    throw err;
  }
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

const RENDER_NEEDS_PARTNER =
  "This video needs the person you ran with. Send them the invitation link, " +
  "and render it once they've accepted.";

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
    "replace the video already made with the last one. A template that draws " +
    "two runners also reads the run's accepted invitation and the partner's " +
    "own Strava data, and is refused with 409 when there is none. The body is " +
    "optional and defaults to the plain replay.",
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
    409: {
      description:
        "This template needs a second runner, and nobody has accepted an " +
        "invitation to this run — or the athlete who did has since " +
        "disconnected Strava.",
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
  const entry = getTemplate(template);
  // A template that draws no runner has nothing to put a face on, so the option
  // is dropped here rather than stored as an answer that changed nothing.
  const showAvatar = (body?.show_avatar ?? false) && entry.supportsAvatar;
  // Same rule for the look: a template whose plate isn't ours to re-tint stores
  // the default rather than an answer that changed nothing.
  const theme = entry.supportsTheme
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

  // Who else is in the film, if this template draws two. Read from our own row
  // rather than from Strava, and read *before* the reuse check below: the
  // partner's run id is half of what identifies the render, and the invitation
  // knows it without spending a Strava request on a video we may already have.
  const invite = entry.needsPartner
    ? await acceptedInviteForRun(session.user.id, activityId)
    : null;
  if (entry.needsPartner && invite?.inviteeActivityId == null) {
    log.info(
      { event: "render.needs_partner", activityId, template },
      "No accepted invitation on this run",
    );
    return c.json({ error: RENDER_NEEDS_PARTNER }, 409);
  }

  // Don't double-render: an in-flight or finished render is simply returned —
  // unless it was made with different options, which makes it a different video.
  const propsHash = renderPropsHash(
    template,
    options,
    invite?.inviteeActivityId ?? null,
  );
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
    const [run, streams, athlete, found] = await Promise.all([
      fetchRun(accessToken, activityId),
      fetchRunStreams(accessToken, activityId),
      // Read from Strava rather than taken from the request: the browser does
      // not get to choose the picture, or the name, that is baked into the
      // video. A two-runner film needs the name whatever the avatar option said.
      showAvatar || entry.needsPartner ? fetchAthlete(accessToken) : null,
      // With the partner's own token — see `loadRunPartner`.
      entry.needsPartner ? loadRunPartner(session.user.id, activityId) : null,
    ]);

    // Between the row read above and this fetch, the only thing that can have
    // changed is the invitee's grant. Nothing renders a duo film with one
    // runner in it: that is a different template, and they can pick it.
    if (entry.needsPartner && !found?.partner) {
      log.warn(
        { event: "render.partner_unreadable", activityId, template },
        "The partner's Strava grant is gone",
      );
      return c.json({ error: RENDER_NEEDS_PARTNER }, 409);
    }

    const { renderId, bucketName } = await startLambdaRender(target, {
      run,
      streams,
      avatarUrl: showAvatar ? (athlete?.profile ?? "") : "",
      showAvatar,
      athleteName: athlete?.firstname ?? "You",
      theme,
      partner: found?.partner ?? null,
    });
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

// --- Invites ------------------------------------------------------------------
//
// Two athletes end up in one film by one of them sending a link and the other
// answering it. There is no friendship here and no follower list, deliberately:
// Strava's API exposes no social graph to read one from, and an invitation
// scoped to a single run is both the smallest thing that works and the clearest
// consent — the invitee agrees to *this* video, not to a standing relationship.
//
// The link is also the only way the film can exist at all. A second runner's
// pace is readable only with that runner's own Strava token, so the invitation
// is the data dependency rather than a growth channel bolted onto one.

const InviteTokenParamsSchema = z.object({
  token: z
    .string()
    .min(20)
    .max(100)
    .regex(/^[A-Za-z0-9_-]+$/)
    .openapi({
      param: { name: "token", in: "path" },
      example: "u4Hs1ZxK9pQ2mR7vT0nB3cJ6yL8wF5dG1aE4hS7kX0M",
    }),
});

const INVITE_NOT_FOUND = "That invitation link is not valid.";
const INVITE_CLOSED = "That invitation has already been answered or expired.";
const INVITE_OWN = "You can't accept your own invitation.";

/** The stored row as the API serves it, resolving expiry against the clock. */
function toRunInvite(
  row: InviteRow,
  inviteeName: string | null = null,
): RunInvite {
  return {
    token: row.token,
    activity_id: row.inviterActivityId,
    status: isOpen(row) || row.status !== "pending" ? row.status : "expired",
    // First name only: this is a label beside "accepted", not a profile.
    invitee_name: inviteeName ? (inviteeName.split(" ")[0] ?? null) : null,
    invitee_activity_id: row.inviteeActivityId,
    expires_at: row.expiresAt.toISOString(),
    responded_at: row.respondedAt?.toISOString() ?? null,
    created_at: row.createdAt.toISOString(),
  };
}

const createRunInviteRoute = createRoute({
  method: "post",
  path: "/api/runs/{id}/invite",
  operationId: "createRunInvite",
  tags: ["Invites"],
  summary: "Invite someone who ran this run to appear in its video",
  description:
    "Mints a link the athlete sends themselves, through whatever they already " +
    "message people with. This API never contacts the invitee: Strava's API " +
    "terms forbid using its materials to initiate contact with a Strava user, " +
    "and there is no address to send to anyway. A run that already has a live " +
    "unanswered link returns that one rather than a second — every extra token " +
    "would be another standing permission to view the run.",
  security: [{ sessionCookie: [] }],
  request: { params: RunIdParamsSchema },
  responses: {
    200: {
      description:
        "The invitation. `token` goes in the link the athlete sends.",
      content: { "application/json": { schema: RunInviteSchema } },
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
    404: {
      description: "No such run on the signed-in athlete's account.",
      content: { "application/json": { schema: ErrorSchema } },
    },
    502: {
      description: "Strava rejected or failed the upstream request.",
      content: { "application/json": { schema: ErrorSchema } },
    },
  },
});

app.openapi(createRunInviteRoute, async (c) => {
  const session = await currentUser(c);
  if (!session) return c.json({ error: "Not signed in" }, 401);

  const accessToken = await stravaAccessToken(c, session.user.id);
  if (!accessToken) return c.json({ error: "No Strava access token" }, 401);

  const activityId = Number(c.req.valid("param").id);

  // Read the run before minting anything. Strava answers an activity by id only
  // to the token that owns it, so this *is* the ownership check — without it an
  // athlete could hand out a link naming a run that isn't theirs, and the
  // invitee would be shown a preview built from somebody else's account.
  try {
    await fetchRun(accessToken, activityId);
  } catch (err) {
    logStravaFailure(c, err, "fetch the run to invite on");
    if (err instanceof StravaApiError) {
      if (err.status === 404) return c.json({ error: INVITE_NOT_FOUND }, 404);
      if (err.status === 401 || err.status === 403) {
        return c.json({ error: MISSING_SCOPE_ERROR }, 403);
      }
      return c.json({ error: err.message }, 502);
    }
    throw err;
  }

  const { invite, reused } = await createInvite({
    inviterUserId: session.user.id,
    inviterActivityId: activityId,
  });
  track(
    c,
    "invite.created",
    { activityId, reused },
    reused ? "Reused the run's live invitation" : "Created a run invitation",
  );
  return c.json(toRunInvite(invite), 200);
});

const listRunInvitesRoute = createRoute({
  method: "get",
  path: "/api/runs/{id}/invites",
  operationId: "listRunInvites",
  tags: ["Invites"],
  summary: "List the invitations sent for this run",
  description:
    "Every invitation the signed-in athlete has sent for this run, newest " +
    "first — which is what lets the studio say whether anyone has answered. " +
    "A link nobody answered before it lapsed reads `expired`.",
  security: [{ sessionCookie: [] }],
  request: { params: RunIdParamsSchema },
  responses: {
    200: {
      description: "The run's invitations.",
      content: { "application/json": { schema: RunInviteListSchema } },
    },
    401: {
      description: "No valid session.",
      content: { "application/json": { schema: ErrorSchema } },
    },
  },
});

app.openapi(listRunInvitesRoute, async (c) => {
  const session = await currentUser(c);
  if (!session) return c.json({ error: "Not signed in" }, 401);

  const rows = await listInvitesForRun(
    session.user.id,
    Number(c.req.valid("param").id),
  );
  return c.json(
    { invites: rows.map((row) => toRunInvite(row.invite, row.inviteeName)) },
    200,
  );
});

const getRunInviteRoute = createRoute({
  method: "get",
  path: "/api/invites/{token}",
  operationId: "getRunInvite",
  tags: ["Invites"],
  summary: "Preview an invitation (no session required)",
  description:
    "What the holder of a link is shown before they sign in — who is asking " +
    "and which run, and nothing else. Deliberately unauthenticated: the whole " +
    "point of the link is that it reaches somebody who does not have an " +
    "account yet, and requiring one first would ask them to authorise us " +
    "before telling them what for. The token is the credential.",
  request: { params: InviteTokenParamsSchema },
  responses: {
    200: {
      description: "The invitation, as much of it as an outsider may see.",
      content: { "application/json": { schema: RunInvitePreviewSchema } },
    },
    404: {
      description: "No invitation with that token.",
      content: { "application/json": { schema: ErrorSchema } },
    },
    502: {
      description: "Strava rejected or failed the upstream request.",
      content: { "application/json": { schema: ErrorSchema } },
    },
  },
});

app.openapi(getRunInviteRoute, async (c) => {
  const { token } = c.req.valid("param");
  const invite = await getInvite(token);
  if (!invite) return c.json({ error: INVITE_NOT_FOUND }, 404);

  // Read with the *inviter's* token: it is their run, and the holder of the
  // link has no Strava grant of their own yet — that is what they are here to
  // be asked for.
  const accessToken = await stravaTokenFor(invite.inviterUserId);
  if (!accessToken) {
    c.get("log").warn(
      { event: "invite.inviter_token_missing", token },
      "The inviter's Strava grant is gone",
    );
    return c.json({ error: INVITE_NOT_FOUND }, 404);
  }

  try {
    const [run, athlete] = await Promise.all([
      fetchRun(accessToken, invite.inviterActivityId),
      fetchAthlete(accessToken),
    ]);
    return c.json(
      {
        status: toRunInvite(invite).status,
        inviter_name: athlete.firstname,
        run_name: run.name,
        // The run's own local day — never the reader's, who may be anywhere.
        run_date: run.start_date_local.slice(0, 10),
        run_distance: run.distance,
        run_moving_time: Math.round(run.moving_time),
        expires_at: invite.expiresAt.toISOString(),
      },
      200,
    );
  } catch (err) {
    logStravaFailure(c, err, "fetch the invited run");
    if (err instanceof StravaApiError) {
      // The run was deleted or hidden since the link went out. Nothing here is
      // the reader's fault, but there is no invitation left to answer either.
      if (err.status === 404) return c.json({ error: INVITE_NOT_FOUND }, 404);
      return c.json({ error: err.message }, 502);
    }
    throw err;
  }
});

const runInviteCandidatesRoute = createRoute({
  method: "get",
  path: "/api/invites/{token}/candidates",
  operationId: "getRunInviteCandidates",
  tags: ["Invites"],
  summary: "My runs that could be the other half of this one",
  description:
    "The signed-in athlete's own runs, ranked by how much they overlap the " +
    "invited run, best first. Ranking only orders the list — the athlete " +
    "confirms which run was theirs, because they are the only one who knows. " +
    "An empty list is a normal answer: they may have recorded nothing that " +
    "day, or hidden their start times, and the client should let them say so.",
  security: [{ sessionCookie: [] }],
  request: { params: InviteTokenParamsSchema },
  responses: {
    200: {
      description: "Candidate runs, best match first.",
      content: { "application/json": { schema: RunInviteCandidatesSchema } },
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
    404: {
      description: "No invitation with that token.",
      content: { "application/json": { schema: ErrorSchema } },
    },
    409: {
      description: "The invitation is answered, withdrawn, or expired.",
      content: { "application/json": { schema: ErrorSchema } },
    },
    502: {
      description: "Strava rejected or failed the upstream request.",
      content: { "application/json": { schema: ErrorSchema } },
    },
  },
});

app.openapi(runInviteCandidatesRoute, async (c) => {
  const session = await currentUser(c);
  if (!session) return c.json({ error: "Not signed in" }, 401);

  const { token } = c.req.valid("param");
  const invite = await getInvite(token);
  if (!invite) return c.json({ error: INVITE_NOT_FOUND }, 404);
  if (!isOpen(invite)) return c.json({ error: INVITE_CLOSED }, 409);
  if (invite.inviterUserId === session.user.id) {
    return c.json({ error: INVITE_OWN }, 409);
  }

  const inviterToken = await stravaTokenFor(invite.inviterUserId);
  if (!inviterToken) return c.json({ error: INVITE_NOT_FOUND }, 404);

  const accessToken = await stravaAccessToken(c, session.user.id);
  if (!accessToken) return c.json({ error: "No Strava access token" }, 401);

  try {
    const [target, mine] = await Promise.all([
      fetchRun(inviterToken, invite.inviterActivityId),
      fetchRuns(accessToken),
    ]);
    const candidates = rankCandidates(target, mine).map((match) => match.run);
    track(
      c,
      "invite.candidates_listed",
      { count: candidates.length, searched: mine.length },
      "Listed candidate runs for an invitation",
    );
    return c.json({ candidates }, 200);
  } catch (err) {
    logStravaFailure(c, err, "list candidate runs");
    if (err instanceof StravaApiError) {
      if (err.status === 401 || err.status === 403) {
        return c.json({ error: MISSING_SCOPE_ERROR }, 403);
      }
      return c.json({ error: err.message }, 502);
    }
    throw err;
  }
});

const acceptRunInviteRoute = createRoute({
  method: "post",
  path: "/api/invites/{token}/accept",
  operationId: "acceptRunInvite",
  tags: ["Invites"],
  summary: "Accept an invitation, naming which run was mine",
  description:
    "Records the consent that lets this athlete's run appear in the " +
    "inviter's video, against the run they say was theirs. The sentence they " +
    "were shown is stored verbatim with the row: consent has to be evidenced " +
    "as it was worded at the time, and the catalogue will be reworded. " +
    "Accepting twice is not an error — the second attempt reports the " +
    "invitation as already answered.",
  security: [{ sessionCookie: [] }],
  request: {
    params: InviteTokenParamsSchema,
    body: {
      required: true,
      content: { "application/json": { schema: AcceptRunInviteSchema } },
    },
  },
  responses: {
    200: {
      description: "The accepted invitation.",
      content: { "application/json": { schema: RunInviteSchema } },
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
    404: {
      description:
        "No invitation with that token, or no such run on my account.",
      content: { "application/json": { schema: ErrorSchema } },
    },
    409: {
      description:
        "The invitation is already answered, withdrawn or expired — or it is " +
        "the caller's own.",
      content: { "application/json": { schema: ErrorSchema } },
    },
    502: {
      description: "Strava rejected or failed the upstream request.",
      content: { "application/json": { schema: ErrorSchema } },
    },
  },
});

app.openapi(acceptRunInviteRoute, async (c) => {
  const session = await currentUser(c);
  if (!session) return c.json({ error: "Not signed in" }, 401);

  const { token } = c.req.valid("param");
  const { activity_id: activityId, consent_text: consentText } =
    c.req.valid("json");

  const invite = await getInvite(token);
  if (!invite) return c.json({ error: INVITE_NOT_FOUND }, 404);
  if (!isOpen(invite)) return c.json({ error: INVITE_CLOSED }, 409);
  // An athlete pairing a run with themselves would put one person on both
  // sides of a film that exists to hold two.
  if (invite.inviterUserId === session.user.id) {
    return c.json({ error: INVITE_OWN }, 409);
  }

  const accessToken = await stravaAccessToken(c, session.user.id);
  if (!accessToken) return c.json({ error: "No Strava access token" }, 401);

  // The named run has to be one of theirs, for the same reason the inviter's
  // is checked: Strava serves an activity by id only to its owner, so a
  // successful read is the proof. Consenting on behalf of a run you don't own
  // is not consent.
  try {
    await fetchRun(accessToken, activityId);
  } catch (err) {
    logStravaFailure(c, err, "fetch the run being offered");
    if (err instanceof StravaApiError) {
      if (err.status === 404) {
        return c.json({ error: "No such run on your account." }, 404);
      }
      if (err.status === 401 || err.status === 403) {
        return c.json({ error: MISSING_SCOPE_ERROR }, 403);
      }
      return c.json({ error: err.message }, 502);
    }
    throw err;
  }

  const accepted = await acceptInvite({
    token,
    inviteeUserId: session.user.id,
    inviteeActivityId: activityId,
    consentText,
  });
  // Lost a race with another tab, or with the inviter withdrawing it.
  if (!accepted) return c.json({ error: INVITE_CLOSED }, 409);

  track(
    c,
    "invite.accepted",
    { activityId, inviterActivityId: accepted.inviterActivityId },
    "Accepted a run invitation",
  );
  return c.json(toRunInvite(accepted, session.user.name), 200);
});

const declineRunInviteRoute = createRoute({
  method: "post",
  path: "/api/invites/{token}/decline",
  operationId: "declineRunInvite",
  tags: ["Invites"],
  summary: "Decline an invitation",
  description:
    "Closes the invitation without pairing anything. Recorded rather than " +
    "left to lapse, so the inviter can tell a no from a link nobody opened.",
  security: [{ sessionCookie: [] }],
  request: { params: InviteTokenParamsSchema },
  responses: {
    200: {
      description: "The declined invitation.",
      content: { "application/json": { schema: RunInviteSchema } },
    },
    401: {
      description: "No valid session.",
      content: { "application/json": { schema: ErrorSchema } },
    },
    404: {
      description: "No invitation with that token.",
      content: { "application/json": { schema: ErrorSchema } },
    },
    409: {
      description: "The invitation is already answered, withdrawn or expired.",
      content: { "application/json": { schema: ErrorSchema } },
    },
  },
});

app.openapi(declineRunInviteRoute, async (c) => {
  const session = await currentUser(c);
  if (!session) return c.json({ error: "Not signed in" }, 401);

  const { token } = c.req.valid("param");
  const invite = await getInvite(token);
  if (!invite) return c.json({ error: INVITE_NOT_FOUND }, 404);

  const declined = await declineInvite(token, session.user.id);
  if (!declined) return c.json({ error: INVITE_CLOSED }, 409);

  track(c, "invite.declined", {}, "Declined a run invitation");
  return c.json(toRunInvite(declined, session.user.name), 200);
});

const revokeRunInviteRoute = createRoute({
  method: "delete",
  path: "/api/invites/{token}",
  operationId: "revokeRunInvite",
  tags: ["Invites"],
  summary: "Withdraw an invitation I sent",
  description:
    "Kills the link. Only the athlete who sent it may, and only while it is " +
    "still unanswered — an accepted invitation is a consent that was given, " +
    "and taking it back is the invitee's to do, not the inviter's.",
  security: [{ sessionCookie: [] }],
  request: { params: InviteTokenParamsSchema },
  responses: {
    200: {
      description: "The withdrawn invitation.",
      content: { "application/json": { schema: RunInviteSchema } },
    },
    401: {
      description: "No valid session.",
      content: { "application/json": { schema: ErrorSchema } },
    },
    404: {
      description: "No invitation with that token sent by this athlete.",
      content: { "application/json": { schema: ErrorSchema } },
    },
    409: {
      description: "It has already been answered or has expired.",
      content: { "application/json": { schema: ErrorSchema } },
    },
  },
});

app.openapi(revokeRunInviteRoute, async (c) => {
  const session = await currentUser(c);
  if (!session) return c.json({ error: "Not signed in" }, 401);

  const { token } = c.req.valid("param");
  const invite = await getInvite(token);
  // Not found rather than forbidden for somebody else's token: whether a token
  // exists is not a question a stranger gets an answer to.
  if (!invite || invite.inviterUserId !== session.user.id) {
    return c.json({ error: INVITE_NOT_FOUND }, 404);
  }

  const revoked = await revokeInvite(token, session.user.id);
  if (!revoked) return c.json({ error: INVITE_CLOSED }, 409);

  track(c, "invite.revoked", {}, "Withdrew a run invitation");
  return c.json(toRunInvite(revoked), 200);
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
      // An accepted invitation is a standing permission to put this athlete's
      // run in somebody else's film. Revoking the Strava grant that made the
      // data reachable has to revoke that permission with it, in both
      // directions — otherwise a consent outlives the account that gave it.
      const withdrawn = await revokeAllForUser(userId);
      if (withdrawn.length > 0) {
        log.warn(
          {
            event: "invite.revoked_on_deauthorization",
            userId,
            count: withdrawn.length,
            // The returned rows are already `revoked`, so the split that is
            // still readable is by side: how many were permissions this athlete
            // had given, rather than ones they were waiting on.
            asInvitee: withdrawn.filter((row) => row.inviteeUserId === userId)
              .length,
          },
          "Withdrew this athlete's invitations",
        );
      }
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
