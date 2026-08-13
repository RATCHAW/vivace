import {
  createStravaClient,
  getActivityById,
  getActivityStreams,
  getLoggedInAthlete,
  getLoggedInAthleteActivities,
  type DetailedActivity,
  type DetailedAthlete,
  type StreamSet,
  type SummaryActivity,
} from "@repo/strava-api";
import type { Athlete, Run, RunStreams } from "./schemas.js";

/**
 * Strava's published Swagger omits two fields the live API does return, so the
 * generated `DetailedAthlete` is widened rather than trusted blindly. Both are
 * treated as optional, which is what they are in practice.
 */
type StravaAthleteResponse = DetailedAthlete & {
  username?: string | null;
  bio?: string | null;
};

export class StravaApiError extends Error {
  constructor(readonly status: number) {
    super(`Strava responded with ${status}`);
    this.name = "StravaApiError";
  }
}

/** Maps Strava's (almost entirely optional) athlete onto our own contract. */
function toAthlete(athlete: StravaAthleteResponse): Athlete {
  const now = new Date().toISOString();
  return {
    id: athlete.id ?? 0,
    username: athlete.username ?? null,
    firstname: athlete.firstname ?? "",
    lastname: athlete.lastname ?? "",
    bio: athlete.bio ?? null,
    city: athlete.city ?? null,
    state: athlete.state ?? null,
    country: athlete.country ?? null,
    sex: athlete.sex ?? null,
    premium: athlete.premium ?? false,
    summit: athlete.summit ?? false,
    created_at: athlete.created_at ?? now,
    updated_at: athlete.updated_at ?? now,
    profile: athlete.profile ?? "",
    profile_medium: athlete.profile_medium ?? "",
    // Strava reports 0 for "not set"; the UI wants to know it's absent.
    weight: athlete.weight ? athlete.weight : null,
  };
}

/** `GET /athlete` through the generated SDK, on behalf of one athlete. */
export async function fetchAthlete(accessToken: string): Promise<Athlete> {
  const { data, response } = await getLoggedInAthlete({
    client: createStravaClient(accessToken),
  });

  // `data` is undefined on any non-2xx; the Fault body lands in `error`.
  if (!data) throw new StravaApiError(response?.status ?? 502);

  return toAthlete(data as StravaAthleteResponse);
}

/**
 * Strava's spec also omits heart-rate fields on activities — the live API
 * returns them whenever the run was recorded with a monitor.
 */
type StravaActivityResponse = SummaryActivity & {
  average_heartrate?: number;
  max_heartrate?: number;
};

/**
 * `workout_type` is a plain integer in Strava's payload with no enum behind it.
 * These four are the run values; a ride uses the same field for its own set,
 * which is why the mapping is keyed off run activities only.
 */
const WORKOUT_TYPES: Record<number, Run["workout_type"]> = {
  0: "default",
  1: "race",
  2: "long_run",
  3: "workout",
};

/** Maps a Strava activity onto our own run contract. */
function toRun(activity: StravaActivityResponse): Run {
  return {
    id: activity.id ?? 0,
    name: activity.name ?? "Run",
    distance: activity.distance ?? 0,
    moving_time: activity.moving_time ?? 0,
    total_elevation_gain: activity.total_elevation_gain ?? 0,
    sport_type: activity.sport_type ?? "Run",
    start_date_local: activity.start_date_local ?? new Date().toISOString(),
    average_speed: activity.average_speed ?? 0,
    average_heartrate: activity.average_heartrate ?? null,
    max_heartrate: activity.max_heartrate ?? null,
    // Undefined means "the athlete never tagged it", which is what `default`
    // says too — but an unknown integer must not become a confident label.
    workout_type:
      activity.workout_type == null
        ? "default"
        : (WORKOUT_TYPES[activity.workout_type] ?? "default"),
  };
}

/** `GET /athlete/activities` through the generated SDK, runs only. */
export async function fetchRuns(accessToken: string): Promise<Run[]> {
  const { data, response } = await getLoggedInAthleteActivities({
    client: createStravaClient(accessToken),
    query: { per_page: 100 },
  });

  if (!data) throw new StravaApiError(response?.status ?? 502);

  // "Run", "TrailRun", "VirtualRun" — every run-flavoured sport type.
  return data
    .filter((a) => `${a.sport_type ?? a.type ?? ""}`.includes("Run"))
    .map((a) => toRun(a as StravaActivityResponse));
}

/** `GET /activities/{id}` through the generated SDK — one run by id. */
export async function fetchRun(accessToken: string, id: number): Promise<Run> {
  const { data, response } = await getActivityById({
    client: createStravaClient(accessToken),
    path: { id },
  });

  if (!data) throw new StravaApiError(response?.status ?? 502);

  return toRun(data as StravaActivityResponse);
}

const STREAM_KEYS = [
  "latlng",
  "time",
  "distance",
  "altitude",
  "heartrate",
  "velocity_smooth",
] as const;

/** Picks only the `data` arrays; the rest of `BaseStream` is sampling metadata. */
function toRunStreams(set: StreamSet): RunStreams {
  return {
    latlng: set.latlng?.data ? { data: set.latlng.data } : undefined,
    time: set.time?.data ? { data: set.time.data } : undefined,
    distance: set.distance?.data ? { data: set.distance.data } : undefined,
    altitude: set.altitude?.data ? { data: set.altitude.data } : undefined,
    heartrate: set.heartrate?.data ? { data: set.heartrate.data } : undefined,
    velocity_smooth: set.velocity_smooth?.data
      ? { data: set.velocity_smooth.data }
      : undefined,
  };
}

/** `GET /activities/{id}/streams` through the generated SDK. */
export async function fetchRunStreams(
  accessToken: string,
  id: number,
): Promise<RunStreams> {
  const { data, response } = await getActivityStreams({
    client: createStravaClient(accessToken),
    path: { id },
    query: { keys: [...STREAM_KEYS], key_by_type: true },
  });

  if (!data) {
    // Strava 404s on activities without any streams (e.g. manual entries).
    if (response?.status === 404) return {};
    throw new StravaApiError(response?.status ?? 502);
  }

  return toRunStreams(data);
}

/**
 * One of Strava's own best efforts on a run — it computes the fastest 400 m,
 * 1 k, mile, 5 k, 10 k, half and marathon inside every activity, which is a PR
 * table we would otherwise have to derive from streams ourselves.
 */
export interface BestEffort {
  /** Strava's label: "5k", "10k", "Half-Marathon", … */
  name: string;
  /** Metres. */
  distance: number;
  /** Seconds. */
  elapsed_time: number;
  /** 1 when this effort is the athlete's all-time best at the distance. */
  pr_rank: number | null;
  activity_id: number;
  /** The date of the run the effort was set on, `YYYY-MM-DD`. */
  date: string;
}

/** A run with the fields only `GET /activities/{id}` returns. */
export interface RunDetail {
  run: Run;
  /** Google-encoded route, for a thumbnail. Null on treadmill runs. */
  polyline: string | null;
  calories: number | null;
  device_name: string | null;
  /** Ties the run to a pair of shoes; resolve the name with `fetchShoes`. */
  gear_id: string | null;
  best_efforts: BestEffort[];
}

type StravaDetailResponse = DetailedActivity & {
  average_heartrate?: number;
  max_heartrate?: number;
};

/**
 * Detail calls are per-activity, and Strava's budget is ~100 requests per 15
 * minutes for the whole app. A race prediction reads several runs at once and
 * the athlete will ask for it more than once an hour, so answers are held for
 * the length of a rate-limit window. Activity ids are globally unique, so one
 * athlete can never read another's row out of here.
 */
const DETAIL_TTL_MS = 15 * 60 * 1000;
const DETAIL_CACHE_MAX = 500;
const detailCache = new Map<number, { at: number; detail: RunDetail }>();

function cachedDetail(id: number): RunDetail | null {
  const hit = detailCache.get(id);
  if (!hit) return null;
  if (Date.now() - hit.at > DETAIL_TTL_MS) {
    detailCache.delete(id);
    return null;
  }
  return hit.detail;
}

function cacheDetail(id: number, detail: RunDetail): void {
  // Insertion-ordered, so the oldest key is the first one out.
  if (detailCache.size >= DETAIL_CACHE_MAX) {
    const oldest = detailCache.keys().next().value;
    if (oldest !== undefined) detailCache.delete(oldest);
  }
  detailCache.set(id, { at: Date.now(), detail });
}

/** `GET /activities/{id}` with the fields the summary list leaves out. */
export async function fetchRunDetail(
  accessToken: string,
  id: number,
): Promise<RunDetail> {
  const cached = cachedDetail(id);
  if (cached) return cached;

  const { data, response } = await getActivityById({
    client: createStravaClient(accessToken),
    path: { id },
  });

  if (!data) throw new StravaApiError(response?.status ?? 502);

  const activity = data as StravaDetailResponse;
  const detail: RunDetail = {
    run: toRun(activity),
    polyline: activity.map?.summary_polyline || null,
    calories: activity.calories ?? null,
    device_name: activity.device_name ?? null,
    gear_id: activity.gear_id ?? null,
    best_efforts: (activity.best_efforts ?? [])
      .filter((effort) => effort.name && effort.elapsed_time)
      .map((effort) => ({
        name: effort.name ?? "",
        distance: effort.distance ?? 0,
        elapsed_time: effort.elapsed_time ?? 0,
        pr_rank: effort.pr_rank ?? null,
        activity_id: activity.id ?? id,
        date: (
          activity.start_date_local ??
          effort.start_date_local ??
          ""
        ).slice(0, 10),
      })),
  };

  cacheDetail(id, detail);
  return detail;
}

/** A pair of shoes and the distance logged on them. */
export interface Shoe {
  id: string;
  name: string;
  /** Metres. */
  distance: number;
  primary: boolean;
}

/**
 * The athlete's shoes, or an empty list.
 *
 * Gear only comes back on `GET /athlete` when the token carries
 * `profile:read_all`; ours asks for `read,activity:read` (see auth.ts), so this
 * is empty for every athlete until that scope is added. Absence is a normal
 * answer here rather than an error — the shoe signal simply doesn't appear.
 */
export async function fetchShoes(accessToken: string): Promise<Shoe[]> {
  const { data, response } = await getLoggedInAthlete({
    client: createStravaClient(accessToken),
  });

  if (!data) throw new StravaApiError(response?.status ?? 502);

  return (data.shoes ?? [])
    .filter((shoe) => shoe.id)
    .map((shoe) => ({
      id: shoe.id ?? "",
      name: shoe.name ?? "Shoes",
      distance: shoe.distance ?? 0,
      primary: shoe.primary ?? false,
    }));
}
