import {
  createStravaClient,
  getLoggedInAthlete,
  type DetailedAthlete,
} from "@repo/strava-api";
import type { Athlete } from "./schemas.js";

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
