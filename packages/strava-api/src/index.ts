// A typed Strava API client, generated from Strava's own Swagger 2.0 spec.
//
//   pnpm --filter @repo/strava-api spec:pull   # refresh openapi/strava-swagger.json
//   pnpm --filter @repo/strava-api generate    # regenerate src/generated
//
// Everything under src/generated is produced by @hey-api/openapi-ts and is
// committed — don't hand-edit it. This file is the hand-written surface.

import { createClient, createConfig } from "./generated/client/index";
import type { ClientOptions } from "./generated/types.gen";

/** Strava's own address — the spec's `host` + `basePath`. */
const STRAVA_API_URL = "https://www.strava.com/api/v3";

/**
 * Every SDK call is relative to this.
 *
 * `STRAVA_API_BASE_URL` points the whole SDK somewhere else, which is what lets
 * the end-to-end suite run the real routes against a Strava it controls
 * (apps/e2e/fake-strava.ts) instead of stubbing out the client and testing the
 * stub. It is a test seam and it is **deliberately inert in production**: an
 * override there would redirect every athlete's access token to whatever
 * address the environment named, which is an exfiltration vector rather than a
 * configuration option.
 */
export const STRAVA_API_BASE = resolveApiBase();

type MaybeNode = {
  process?: { env?: Record<string, string | undefined> };
};

function resolveApiBase(): string {
  // Read off `globalThis` rather than the `process` global: this package has no
  // Node types, and adding @types/node for one lookup would make a client that
  // is otherwise runtime-agnostic Node-only on paper. Absent `process` — a
  // bundle in a browser — there is nothing to override with anyway.
  const env = (globalThis as MaybeNode).process?.env;
  if (!env) return STRAVA_API_URL;
  if (env.NODE_ENV === "production" || env.APP_ENV === "production") {
    return STRAVA_API_URL;
  }
  return env.STRAVA_API_BASE_URL || STRAVA_API_URL;
}

export * from "./generated/sdk.gen";
export type * from "./generated/types.gen";
export type { Client } from "./generated/client/index";

/**
 * A client bound to one athlete's OAuth access token.
 *
 * Strava is a per-user API, so there is no useful process-wide default client —
 * create one per request and pass it to the SDK functions:
 *
 * ```ts
 * const { data } = await getLoggedInAthlete({ client: createStravaClient(token) })
 * ```
 */
export function createStravaClient(accessToken: string) {
  return createClient(
    createConfig<ClientOptions>({
      baseUrl: STRAVA_API_BASE,
      // The spec marks every operation `bearer`, so this becomes `Authorization: Bearer …`.
      auth: () => accessToken,
    }),
  );
}
