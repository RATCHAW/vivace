// The coach's brain: which model answers, what it is told about itself, and
// the four tools that let it read the athlete's Strava history instead of
// guessing. Everything here is provider-agnostic on purpose — swapping Gemini
// for another model is a change to `getCoachConfig` and nothing else.
import { google } from "@ai-sdk/google";
import { tool, type LanguageModel, type ToolSet } from "ai";
import { z } from "zod";
import {
  fetchAthlete,
  fetchRun,
  fetchRuns,
  fetchRunStreams,
  StravaApiError,
} from "./strava.js";
import type { Run, RunStreams } from "./schemas.js";

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

export const COACH_SYSTEM_PROMPT = `
You are Vivace's running coach. You are talking to one athlete, inside their own
training app, and you can read their Strava history with the tools you have been
given.

How you work:
- Look before you answer. Any question about the athlete's fitness, form, volume,
  pace or a specific session is a question about data you can fetch — call
  \`summariseTraining\` or \`listRuns\` first rather than asking them to describe
  their own training. Ask a clarifying question only when the data genuinely
  cannot settle it (goal race, injuries, life constraints).
- Be concrete. "Sunday, 14 km at 6:05 /km" beats "a longer easy run". Give
  distances, paces and days the athlete can act on tomorrow.
- Metric by default: kilometres, min/km pace, metres of elevation. Match the
  athlete if they consistently use miles.
- Keep it short. A few sentences, or a compact markdown list or table for a week
  of sessions. No preamble, no restating the question.
- Coach honestly. If the data says their easy runs are too fast or their volume
  jumped 40% in a week, say so plainly and say what to do about it.

Boundaries: you coach running, not medicine. Pain that persists, or anything
that sounds like an injury, gets one sentence pointing at a physio or doctor —
then get back to what they can safely do meanwhile. If a tool fails or the
athlete has no runs yet, say so instead of inventing numbers.
`.trim();

// --- tool output shaping ------------------------------------------------------
// Tool results go back into the model's context, so they are formatted small and
// human-readable: no raw Strava payloads, no stream arrays with 3000 entries.
// These are exported for coach.test.ts — the numbers the coach reasons over are
// computed here, and a wrong split is a wrong answer.

/** Seconds per kilometre as `m:ss`, the unit every runner thinks in. */
export function pace(secondsPerKm: number | null): string | null {
  if (!secondsPerKm || !Number.isFinite(secondsPerKm)) return null;
  const minutes = Math.floor(secondsPerKm / 60);
  const seconds = Math.round(secondsPerKm % 60);
  return seconds === 60
    ? `${minutes + 1}:00`
    : `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/** `1:24:13` / `41:22` — the clock a run is read off. */
export function clock(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.round(totalSeconds % 60);
  const mm = String(minutes).padStart(hours ? 2 : 1, "0");
  return `${hours ? `${hours}:` : ""}${mm}:${String(seconds).padStart(2, "0")}`;
}

/** start_date_local carries the athlete's wall clock with a Z suffix. */
function localDate(run: Run): string {
  return run.start_date_local.slice(0, 10);
}

function summariseRun(run: Run) {
  return {
    id: run.id,
    date: localDate(run),
    name: run.name,
    sport_type: run.sport_type,
    km: Number((run.distance / 1000).toFixed(2)),
    duration: clock(run.moving_time),
    pace_per_km: pace(run.average_speed > 0 ? 1000 / run.average_speed : null),
    avg_heartrate: run.average_heartrate,
    elevation_m: Math.round(run.total_elevation_gain),
  };
}

/** Monday of the ISO week a date falls in, as `YYYY-MM-DD`. */
export function weekStart(date: string): string {
  const day = new Date(`${date}T00:00:00Z`);
  // getUTCDay(): 0 = Sunday, so Sunday belongs to the week that began 6 days ago.
  const offset = (day.getUTCDay() + 6) % 7;
  day.setUTCDate(day.getUTCDate() - offset);
  return day.toISOString().slice(0, 10);
}

/**
 * Per-kilometre splits from the distance/time streams, plus the trailing part
 * kilometre. This is what turns "how did Sunday go?" into an answer about the
 * second half fading rather than an average.
 */
export function toSplits(streams: RunStreams) {
  const distance = streams.distance?.data;
  const time = streams.time?.data;
  if (!distance?.length || !time?.length) return [];

  const heartrate = streams.heartrate?.data;
  const splits: {
    km: number;
    pace_per_km: string | null;
    avg_heartrate: number | null;
    partial_km?: number;
  }[] = [];

  let startIndex = 0;
  let boundary = 1000;

  const push = (endIndex: number, metres: number, partial: boolean) => {
    const seconds = time[endIndex] - time[startIndex];
    if (seconds <= 0 || metres <= 0) return;
    // The sample the kilometre ticked over on closes this split, so the next
    // one starts after it — counting it twice drags both averages together.
    const from = splits.length === 0 ? startIndex : startIndex + 1;
    const beats: number[] = heartrate?.slice(from, endIndex + 1) ?? [];
    splits.push({
      km: splits.length + 1,
      pace_per_km: pace((seconds / metres) * 1000),
      avg_heartrate: beats.length
        ? Math.round(beats.reduce((sum, bpm) => sum + bpm, 0) / beats.length)
        : null,
      ...(partial ? { partial_km: Number((metres / 1000).toFixed(2)) } : {}),
    });
    startIndex = endIndex;
  };

  for (let i = 0; i < distance.length; i++) {
    if (distance[i] < boundary) continue;
    push(i, distance[i] - distance[startIndex], false);
    boundary += 1000;
  }

  const last = distance.length - 1;
  const trailing = distance[last] - distance[startIndex];
  // Ignore a sliver — a 40 m tail is GPS noise, not a split.
  if (trailing > 100) push(last, trailing, true);

  return splits;
}

/** What a tool says when Strava, not the coach, is the thing that broke. */
function stravaFailure(err: unknown): { error: string } {
  if (err instanceof StravaApiError) {
    return err.status === 401 || err.status === 403
      ? { error: "Strava denied access. Ask the athlete to sign out and back in." }
      : { error: `Strava is unavailable right now (${err.status}).` };
  }
  throw err;
}

/**
 * The coach's tools, bound to one athlete's Strava token. Built per request —
 * the token is short-lived and belongs to the session, not the process.
 */
export function createCoachTools(accessToken: string): ToolSet {
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
            name: [athlete.firstname, athlete.lastname].filter(Boolean).join(" "),
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

    listRuns: tool({
      description:
        "The athlete's most recent runs, newest first — date, distance, " +
        "duration, average pace, average heart rate and elevation. Start here " +
        "for anything about recent training.",
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

    summariseTraining: tool({
      description:
        "Weekly training volume for the last N weeks (Monday-start): number of " +
        "runs, kilometres, time and average pace. Use it for questions about " +
        "load, consistency, ramp rate or whether the athlete is ready for a race.",
      inputSchema: z.object({
        weeks: z
          .number()
          .int()
          .min(1)
          .max(26)
          .default(8)
          .describe("How many recent weeks to summarise."),
      }),
      execute: async ({ weeks }) => {
        try {
          const runs = await fetchRuns(accessToken);
          const byWeek = new Map<
            string,
            { runs: number; metres: number; seconds: number }
          >();

          for (const run of runs) {
            const key = weekStart(localDate(run));
            const week = byWeek.get(key) ?? { runs: 0, metres: 0, seconds: 0 };
            week.runs += 1;
            week.metres += run.distance;
            week.seconds += run.moving_time;
            byWeek.set(key, week);
          }

          const ordered = [...byWeek.entries()]
            .sort((a, b) => b[0].localeCompare(a[0]))
            .slice(0, weeks);

          return {
            weeks: ordered.map(([week_starting, week]) => ({
              week_starting,
              runs: week.runs,
              km: Number((week.metres / 1000).toFixed(1)),
              time: clock(week.seconds),
              avg_pace_per_km: pace(
                week.metres > 0 ? (week.seconds / week.metres) * 1000 : null,
              ),
            })),
          };
        } catch (err) {
          return stravaFailure(err);
        }
      },
    }),

    getRunSplits: tool({
      description:
        "One run in detail, with per-kilometre splits and heart rate. Use it " +
        "when the athlete asks about a specific session — get the run's id from " +
        "listRuns first. Treadmill and manually entered runs have no splits.",
      inputSchema: z.object({
        id: z.number().int().describe("The Strava activity id, from listRuns."),
      }),
      execute: async ({ id }) => {
        try {
          const [run, streams] = await Promise.all([
            fetchRun(accessToken, id),
            fetchRunStreams(accessToken, id),
          ]);
          return { run: summariseRun(run), splits: toSplits(streams) };
        } catch (err) {
          return stravaFailure(err);
        }
      },
    }),
  };
}
