import "dotenv/config";
import { betterAuth } from "better-auth";
import { genericOAuth, openAPI } from "better-auth/plugins";
import { createStravaClient, getLoggedInAthlete } from "@repo/strava-api";
import { pool } from "./db.js";

const production =
  process.env.NODE_ENV === "production" || process.env.APP_ENV === "production";

const baseURL = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
const webOrigin = process.env.WEB_ORIGIN ?? "http://localhost:5173";
const secret = process.env.BETTER_AUTH_SECRET;
const stravaClientId = process.env.STRAVA_CLIENT_ID ?? "";
const stravaClientSecret = process.env.STRAVA_CLIENT_SECRET ?? "";

if (production) {
  const missing = [
    ["BETTER_AUTH_URL", process.env.BETTER_AUTH_URL],
    ["WEB_ORIGIN", process.env.WEB_ORIGIN],
    ["BETTER_AUTH_SECRET", secret],
    ["STRAVA_CLIENT_ID", stravaClientId],
    ["STRAVA_CLIENT_SECRET", stravaClientSecret],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);

  if (missing.length > 0) {
    throw new Error(`Missing required production configuration: ${missing.join(", ")}`);
  }
  if ((secret?.length ?? 0) < 32) {
    throw new Error("BETTER_AUTH_SECRET must be at least 32 characters in production");
  }
  for (const [name, value] of [
    ["BETTER_AUTH_URL", baseURL],
    ["WEB_ORIGIN", webOrigin],
  ] as const) {
    if (new URL(value).protocol !== "https:") {
      throw new Error(`${name} must use https in production`);
    }
  }
}

export const auth = betterAuth({
  database: pool,
  baseURL,
  secret,
  trustedOrigins: [webOrigin],
  plugins: [
    // Documents the /api/auth/* routes; Scalar reference at /api/auth/reference.
    openAPI(),
    genericOAuth({
      config: [
        {
          providerId: "strava",
          clientId: stravaClientId,
          clientSecret: stravaClientSecret,
          authorizationUrl: "https://www.strava.com/oauth/authorize",
          tokenUrl: "https://www.strava.com/oauth/token",
          // Strava expects client_id/client_secret in the POST body, not Basic auth
          authentication: "post",
          // Strava scopes are comma-separated, so keep them in a single entry.
          //
          // `activity:read_all` rather than `activity:read`: a run marked "Only
          // You" is still a run, and a coach that can't see it reports the
          // wrong weekly volume and the wrong load ratio. `profile:read_all` is
          // what puts gear on GET /athlete, which is where shoe mileage lives.
          //
          // Widening this list invalidates nothing, but an athlete who
          // authorised the old set keeps the old token until they sign out and
          // back in — every caller here degrades rather than failing.
          scopes: ["read,activity:read_all,profile:read_all"],
          getUserInfo: async (tokens) => {
            if (!tokens.accessToken) return null;
            const { data: athlete } = await getLoggedInAthlete({
              client: createStravaClient(tokens.accessToken),
            });
            if (!athlete?.id) return null;
            const now = new Date();
            return {
              id: String(athlete.id),
              name: [athlete.firstname, athlete.lastname].filter(Boolean).join(" "),
              // Strava never exposes the athlete's email, so store a stable placeholder
              email: `strava-${athlete.id}@users.noreply.strava.local`,
              emailVerified: false,
              image: athlete.profile,
              createdAt: now,
              updatedAt: now,
            };
          },
        },
      ],
    }),
  ],
});
