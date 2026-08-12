import "dotenv/config";
import { betterAuth } from "better-auth";
import { genericOAuth } from "better-auth/plugins";
import pg from "pg";
import type { StravaAthlete } from "@repo/shared";

export const STRAVA_API_BASE = "https://www.strava.com/api/v3";

export const auth = betterAuth({
  database: new pg.Pool({ connectionString: process.env.DATABASE_URL }),
  baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
  secret: process.env.BETTER_AUTH_SECRET,
  trustedOrigins: [process.env.WEB_ORIGIN ?? "http://localhost:5173"],
  plugins: [
    genericOAuth({
      config: [
        {
          providerId: "strava",
          clientId: process.env.STRAVA_CLIENT_ID ?? "",
          clientSecret: process.env.STRAVA_CLIENT_SECRET ?? "",
          authorizationUrl: "https://www.strava.com/oauth/authorize",
          tokenUrl: "https://www.strava.com/oauth/token",
          // Strava expects client_id/client_secret in the POST body, not Basic auth
          authentication: "post",
          // Strava scopes are comma-separated, so keep them in a single entry
          scopes: ["read"],
          getUserInfo: async (tokens) => {
            const res = await fetch(`${STRAVA_API_BASE}/athlete`, {
              headers: { Authorization: `Bearer ${tokens.accessToken}` },
            });
            if (!res.ok) return null;
            const athlete = (await res.json()) as StravaAthlete;
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
