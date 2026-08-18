// The API's response contract. These schemas are the single source of truth:
// they validate/type the Hono handlers, they become the OpenAPI document served
// at /api/openapi.json, and apps/web generates its client + React Query hooks
// from that document. Change a schema here and `pnpm generate` propagates it.
//
// `z` must come from @hono/zod-openapi — it is Zod extended with `.openapi()`.
import { z } from "@hono/zod-openapi";
import {
  DEFAULT_TEMPLATE_ID,
  DEFAULT_THEME,
  TEMPLATE_IDS,
  THEME_NAMES,
} from "@repo/video";

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
    start_date_local: z.iso
      .datetime()
      .openapi({ example: "2026-08-09T07:12:00Z" }),
    /** Meters per second. */
    average_speed: z.number(),
    /** Beats per minute, or null when recorded without a heart-rate monitor. */
    average_heartrate: z.number().nullable(),
    /** Beats per minute, or null when recorded without a heart-rate monitor. */
    max_heartrate: z.number().nullable(),
    /**
     * What the athlete tagged the session as in Strava. This is the only field
     * that separates a race from a jog without reading the run's name, so the
     * coach's intensity maths leans on it.
     */
    workout_type: z
      .enum(["default", "race", "long_run", "workout"])
      .openapi({ example: "long_run" }),
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
 * Which cut of the run to make.
 *
 * The values come from `@repo/video`'s registry, which is also what the browser
 * builds its picker from and what the Lambda site bundle registers as
 * compositions — so a template can't be requested that nothing can render.
 */
export const VideoTemplateSchema = z
  .enum(TEMPLATE_IDS)
  .openapi("VideoTemplate", { example: DEFAULT_TEMPLATE_ID });

/** The three looks a video can be cut in — the catalogue's, not the app's. */
export const VideoThemeSchema = z
  .enum(THEME_NAMES)
  .openapi("VideoTheme", { example: DEFAULT_THEME });

/**
 * What the athlete chose in the replay's options panel, sent when a render is
 * started. Part of a render's identity, not a display setting: the same run as
 * a different template, or with the avatar on, is a different video — so the
 * stored render carries these back and the browser offers a re-render rather
 * than the wrong MP4.
 */
export const RunRenderOptionsSchema = z
  .object({
    template: VideoTemplateSchema.default(DEFAULT_TEMPLATE_ID),
    /** Draw the runner as the athlete's Strava picture instead of a dot.
     *  Ignored by a template whose `supportsAvatar` is false. */
    show_avatar: z.boolean().default(false).openapi({ example: true }),
    /** Which of the three looks to cut it in. Ignored by a template whose
     *  `supportsTheme` is false — the replay's plate is a Mapbox style. */
    theme: VideoThemeSchema.default(DEFAULT_THEME),
    /** Cut the canvas as a chroma key plate, so the athlete can key it away and
     *  put their own footage behind the run. Honoured by every template — it is
     *  a delivery format rather than a look, so it has no `supports…` flag. */
    greenscreen: z.boolean().default(false).openapi({ example: true }),
  })
  .openapi("RunRenderOptions");

export type RunRenderOptions = z.infer<typeof RunRenderOptionsSchema>;

/**
 * One run's Lambda render — the persisted row in `run_render`, as served to
 * the browser. `output_url` is the public S3 URL of the MP4 once `status` is
 * `"done"`. A run holds one of these per template.
 */
export const RunRenderSchema = z
  .object({
    activity_id: z.number().int().openapi({ example: 987654321 }),
    /** Which cut this is. Rendering another template leaves this one alone. */
    template: VideoTemplateSchema,
    status: z
      .enum(["rendering", "done", "error"])
      .openapi({ example: "rendering" }),
    /** The options this render was started with — see `RunRenderOptions`. A
     *  stored render whose options no longer match what the athlete has chosen
     *  is a different video, and the browser offers a re-render rather than the
     *  wrong MP4. */
    show_avatar: z.boolean(),
    theme: VideoThemeSchema,
    greenscreen: z.boolean(),
    /** Overall Lambda render progress, 0–1. */
    progress: z.number().min(0).max(1).openapi({ example: 0.42 }),
    output_url: z.string().nullable().openapi({
      example:
        "https://remotionlambda-useast1-abcdef.s3.us-east-1.amazonaws.com/renders/abc/out.mp4",
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

/** One coach conversation. `title` is null until the first message names it. */
export const CoachThreadSchema = z
  .object({
    id: z.string().openapi({ example: "8f2c1e34-9a1b-4f6d-8f0e-3b6a1c9d2e77" }),
    title: z
      .string()
      .nullable()
      .openapi({ example: "Half marathon in October" }),
    created_at: z.iso.datetime(),
    updated_at: z.iso.datetime(),
  })
  .openapi("CoachThread");

export type CoachThread = z.infer<typeof CoachThreadSchema>;

/**
 * One stored message, in the AI SDK's `UIMessage` shape.
 *
 * `parts` is deliberately loose: a part is a discriminated union that grows
 * with every model capability (text, reasoning, file, tool-*, …) and pinning it
 * here would mean re-deriving the SDK's types in Zod and re-deriving them again
 * on every SDK release. The browser casts this back to `UIMessage` in one
 * documented place — see `coachMessages()` in apps/web/src/api.
 */
/**
 * What a message carries besides what was said.
 *
 * `run` is the athlete attaching a run to a question with the composer's `@`
 * picker — it is what makes "why did I fade?" answerable without the model
 * guessing which run "I" meant. It rides on the message rather than in its text
 * so the transcript reads as a question, not as a question with an id stapled
 * to it, and so a reload still knows which run was meant.
 */
export const CoachMessageMetadataSchema = z
  .object({
    run: z
      .object({
        id: z.number().int(),
        name: z.string(),
        /** `YYYY-MM-DD`, the run's own local day. */
        date: z.string(),
      })
      .optional(),
    /**
     * The PostHog trace this answer was written under, on assistant messages.
     *
     * It rides on the message because that is what outlives the stream: an
     * athlete rates an answer minutes later, or after a reload, and the rating
     * is only worth anything if it names the trace that produced it. Written by
     * the API (see `observeTurn` in ai-observability.ts), never by the browser.
     */
    trace_id: z.string().optional(),
  })
  .openapi("CoachMessageMetadata");

export type CoachMessageMetadata = z.infer<typeof CoachMessageMetadataSchema>;

export const CoachMessageSchema = z
  .object({
    id: z.string(),
    role: z.enum(["system", "user", "assistant"]),
    parts: z.array(
      z.looseObject({ type: z.string().openapi({ example: "text" }) }),
    ),
    metadata: CoachMessageMetadataSchema.nullish(),
  })
  .openapi("CoachMessage");

export type CoachMessage = z.infer<typeof CoachMessageSchema>;

/** A thread and everything said in it, oldest message first. */
export const CoachThreadDetailSchema = z
  .object({
    thread: CoachThreadSchema,
    messages: z.array(CoachMessageSchema),
  })
  .openapi("CoachThreadDetail");

export type CoachThreadDetail = z.infer<typeof CoachThreadDetailSchema>;

/**
 * One turn of the chat.
 *
 * Only the message just typed travels — the rest of the transcript is already
 * on the server, which is what `useChat`'s `prepareSendMessagesRequest` is
 * configured to do in apps/web. `regenerate-message` carries no new message;
 * it names the assistant reply to throw away and answer again.
 */
export const CoachChatRequestSchema = z
  .object({
    thread_id: z.string().openapi({
      example: "8f2c1e34-9a1b-4f6d-8f0e-3b6a1c9d2e77",
    }),
    trigger: z
      .enum(["submit-message", "regenerate-message"])
      .default("submit-message"),
    /** Required when `trigger` is `submit-message`. */
    message: CoachMessageSchema.optional(),
    /**
     * The message this turn starts from, when it isn't a new one at the end of
     * the transcript: the assistant reply to throw away when `trigger` is
     * `regenerate-message`, or — on a `submit-message` — the question already
     * stored that `message` is the athlete's rewrite of. Either way everything
     * after it is forgotten, exactly as far back as the browser forgot it.
     */
    message_id: z.string().optional(),
    /**
     * The window selected in the thread header. It reaches the model as part of
     * the system prompt and as the default for the volume tool, so "how has it
     * been going" answers over the range the athlete is looking at.
     */
    range_weeks: z.number().int().min(1).max(52).default(6),
    /**
     * The language the athlete is reading the app in.
     *
     * Not a general localisation of the coach: what it writes is prose, and
     * server-generated prose is English in both languages (see CLAUDE.md). This
     * covers the one thing the coach puts on screen as *UI* — the questions and
     * choices `askAthlete` draws as a form — because an English form inside a
     * French screen is a different thing from an English sentence in a French
     * answer.
     */
    language: z.enum(["en", "fr"]).default("en"),
  })
  .openapi("CoachChatRequest");

export type CoachChatRequest = z.infer<typeof CoachChatRequestSchema>;

/** `YYYY-MM-DD`. Calendar dates, never timestamps — see coach-store.ts. */
const CalendarDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .openapi({ example: "2026-10-18" });

/**
 * What the coach remembers about the athlete between threads.
 *
 * Everything is nullable: an athlete who has never named a goal race still has
 * a context row's worth of nothing, and the rail renders an empty state rather
 * than the coach opening every conversation by asking again.
 */
export const CoachContextSchema = z
  .object({
    race_name: z.string().nullable().openapi({ example: "Casablanca Half" }),
    race_date: CalendarDateSchema.nullable(),
    /** Metres — 21097.5 for a half. */
    race_distance_m: z.number().nullable(),
    /** The goal time in seconds, or null when the athlete only named a race. */
    target_seconds: z.number().int().nullable(),
    /** 0 = Monday … 6 = Sunday. The day the long run is protected on. */
    long_run_day: z.number().int().min(0).max(6).nullable(),
    /** Injuries, life constraints, anything the athlete asked to be remembered. */
    notes: z.string().nullable(),
    updated_at: z.iso.datetime().nullable(),
  })
  .openapi("CoachContext");

export type CoachContext = z.infer<typeof CoachContextSchema>;

/**
 * A change to the context. Every field is optional, and an omitted field is
 * left alone rather than cleared — see `saveContext` in coach-store.ts.
 */
export const CoachContextPatchSchema = CoachContextSchema.omit({
  updated_at: true,
})
  .partial()
  .openapi("CoachContextPatch");

/** One session of a coach-written week. */
export const PlannedSessionSchema = z
  .object({
    /** 0 = Monday … 6 = Sunday. */
    day: z.number().int().min(0).max(6),
    type: z.string().max(40).openapi({ example: "8 × 400" }),
    /** Kilometres; 0 on a rest day. */
    km: z.number().min(0).max(200),
    /** A target pace, or a note like "legs up" on a rest day. */
    pace: z.string().max(40).openapi({ example: "4:35 /km" }),
    /** A session the week is built around — quality days and the long run. */
    key: z.boolean(),
  })
  .openapi("PlannedSession");

export type PlannedSession = z.infer<typeof PlannedSessionSchema>;

/** A week the athlete accepted, as sessions rather than a paragraph. */
export const CoachPlanSchema = z
  .object({
    week_starting: CalendarDateSchema,
    label: z.string().nullable().openapi({ example: "Build 4 of 9" }),
    sessions: z.array(PlannedSessionSchema).max(7),
  })
  .openapi("CoachPlan");

export type CoachPlan = z.infer<typeof CoachPlanSchema>;

/** The accepted week against what the athlete actually ran. */
export const PlanProgressSchema = z
  .object({
    week_starting: CalendarDateSchema,
    label: z.string().nullable(),
    planned_km: z.number(),
    actual_km: z.number(),
    /** Sessions still to come, counting today. */
    remaining: z.number().int(),
    days: z.array(
      z.object({
        day: z.number().int().min(0).max(6),
        type: z.string(),
        planned_km: z.number(),
        actual_km: z.number(),
        run_ids: z.array(z.number().int()),
      }),
    ),
  })
  .openapi("PlanProgress");

export type PlanProgress = z.infer<typeof PlanProgressSchema>;

/**
 * How loudly a number should read. `alert` is a measurement outside a band the
 * athlete should care about today; `warn` is one drifting towards it.
 */
const ToneSchema = z.enum(["neutral", "warn", "alert"]).openapi("CoachTone");

/** One measured thing about the athlete's training, and what to ask about it. */
export const CoachSignalSchema = z
  .object({
    id: z.string().openapi({ example: "acwr" }),
    label: z.string().openapi({ example: "ACWR · 7:28 day load" }),
    value: z.string().openapi({ example: "1.31" }),
    note: z.string().openapi({ example: "Above the 1.3 band" }),
    tone: ToneSchema,
    /** Tapping the signal asks the coach this. */
    question: z.string(),
  })
  .openapi("CoachSignal");

export type CoachSignal = z.infer<typeof CoachSignalSchema>;

/** Something the coach noticed that the athlete hasn't asked about yet. */
export const CoachQueueItemSchema = z
  .object({
    id: z.string().openapi({ example: "debrief" }),
    title: z.string().openapi({ example: "Debrief ready · Aug 5 evening run" }),
    /** A mono stamp: when this was noticed, not a timestamp to parse. */
    when: z.string().openapi({ example: "LAST RUN · 2 DAYS AGO" }),
    tone: ToneSchema,
    question: z.string(),
    /** The run the item is about, when it is about one. */
    run_id: z.number().int().nullable(),
    /**
     * A conversation that already holds the answer — set when the coach posted
     * a debrief for this run on its own. Tapping the item opens it instead of
     * asking the same question a second time.
     */
    thread_id: z.string().nullable(),
  })
  .openapi("CoachQueueItem");

export type CoachQueueItem = z.infer<typeof CoachQueueItemSchema>;

/**
 * Everything the coach's rails show, in one request.
 *
 * Signals and the queue are both derived from the same page of Strava
 * activities, so splitting them into separate endpoints would fetch that page
 * twice to render one screen.
 */
export const CoachBriefingSchema = z
  .object({
    context: CoachContextSchema,
    plan: PlanProgressSchema.nullable(),
    signals: z.array(CoachSignalSchema),
    queue: z.array(CoachQueueItemSchema),
  })
  .openapi("CoachBriefing");

export type CoachBriefing = z.infer<typeof CoachBriefingSchema>;

/**
 * One Strava webhook event.
 *
 * https://developers.strava.com/docs/webhooks/ — `updates` is documented with
 * string values for a title or type change and `"authorized": "false"` on a
 * deauthorisation, but a privacy change arrives as a boolean, so the value type
 * is widened rather than trusted.
 */
export const StravaEventSchema = z
  .object({
    object_type: z.enum(["activity", "athlete"]),
    object_id: z.number().openapi({ example: 987654321 }),
    aspect_type: z.enum(["create", "update", "delete"]),
    updates: z
      .record(z.string(), z.union([z.string(), z.boolean()]))
      .default({})
      .openapi({ example: { title: "Morning Run" } }),
    /** The Strava athlete id, which is what maps the event back to a user. */
    owner_id: z.number().openapi({ example: 165387970 }),
    subscription_id: z.number(),
    /** Seconds since the epoch. */
    event_time: z.number(),
  })
  .openapi("StravaEvent");

export type StravaEvent = z.infer<typeof StravaEventSchema>;

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
