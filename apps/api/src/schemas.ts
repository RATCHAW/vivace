// The API's response contract. These schemas are the single source of truth:
// they validate/type the Hono handlers, they become the OpenAPI document served
// at /api/openapi.json, and apps/web generates its client + React Query hooks
// from that document. Change a schema here and `pnpm generate` propagates it.
//
// `z` must come from @hono/zod-openapi — it is Zod extended with `.openapi()`.
import { z } from "@hono/zod-openapi";

export const HealthSchema = z
  .object({
    status: z.literal("ok"),
  })
  .openapi("Health");

export const ErrorSchema = z
  .object({
    error: z.string().openapi({ example: "Not signed in" }),
  })
  // Not "Error" — the generated client would shadow the global of that name.
  .openapi("ApiError");

/**
 * The athlete profile we hand to the browser.
 *
 * A deliberate subset of Strava's `DetailedAthlete` — the app only ever shows
 * these fields, and narrowing here keeps the OpenAPI document (and therefore
 * the generated web client) honest about what the UI can rely on.
 */
export const AthleteSchema = z
  .object({
    id: z.number().int().openapi({ example: 1234567 }),
    username: z.string().nullable().openapi({ example: "marianne_t" }),
    firstname: z.string().openapi({ example: "Marianne" }),
    lastname: z.string().openapi({ example: "Teutenberg" }),
    bio: z.string().nullable(),
    city: z.string().nullable().openapi({ example: "San Francisco" }),
    state: z.string().nullable().openapi({ example: "CA" }),
    country: z.string().nullable().openapi({ example: "US" }),
    sex: z.enum(["M", "F"]).nullable(),
    /** True while the athlete has a paid Strava subscription. */
    premium: z.boolean(),
    /** Strava's newer name for the same thing; both are returned. */
    summit: z.boolean(),
    created_at: z.iso.datetime().openapi({ example: "2017-11-14T02:30:05Z" }),
    updated_at: z.iso.datetime(),
    /** Large profile picture URL. */
    profile: z.string(),
    /** Small profile picture URL. */
    profile_medium: z.string(),
    /** Kilograms, or null when the athlete hasn't set one. */
    weight: z.number().nullable(),
  })
  .openapi("Athlete");

export type Athlete = z.infer<typeof AthleteSchema>;

/**
 * One run in the athlete's activity list.
 *
 * Like `AthleteSchema`, a deliberate subset of Strava's `SummaryActivity` —
 * exactly the fields the run list and the run video consume.
 */
export const RunSchema = z
  .object({
    id: z.number().int().openapi({ example: 987654321 }),
    name: z.string().openapi({ example: "Morning Run" }),
    /** Meters. */
    distance: z.number().openapi({ example: 5021.4 }),
    /** Seconds. */
    moving_time: z.number().openapi({ example: 1724 }),
    /** Meters. */
    total_elevation_gain: z.number(),
    sport_type: z.string().openapi({ example: "Run" }),
    /** The athlete's wall clock at the start (ISO, Z-suffixed by Strava). */
    start_date_local: z.iso.datetime().openapi({ example: "2026-08-09T07:12:00Z" }),
    /** Meters per second. */
    average_speed: z.number(),
    /** Beats per minute, or null when recorded without a heart-rate monitor. */
    average_heartrate: z.number().nullable(),
  })
  .openapi("Run");

export type Run = z.infer<typeof RunSchema>;

const NumberStreamSchema = z
  .object({
    data: z.array(z.number()),
  })
  .openapi("NumberStream");

/**
 * The streams the run video is built from. Every key is optional — treadmill
 * runs have no latlng, most runs have no heartrate.
 */
export const RunStreamsSchema = z
  .object({
    latlng: z
      .object({
        /** [latitude, longitude] pairs. */
        data: z.array(z.array(z.number()).min(2).max(2)),
      })
      .optional(),
    /** Seconds since the start of the activity. */
    time: NumberStreamSchema.optional(),
    /** Cumulative meters. */
    distance: NumberStreamSchema.optional(),
    /** Meters above sea level. */
    altitude: NumberStreamSchema.optional(),
    /** Beats per minute. */
    heartrate: NumberStreamSchema.optional(),
    /** Smoothed meters per second. */
    velocity_smooth: NumberStreamSchema.optional(),
  })
  .openapi("RunStreams");

export type RunStreams = z.infer<typeof RunStreamsSchema>;

/**
 * One run's Lambda render — the persisted row in `run_render`, as served to
 * the browser. `output_url` is the public S3 URL of the MP4 once `status` is
 * `"done"`.
 */
export const RunRenderSchema = z
  .object({
    activity_id: z.number().int().openapi({ example: 987654321 }),
    status: z.enum(["rendering", "done", "error"]).openapi({ example: "rendering" }),
    /** Overall Lambda render progress, 0–1. */
    progress: z.number().min(0).max(1).openapi({ example: 0.42 }),
    output_url: z.string().nullable().openapi({
      example: "https://remotionlambda-useast1-abcdef.s3.us-east-1.amazonaws.com/renders/abc/out.mp4",
    }),
    error: z.string().nullable(),
    created_at: z.iso.datetime(),
    updated_at: z.iso.datetime(),
  })
  .openapi("RunRender");

export type RunRender = z.infer<typeof RunRenderSchema>;

/** Wrapper so "never rendered" is an ordinary 200 with `render: null`. */
export const RunRenderStateSchema = z
  .object({
    render: RunRenderSchema.nullable(),
  })
  .openapi("RunRenderState");

export type RunRenderState = z.infer<typeof RunRenderStateSchema>;

/**
 * Values a browser event may carry. Scalars only — the context is meant for a
 * handful of identifying fields (`activityId`, `status`, …), and keeping it
 * flat stops a bug in the client from posting a whole React tree into Loki.
 */
const ClientLogContextSchema = z
  .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))
  .openapi("ClientLogContext", {
    example: { activityId: 987654321, status: 502 },
  });

/**
 * One thing that happened in the browser: a user action, or an error the user
 * hit. The server re-logs it so client and API lines end up in the same Loki
 * stream and the same Grafana dashboard.
 */
const CLIENT_LOG_LEVELS = ["debug", "info", "warn", "error"] as const;

/** Matches the pino method the server re-logs the event with. */
export type ClientLogLevel = (typeof CLIENT_LOG_LEVELS)[number];

export const ClientLogEventSchema = z
  .object({
    level: z.enum(CLIENT_LOG_LEVELS).openapi({ example: "info" }),
    /**
     * A dotted, low-cardinality name — this is what dashboards group by, so
     * it is constrained rather than free text (ids belong in `context`).
     */
    event: z
      .string()
      .regex(/^[a-z][a-z0-9_]*(\.[a-z0-9_]+)*$/)
      .max(48)
      .openapi({ example: "ui.render_clicked" }),
    message: z.string().max(500).optional(),
    /** The route the user was on, e.g. `/runs`. */
    path: z.string().max(200).optional(),
    context: ClientLogContextSchema.optional(),
    /** When it happened in the browser; the server stamps its own time too. */
    ts: z.iso.datetime().optional(),
  })
  .openapi("ClientLogEvent");

export type ClientLogEvent = z.infer<typeof ClientLogEventSchema>;

/** Browser events arrive batched — one request per flush, not per event. */
export const ClientLogBatchSchema = z
  .object({
    events: z.array(ClientLogEventSchema).min(1).max(50),
  })
  .openapi("ClientLogBatch");

export const ClientLogAcceptedSchema = z
  .object({
    accepted: z.number().int().openapi({ example: 3 }),
  })
  .openapi("ClientLogAccepted");
