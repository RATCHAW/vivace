// A typed Strava API client, generated from Strava's own Swagger 2.0 spec.
//
//   pnpm --filter @repo/strava-api spec:pull   # refresh openapi/strava-swagger.json
//   pnpm --filter @repo/strava-api generate    # regenerate src/generated
//
// Everything under src/generated is produced by @hey-api/openapi-ts and is
// committed — don't hand-edit it. This file is the hand-written surface.

import { createClient, createConfig } from "./generated/client/index";
import type { ClientOptions } from "./generated/types.gen";

/** Every SDK call is relative to this — it is the spec's `host` + `basePath`. */
export const STRAVA_API_BASE = "https://www.strava.com/api/v3";

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
