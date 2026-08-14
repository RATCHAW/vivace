// The coach's brain: which model answers, what it is told about itself, and the
// tools that let it read the athlete's Strava history instead of guessing.
// Everything here is provider-agnostic on purpose — swapping Gemini for another
// model is a change to `getCoachConfig` and nothing else.
//
// Several tools return a `card` field. That is a contract with the browser:
// apps/web renders the tool's output as a chart, a plan or a run card rather
// than as JSON, so the shape of those outputs is part of the UI and changing
// one means changing `coach-cards.tsx` with it.
import { google } from "@ai-sdk/google";
import { tool, type LanguageModel, type ToolSet } from "ai";
import { z } from "zod";
import {
  fetchAthlete,
  fetchRun,
  fetchRunDetail,
  fetchRuns,
  fetchRunStreams,
  StravaApiError,
  type BestEffort,
} from "./strava.js";
import { getContext, getPlan, saveContext } from "./coach-store.js";
import {
  describeGoal,
  readTraining,
  toQueue,
  toSignals,
  weeksToRace,
} from "./briefing.js";
import {
  bestPerDistance,
  clock,
  decoupling,
  localDate,
  pace,
  predictRaces,
  routePath,
  toSplits,
  weeklyVolume,
  weekStart,
} from "./training.js";
import type { Run } from "./schemas.js";

// The pure helpers moved to training.ts, where they are unit-tested. Re-exported
// here because they are the coach's own vocabulary and callers import them from
// the coach.
export { clock, pace, toSplits, weekStart } from "./training.js";

/** Gemini 2.5 Flash unless `COACH_MODEL` names another Google model. */
const DEFAULT_MODEL = "gemini-2.5-flash";

export interface CoachConfig {
  model: LanguageModel;
  modelId: string;
}

/**
 * Null until an API key is configured — the chat route turns that into a 503
 * with instructions rather than a crash, the same way the render routes treat
 * a missing Remotion Lambda deployment.
 */
export function getCoachConfig(): CoachConfig | null {
  // The name @ai-sdk/google reads by default; set it and the provider is wired.
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) return null;
  // `||`, not `??`: docker-compose passes an unset variable through as "".
  const modelId = process.env.COACH_MODEL || DEFAULT_MODEL;
  return { model: google(modelId), modelId };
}

export const COACH_NOT_CONFIGURED =
  "The coach is not configured on this server. Get a key from " +
  "https://aistudio.google.com/apikey and set GOOGLE_GENERATIVE_AI_API_KEY in " +
  "apps/api/.env.";

/**
 * Thinking-capable Gemini models (2.5 and up) stream their reasoning when asked;
 * the UI renders it in a collapsible panel above the answer.
 */
export const COACH_PROVIDER_OPTIONS = {
  google: { thinkingConfig: { includeThoughts: true } },
};

const BASE_SYSTEM_PROMPT = `
You are Vivace's running coach. You are talking to one athlete, inside their own
training app, and you can read their Strava history with the tools you have been
given.

How you work:
- Look before you answer. Any question about the athlete's fitness, form, volume,
  pace or a specific session is a question about data you can fetch — call a tool
  first rather than asking them to describe their own training. Ask a clarifying
  question only when the data genuinely cannot settle it (which race, what has
  hurt, which days they can run).
- Be concrete. "Sunday, 14 km at 6:05 /km" beats "a longer easy run". Give
  distances, paces and days the athlete can act on tomorrow.
- Metric by default: kilometres, min/km pace, metres of elevation. Match the
  athlete if they consistently use miles.
- Keep it short. A few sentences. No preamble, no restating the question.
- Coach honestly. If the data says their easy runs are too fast or their volume
  jumped 40% in a week, say so plainly and say what to do about it.

Some tools draw something the athlete can see:
- \`getRunDebrief\` and \`getRunSplits\` draw the run, its splits and its heart
  rate. \`summariseTraining\` draws the weekly volume chart. \`predictRaces\`
  draws the best-effort table. \`proposeWeek\` draws the week as seven session
  cards with an Accept button.
- When you have drawn one, do not repeat it as a markdown table or a list of the
  same numbers. Write the read the chart cannot: what it means and what to do.
  Two or three sentences, naming at most a couple of specific figures.

Memory: \`getAthleteContext\` is the goal race, target time and long-run day.
Call \`setAthleteContext\` the moment the athlete tells you any of it — a race,
a date, a target, an injury, the days they can run — so the next thread starts
knowing. Never ask for something the context already holds.

Planning: when the athlete asks for a week, a plan or a taper, write it with
\`proposeWeek\`. Seven days, day 0 is Monday, rest days included with 0 km. Build
it around the goal race and the load numbers, not around a template.

Boundaries: you coach running, not medicine. Pain that persists, or anything
that sounds like an injury, gets one sentence pointing at a physio or doctor —
then get back to what they can safely do meanwhile. If a tool fails or the
athlete has no runs yet, say so instead of inventing numbers.
`.trim();

/**
 * The system prompt with today's date and the window the athlete has selected
 * in the thread header folded in.
 *
 * The date matters more than it looks: the model has no clock, and "last week"
 * is the single most common thing an athlete asks about.
 */
export function coachSystemPrompt(
  today: string,
  rangeWeeks: number,
  attached?: AttachedRun,
): string {
  const lines = [
    BASE_SYSTEM_PROMPT,
    `Today is ${today}. The athlete is looking at the last ${rangeWeeks} weeks of training; prefer that window unless they ask for another.`,
  ];
  if (attached) {
    lines.push(
      `The athlete attached a run to this message: "${attached.name}" on ${attached.date}, Strava activity id ${attached.id}. "This run", "it" and "that session" mean that one — read it rather than asking which.`,
    );
  }
  return lines.join("\n\n");
}

/** The run the composer's `@` picker put on a message. */
export interface AttachedRun {
  id: number;
  name: string;
  date: string;
}

/**
 * Metadata is only validated when a schema is supplied, and an unvalidated
 * field would reach the model as whatever the browser felt like sending.
 *
 * Optional at the top level because `validateUIMessages` runs this against
 * every message's metadata whether or not it has any, and most messages don't.
 */
export const coachMessageMetadataSchema = z
  .object({
    run: z
      .object({ id: z.number().int(), name: z.string(), date: z.string() })
      .optional(),
  })
  .optional();

/** The run attached to the newest message in a transcript, if there is one. */
export function attachedRun(
  messages: { metadata?: unknown }[],
): AttachedRun | undefined {
  const parsed = coachMessageMetadataSchema.safeParse(
    messages.at(-1)?.metadata,
  );
  return parsed.success ? parsed.data?.run : undefined;
}

// --- tool output shaping ------------------------------------------------------
// Tool results go back into the model's context as well as to the browser, so
// they are formatted small: no raw Strava payloads, no stream arrays with 3000
// entries, and numbers already in the units a runner reads.

function paceOf(run: Run): string | null {
  return pace(run.average_speed > 0 ? 1000 / run.average_speed : null);
}

function summariseRun(run: Run) {
  return {
    id: run.id,
    date: localDate(run),
    name: run.name,
    sport_type: run.sport_type,
    workout_type: run.workout_type,
    km: Number((run.distance / 1000).toFixed(2)),
    duration: clock(run.moving_time),
    pace_per_km: paceOf(run),
    avg_heartrate: run.average_heartrate,
    elevation_m: Math.round(run.total_elevation_gain),
  };
}

/** `Aug 5` — how a run is named in a card title. */
function shortDate(date: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}

/** What a tool says when Strava, not the coach, is the thing that broke. */
function stravaFailure(err: unknown): { error: string } {
  if (err instanceof StravaApiError) {
    return err.status === 401 || err.status === 403
      ? {
          error:
            "Strava denied access. Ask the athlete to sign out and back in.",
        }
      : { error: `Strava is unavailable right now (${err.status}).` };
  }
  throw err;
}

/**
 * How this run sits against the four weeks behind it.
 *
 * The debrief card carries one factual line rather than a written one: it is
 * built before the model writes a word, so it states what is measurable and
 * leaves the reading to the answer underneath it.
 */
function comparisonLine(run: Run, runs: Run[], today: string): string {
  const window = runs.filter((other) => {
    const date = localDate(other);
    return other.id !== run.id && date <= today && date >= addWeeks(today, -4);
  });
  if (window.length === 0)
    return "First run in this window — nothing to compare it to yet.";

  const meanKm =
    window.reduce((sum, other) => sum + other.distance, 0) /
    window.length /
    1000;
  const km = run.distance / 1000;
  const deltaKm = km - meanKm;
  const parts = [
    `${Math.abs(deltaKm).toFixed(1)} km ${deltaKm >= 0 ? "longer" : "shorter"} than the four-week average of ${meanKm.toFixed(1)} km`,
  ];

  const withHr = window.filter((other) => (other.average_heartrate ?? 0) > 0);
  if (run.average_heartrate && withHr.length) {
    const meanHr =
      withHr.reduce((sum, other) => sum + (other.average_heartrate ?? 0), 0) /
      withHr.length;
    const deltaHr = Math.round(run.average_heartrate - meanHr);
    parts.push(
      deltaHr === 0
        ? "at exactly the usual heart rate"
        : `at ${Math.abs(deltaHr)} bpm ${deltaHr > 0 ? "above" : "below"} the usual`,
    );
  }
  return `${parts.join(", ")}.`;
}

function addWeeks(date: string, weeks: number): string {
  const day = new Date(`${date}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() + weeks * 7);
  return day.toISOString().slice(0, 10);
}

/**
 * Which runs are worth spending a detail call on to find best efforts.
 *
 * Strava only returns best efforts on the per-activity endpoint, and the budget
 * is roughly 100 requests per quarter hour for the whole app. A PR lives in a
 * fast run or a long one, so the candidates are the quickest handful plus the
 * furthest — never the whole history.
 */
const PR_CANDIDATES = 6;

function prCandidates(runs: Run[], today: string): Run[] {
  const window = runs.filter(
    (run) => localDate(run) >= addWeeks(today, -26) && run.distance >= 1500,
  );
  const fastest = [...window]
    .sort((a, b) => b.average_speed - a.average_speed)
    .slice(0, PR_CANDIDATES);
  const longest = [...window].sort((a, b) => b.distance - a.distance)[0];
  const chosen = new Map(fastest.map((run) => [run.id, run]));
  if (longest) chosen.set(longest.id, longest);
  return [...chosen.values()];
}

/**
 * One run as the card the athlete sees.
 *
 * Shared by the `getRunDebrief` tool and by the webhook that posts a debrief
 * the moment a run finishes uploading, so the automatic card and the one the
 * coach draws when asked are the same object rather than two that drifted.
 */
export async function buildRunDebriefCard(
  accessToken: string,
  runs: Run[],
  today: string,
  id?: number,
) {
  const target = id ? runs.find((run) => run.id === id) : runs[0];
  if (!target && !id) return null;

  const detail = await fetchRunDetail(accessToken, target?.id ?? id!);
  const run = target ?? detail.run;
  const date = localDate(run);

  return {
    card: "run-debrief" as const,
    run_id: run.id,
    title: `${run.name} · ${shortDate(date)}`,
    date,
    stamp:
      run.workout_type === "default"
        ? "RUN"
        : run.workout_type.replace("_", " ").toUpperCase(),
    route_path: routePath(detail.polyline),
    line: comparisonLine(run, runs, today),
    stats: [
      { label: "DISTANCE", value: `${(run.distance / 1000).toFixed(2)} km` },
      { label: "TIME", value: clock(run.moving_time) },
      { label: "PACE", value: `${paceOf(run) ?? "—"} /km` },
      {
        label: "AVG HR",
        value: run.average_heartrate
          ? `${Math.round(run.average_heartrate)}`
          : "—",
      },
    ],
    elevation_m: Math.round(run.total_elevation_gain),
    calories: detail.calories,
  };
}

/** The context to bind a set of tools to one athlete and one turn. */
export interface CoachToolContext {
  accessToken: string;
  userId: string;
  /** `YYYY-MM-DD` in the athlete's own terms. */
  today: string;
  /** The window selected in the thread header. */
  rangeWeeks: number;
}

/**
 * The coach's tools, bound to one athlete and one turn. Built per request — the
 * Strava token is short-lived and belongs to the session, not the process.
 */
export function createCoachTools(ctx: CoachToolContext): ToolSet {
  const { accessToken, userId, today, rangeWeeks } = ctx;

  return {
    getAthleteProfile: tool({
      description:
        "The athlete's Strava profile: name, location, and weight when they " +
        "have set one. Use it to personalise, not to open every answer with.",
      inputSchema: z.object({}),
      execute: async () => {
        try {
          const athlete = await fetchAthlete(accessToken);
          return {
            name: [athlete.firstname, athlete.lastname]
              .filter(Boolean)
              .join(" "),
            city: athlete.city,
            country: athlete.country,
            sex: athlete.sex,
            weight_kg: athlete.weight,
          };
        } catch (err) {
          return stravaFailure(err);
        }
      },
    }),

    getAthleteContext: tool({
      description:
        "What the athlete is training for: goal race, date, target time, the " +
        "day their long run lives on, and anything they asked you to remember. " +
        "Read this before planning anything.",
      inputSchema: z.object({}),
      execute: async () => {
        const context = await getContext(userId);
        return {
          ...context,
          weeks_to_race: weeksToRace(context, today),
          target: context.target_seconds ? clock(context.target_seconds) : null,
          summary: describeGoal(context, today),
        };
      },
    }),

    setAthleteContext: tool({
      description:
        "Remember something about the athlete's goals across every thread. " +
        "Call this as soon as they mention a race, a date, a target time, the " +
        "days they can run, or an injury. Only pass the fields that changed; " +
        "pass null to clear one.",
      inputSchema: z.object({
        race_name: z
          .string()
          .max(120)
          .nullish()
          .describe("e.g. Casablanca Half"),
        race_date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .nullish()
          .describe("Race day, YYYY-MM-DD."),
        race_distance_m: z
          .number()
          .nullish()
          .describe("Metres. A half is 21097.5, a marathon 42195."),
        target_seconds: z
          .number()
          .int()
          .nullish()
          .describe("Goal finish time in seconds. 1:38:00 is 5880."),
        long_run_day: z
          .number()
          .int()
          .min(0)
          .max(6)
          .nullish()
          .describe("0 = Monday … 6 = Sunday."),
        notes: z
          .string()
          .max(600)
          .nullish()
          .describe("Injuries, life constraints, anything to carry forward."),
      }),
      execute: async (patch) => {
        const context = await saveContext(userId, patch);
        return { saved: true, context, summary: describeGoal(context, today) };
      },
    }),

    listRuns: tool({
      description:
        "The athlete's most recent runs, newest first — date, distance, " +
        "duration, average pace, average heart rate, elevation and how the run " +
        "was tagged in Strava. Start here for anything about recent training, " +
        "and to find the id of a run to look at in detail.",
      inputSchema: z.object({
        limit: z
          .number()
          .int()
          .min(1)
          .max(50)
          .default(15)
          .describe("How many runs to return, newest first."),
        since: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional()
          .describe("Only runs on or after this date (YYYY-MM-DD)."),
      }),
      execute: async ({ limit, since }) => {
        try {
          const runs = await fetchRuns(accessToken);
          const filtered = since
            ? runs.filter((run) => localDate(run) >= since)
            : runs;
          return {
            total_runs_available: runs.length,
            runs: filtered.slice(0, limit).map(summariseRun),
          };
        } catch (err) {
          return stravaFailure(err);
        }
      },
    }),

    getRunDebrief: tool({
      description:
        "One run as a card the athlete can see: its numbers, its route, and " +
        "how it compares to the four weeks behind it. Use it when they ask " +
        "about a specific session, or to open a debrief of the latest run. " +
        "Draws the run — don't repeat its numbers underneath.",
      inputSchema: z.object({
        id: z
          .number()
          .int()
          .optional()
          .describe("The Strava activity id. Omit for the most recent run."),
      }),
      execute: async ({ id }) => {
        try {
          const runs = await fetchRuns(accessToken);
          const card = await buildRunDebriefCard(accessToken, runs, today, id);
          return card ?? { error: "This athlete has no runs yet." };
        } catch (err) {
          return stravaFailure(err);
        }
      },
    }),

    getRunSplits: tool({
      description:
        "One run kilometre by kilometre, with heart rate and the aerobic " +
        "decoupling between its halves. Use it when the athlete asks why a run " +
        "went the way it did. Draws the splits chart — write the read, not the " +
        "numbers. Treadmill and manually entered runs have no splits.",
      inputSchema: z.object({
        id: z.number().int().describe("The Strava activity id, from listRuns."),
      }),
      execute: async ({ id }) => {
        try {
          const [run, streams] = await Promise.all([
            fetchRun(accessToken, id),
            fetchRunStreams(accessToken, id),
          ]);
          const splits = toSplits(streams);
          if (splits.length === 0) {
            return {
              error:
                "That run has no distance stream — a treadmill or manual entry. " +
                "Its totals are still readable with getRunDebrief.",
            };
          }

          const half = Math.floor(splits.length / 2);
          const mean = (from: number, to: number) =>
            splits
              .slice(from, to)
              .reduce((sum, split) => sum + split.seconds_per_km, 0) /
            Math.max(1, to - from);

          return {
            card: "run-splits" as const,
            run_id: run.id,
            title: `${run.name} · ${shortDate(localDate(run))} · ${(run.distance / 1000).toFixed(2)} km`,
            splits,
            first_half_pace: pace(mean(0, half)),
            second_half_pace: pace(mean(half, splits.length)),
            /** Positive means the back half was slower. */
            fade_seconds_per_km: Math.round(
              mean(half, splits.length) - mean(0, half),
            ),
            decoupling_pct: decoupling(streams),
            avg_heartrate: run.average_heartrate,
            max_heartrate: run.max_heartrate,
          };
        } catch (err) {
          return stravaFailure(err);
        }
      },
    }),

    summariseTraining: tool({
      description:
        "Weekly volume for the last N weeks (Monday-start) with the ramp " +
        "against each previous week, plus the 7:28 day acute:chronic load " +
        "ratio. Use it for load, consistency, ramp rate or race readiness. " +
        "Draws the volume chart — write the read, not the table.",
      inputSchema: z.object({
        weeks: z
          .number()
          .int()
          .min(1)
          .max(26)
          .default(rangeWeeks)
          .describe("How many recent weeks to summarise."),
      }),
      execute: async ({ weeks }) => {
        try {
          const runs = await fetchRuns(accessToken);
          const readout = await readTraining(accessToken, runs, today);
          return {
            card: "training-volume" as const,
            weeks: weeklyVolume(runs, weeks, today),
            load: readout.load,
            easy_intensity: readout.easy,
          };
        } catch (err) {
          return stravaFailure(err);
        }
      },
    }),

    getTrainingSignals: tool({
      description:
        "The measured state of the athlete's training right now: load ratio, " +
        "how much of their easy running sits in zone 3, aerobic decoupling on " +
        "the last long run, and shoe mileage when Strava shares it. Use it to " +
        "answer 'how am I doing' and to explain any signal they tapped.",
      inputSchema: z.object({}),
      execute: async () => {
        try {
          const runs = await fetchRuns(accessToken);
          const [readout, context] = await Promise.all([
            readTraining(accessToken, runs, today),
            getContext(userId),
          ]);
          return {
            signals: toSignals(readout),
            queue: toQueue(readout, runs, context, today),
            goal: describeGoal(context, today),
          };
        } catch (err) {
          return stravaFailure(err);
        }
      },
    }),

    predictRaces: tool({
      description:
        "What the athlete could run today at 5K, 10K, half and marathon, from " +
        "Strava's own best efforts inside their fastest recent runs. Use it for " +
        "race shape, goal times and whether a target is realistic. Draws the " +
        "prediction table.",
      inputSchema: z.object({}),
      execute: async () => {
        try {
          const runs = await fetchRuns(accessToken);
          const candidates = prCandidates(runs, today);
          if (candidates.length === 0) {
            return { error: "No runs long enough to predict a race from yet." };
          }

          const details = await Promise.all(
            candidates.map((run) => fetchRunDetail(accessToken, run.id)),
          );
          const efforts: BestEffort[] = details.flatMap((d) => d.best_efforts);
          const predictions = predictRaces(efforts);
          if (predictions.length === 0) {
            return {
              error:
                "Strava recorded no best efforts on these runs — it only " +
                "computes them for runs with a distance stream.",
            };
          }

          const context = await getContext(userId);
          const goalPrediction = context.race_distance_m
            ? predictions.reduce((closest, p) =>
                Math.abs(p.metres - context.race_distance_m!) <
                Math.abs(closest.metres - context.race_distance_m!)
                  ? p
                  : closest,
              )
            : null;

          return {
            card: "race-prediction" as const,
            efforts: bestPerDistance(efforts).map((effort) => ({
              name: effort.name,
              time: clock(effort.elapsed_time),
              date: shortDate(effort.date),
              pr: effort.pr_rank === 1,
              activity_id: effort.activity_id,
            })),
            predictions,
            goal: goalPrediction
              ? {
                  race: context.race_name,
                  distance: goalPrediction.name,
                  today: goalPrediction.time,
                  target: context.target_seconds
                    ? clock(context.target_seconds)
                    : null,
                  /** Seconds the athlete still has to find. Negative = ahead of target. */
                  gap_seconds: context.target_seconds
                    ? goalPrediction.seconds - context.target_seconds
                    : null,
                  weeks_to_race: weeksToRace(context, today),
                }
              : null,
          };
        } catch (err) {
          return stravaFailure(err);
        }
      },
    }),

    proposeWeek: tool({
      description:
        "Write the athlete's next seven days as sessions they can accept. " +
        "Always seven entries, day 0 = Monday through day 6 = Sunday, rest days " +
        "included with km 0. Draws the week as cards with an Accept button — " +
        "underneath it, say why the week is shaped that way, not what is in it.",
      inputSchema: z.object({
        week_starting: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional()
          .describe("The Monday the week starts on. Defaults to this week."),
        label: z
          .string()
          .max(60)
          .optional()
          .describe("Where the week sits in the block, e.g. 'Build 4 of 9'."),
        sessions: z
          .array(
            z.object({
              day: z.number().int().min(0).max(6).describe("0 = Monday."),
              type: z
                .string()
                .max(40)
                .describe("Recovery, Easy, 8 × 400, Tempo, Long, Rest."),
              km: z
                .number()
                .min(0)
                .max(200)
                .describe("Kilometres; 0 for rest."),
              pace: z
                .string()
                .max(40)
                .describe(
                  "Target pace like '6:05 /km', or a note like 'legs up'.",
                ),
              key: z
                .boolean()
                .describe("True for the sessions the week is built around."),
            }),
          )
          .length(7)
          .describe("Seven days, Monday first."),
      }),
      execute: async ({ week_starting, label, sessions }) => {
        const week = week_starting ?? weekStart(today);
        const accepted = await getPlan(userId, week);
        const total = sessions.reduce((sum, session) => sum + session.km, 0);
        return {
          card: "week-plan" as const,
          week_starting: week,
          label: label ?? null,
          sessions: [...sessions].sort((a, b) => a.day - b.day),
          total_km: Number(total.toFixed(1)),
          quality: sessions.filter((session) => session.key).length,
          /** True when this exact week has already been accepted. */
          accepted: accepted !== null,
        };
      },
    }),
  };
}
