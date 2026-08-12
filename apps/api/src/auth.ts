import "dotenv/config";
import { betterAuth } from "better-auth";
import { genericOAuth, openAPI } from "better-auth/plugins";
import { createStravaClient, getLoggedInAthlete } from "@repo/strava-api";
import { pool } from "./db.js";

export const auth = betterAuth({
  database: pool,
  baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
  secret: process.env.BETTER_AUTH_SECRET,
  trustedOrigins: [process.env.WEB_ORIGIN ?? "http://localhost:5173"],
  plugins: [
    // Documents the /api/auth/* routes; Scalar reference at /api/auth/reference.
    openAPI(),
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
          scopes: ["read,activity:read"],
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
