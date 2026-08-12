import {
  createStravaClient,
  getActivityStreams,
  getLoggedInAthlete,
  getLoggedInAthleteActivities,
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
