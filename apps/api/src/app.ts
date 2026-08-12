import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { swaggerUI } from "@hono/swagger-ui";
import { cors } from "hono/cors";
import { streamSSE } from "hono/streaming";
import {
  convertToModelMessages,
  createIdGenerator,
  stepCountIs,
  streamText,
  validateUIMessages,
  type UIMessage,
} from "ai";
import { auth } from "./auth.js";
import {
  AthleteSchema,
  CoachChatRequestSchema,
  CoachThreadDetailSchema,
  CoachThreadSchema,
  type CoachThreadDetail,
  ErrorSchema,
  HealthSchema,
  RunRenderStateSchema,
  RunSchema,
  RunStreamsSchema,
} from "./schemas.js";
import {
  fetchAthlete,
  fetchRun,
  fetchRuns,
  fetchRunStreams,
  StravaApiError,
} from "./strava.js";
import { fetchLambdaProgress, getRenderConfig, startLambdaRender } from "./render.js";
import {
  getRunRender,
  saveStartedRender,
  toRunRender,
  updateRunRender,
} from "./render-store.js";
import {
  COACH_NOT_CONFIGURED,
  COACH_PROVIDER_OPTIONS,
  COACH_SYSTEM_PROMPT,
  createCoachTools,
  getCoachConfig,
} from "./coach.js";
import {
  createThread,
  deleteThread,
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
    { name: "Runs", description: "The signed-in athlete's runs and their streams" },
    { name: "Coach", description: "Conversations with the AI running coach" },
  ],
};

export const app = new OpenAPIHono();

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
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: "Not signed in" }, 401);

  const { accessToken } = await auth.api.getAccessToken({
    body: { providerId: "strava", userId: session.user.id },
  });
  if (!accessToken) return c.json({ error: "No Strava access token" }, 401);

  try {
    return c.json(await fetchAthlete(accessToken), 200);
  } catch (err) {
    if (err instanceof StravaApiError) return c.json({ error: err.message }, 502);
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
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: "Not signed in" }, 401);

  const { accessToken } = await auth.api.getAccessToken({
    body: { providerId: "strava", userId: session.user.id },
  });
  if (!accessToken) return c.json({ error: "No Strava access token" }, 401);

  try {
    return c.json(await fetchRuns(accessToken), 200);
  } catch (err) {
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
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: "Not signed in" }, 401);

  const { accessToken } = await auth.api.getAccessToken({
    body: { providerId: "strava", userId: session.user.id },
  });
  if (!accessToken) return c.json({ error: "No Strava access token" }, 401);

  const { id } = c.req.valid("param");
  try {
    return c.json(await fetchRunStreams(accessToken, Number(id)), 200);
  } catch (err) {
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
  "(pnpm --filter @repo/web remotion:deploy) and set REMOTION_FUNCTION_NAME / " +
  "REMOTION_SERVE_URL in apps/api/.env.";

const getRunRenderRoute = createRoute({
  method: "get",
  path: "/api/runs/{id}/render",
  operationId: "getRunRender",
  tags: ["Runs"],
  summary: "Get one run's stored render",
  description:
    "Reads the persisted render state for this run and athlete. `render` is " +
    "null when the run has never been rendered. While a render is in flight, " +
    "live progress comes from the SSE endpoint, which also keeps this state " +
    "up to date.",
  security: [{ sessionCookie: [] }],
  request: { params: RunIdParamsSchema },
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
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: "Not signed in" }, 401);

  const { id } = c.req.valid("param");
  const row = await getRunRender(session.user.id, Number(id));
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
    "render of the story video, and persists the render state. The MP4 lands " +
    "in the Remotion S3 bucket. Idempotent while a render is in flight or " +
    "already done — those return the existing state; a failed render is " +
    "retried.",
  security: [{ sessionCookie: [] }],
  request: { params: RunIdParamsSchema },
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
      description: "Remotion Lambda is not configured on this server.",
      content: { "application/json": { schema: ErrorSchema } },
    },
  },
});

app.openapi(startRunRenderRoute, async (c) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: "Not signed in" }, 401);

  const config = getRenderConfig();
  if (!config) return c.json({ error: RENDER_NOT_CONFIGURED }, 503);

  const { id } = c.req.valid("param");
  const activityId = Number(id);

  // Don't double-render: an in-flight or finished render is simply returned.
  const existing = await getRunRender(session.user.id, activityId);
  if (existing && existing.status !== "error") {
    return c.json({ render: toRunRender(existing) }, 200);
  }

  const { accessToken } = await auth.api.getAccessToken({
    body: { providerId: "strava", userId: session.user.id },
  });
  if (!accessToken) return c.json({ error: "No Strava access token" }, 401);

  try {
    const [run, streams] = await Promise.all([
      fetchRun(accessToken, activityId),
      fetchRunStreams(accessToken, activityId),
    ]);
    const { renderId, bucketName } = await startLambdaRender(config, run, streams);
    const row = await saveStartedRender({
      userId: session.user.id,
      activityId,
      renderId,
      bucketName,
    });
    return c.json({ render: toRunRender(row) }, 200);
  } catch (err) {
    if (err instanceof StravaApiError) {
      if (err.status === 401 || err.status === 403) {
        return c.json({ error: MISSING_SCOPE_ERROR }, 403);
      }
      return c.json({ error: err.message }, 502);
    }
    // Lambda refused the render (bad serve URL, missing AWS permissions, …).
    const message = err instanceof Error ? err.message : "Failed to start the render";
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
    "Server-sent events. While the run's render is in flight, polls Remotion " +
    "Lambda every ~1.5s, persists the result, and emits the updated RunRender " +
    "as a JSON message. The final message has status `done` or `error`, after " +
    "which the stream closes; a lone `null` message means there is no render. " +
    "Consumed with EventSource, not the generated client.",
  security: [{ sessionCookie: [] }],
  request: { params: RunIdParamsSchema },
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
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: "Not signed in" }, 401);

  const config = getRenderConfig();
  if (!config) return c.json({ error: RENDER_NOT_CONFIGURED }, 503);

  const { id } = c.req.valid("param");
  const activityId = Number(id);
  const userId = session.user.id;

  return streamSSE(c, async (stream) => {
    let aborted = false;
    stream.onAbort(() => {
      aborted = true;
    });

    while (!aborted) {
      const row = await getRunRender(userId, activityId);
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
        const progress = await fetchLambdaProgress(config, row);
        const updated = await updateRunRender(userId, activityId, progress);
        await stream.writeSSE({ data: JSON.stringify(toRunRender(updated)) });
        if (updated.status !== "rendering") return;
      } catch {
        // A flaky poll is not a failed render — try again next tick.
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
  description: "Most recently used first. A thread with no messages has a null title.",
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
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
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
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
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
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
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
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: "Not signed in" }, 401);

  const { id } = c.req.valid("param");
  const deleted = await deleteThread(session.user.id, id);
  if (!deleted) return c.json({ error: "No such conversation" }, 404);
  return c.body(null, 204);
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
      description: "A UI message stream of the coach's reply.",
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
      description: "No model API key is configured on this server.",
      content: { "application/json": { schema: ErrorSchema } },
    },
  },
});

app.openapi(coachChatRoute, async (c) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: "Not signed in" }, 401);

  const config = getCoachConfig();
  if (!config) return c.json({ error: COACH_NOT_CONFIGURED }, 503);

  const body = c.req.valid("json");
  const thread = await getThread(session.user.id, body.thread_id);
  if (!thread) return c.json({ error: "No such conversation" }, 404);

  const { accessToken } = await auth.api.getAccessToken({
    body: { providerId: "strava", userId: session.user.id },
  });
  if (!accessToken) return c.json({ error: "No Strava access token" }, 401);

  if (body.trigger === "regenerate-message") {
    if (body.message_id) {
      await truncateForRegenerate(thread.id, body.message_id);
    }
  } else {
    if (!body.message) return c.json({ error: "No message to answer" }, 400);
    // `validateUIMessages` is the SDK's own guard against a malformed parts
    // array reaching the model — the OpenAPI schema only checks the envelope.
    const [message] = await validateUIMessages({ messages: [body.message] });
    await saveMessage(thread.id, message);
    const title = titleFrom(message);
    if (title) await setTitleIfUnset(thread.id, title);
  }

  const messages: UIMessage[] = await getMessages(thread.id);

  const result = streamText({
    model: config.model,
    system: COACH_SYSTEM_PROMPT,
    messages: await convertToModelMessages(messages),
    tools: createCoachTools(accessToken),
    // Every tool call costs a round trip; the cap keeps a confused model from
    // looping through the athlete's whole history.
    stopWhen: stepCountIs(COACH_MAX_STEPS),
    providerOptions: COACH_PROVIDER_OPTIONS,
  });

  return result.toUIMessageStreamResponse({
    // With the transcript attached the SDK reuses ids on regenerate, which is
    // what makes `saveMessage`'s upsert replace rather than duplicate.
    originalMessages: messages,
    generateMessageId: createIdGenerator({ prefix: "msg", size: 16 }),
    onEnd: async ({ responseMessage }) => {
      await saveMessage(thread.id, responseMessage);
    },
    onError: (error) => {
      // The default swallows everything as "An error occurred." — a coach that
      // can't reach its model should say why.
      console.error("coach chat failed", error);
      return error instanceof Error
        ? error.message
        : "The coach could not answer that.";
    },
  });
});

app.doc31(OPENAPI_DOCUMENT_PATH, openAPIConfig);
app.get(SWAGGER_UI_PATH, swaggerUI({ url: OPENAPI_DOCUMENT_PATH }));
