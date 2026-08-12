import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Context } from "hono";
import type { StravaActivity, StravaAthlete, StravaStreamSet } from "@repo/shared";
import { auth, STRAVA_API_BASE } from "./auth.js";

/** Resolve the signed-in user's Strava access token, or null when signed out. */
async function getStravaAccessToken(c: Context) {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return null;
  const { accessToken } = await auth.api.getAccessToken({
    body: { providerId: "strava", userId: session.user.id },
  });
  return accessToken ?? null;
}

function stravaError(c: Context, res: Response) {
  // 401/403 means the stored token predates the activity:read scope —
  // the fix is signing out and back in, so say so.
  if (res.status === 401 || res.status === 403) {
    return c.json(
      { error: "Strava denied access. Sign out and back in to grant activity permissions." },
      403,
    );
  }
  return c.json({ error: `Strava responded with ${res.status}` }, 502);
}

export const app = new Hono();

app.use(
  "/api/*",
  cors({
    origin: process.env.WEB_ORIGIN ?? "http://localhost:5173",
    credentials: true,
  }),
);

app.get("/health", (c) => c.json({ status: "ok" }));

app.on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw));

app.get("/api/me/strava", async (c) => {
  const accessToken = await getStravaAccessToken(c);
  if (!accessToken) return c.json({ error: "Not signed in" }, 401);

  const res = await fetch(`${STRAVA_API_BASE}/athlete`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return stravaError(c, res);
  const athlete = (await res.json()) as StravaAthlete;
  return c.json(athlete);
});

app.get("/api/me/runs", async (c) => {
  const accessToken = await getStravaAccessToken(c);
  if (!accessToken) return c.json({ error: "Not signed in" }, 401);

  const res = await fetch(`${STRAVA_API_BASE}/athlete/activities?per_page=100`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return stravaError(c, res);
  const activities = (await res.json()) as StravaActivity[];
  const runs = activities.filter((a) => a.sport_type?.includes("Run") || a.type === "Run");
  return c.json(runs);
});

app.get("/api/runs/:id/streams", async (c) => {
  const accessToken = await getStravaAccessToken(c);
  if (!accessToken) return c.json({ error: "Not signed in" }, 401);

  const id = c.req.param("id");
  if (!/^\d+$/.test(id)) return c.json({ error: "Invalid activity id" }, 400);

  const keys = "latlng,time,distance,altitude,heartrate,velocity_smooth";
  const res = await fetch(
    `${STRAVA_API_BASE}/activities/${id}/streams?keys=${keys}&key_by_type=true`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  // Strava 404s on activities without any streams (e.g. manual entries)
  if (res.status === 404) return c.json({} satisfies StravaStreamSet);
  if (!res.ok) return stravaError(c, res);
  const streams = (await res.json()) as StravaStreamSet;
  return c.json(streams);
});
