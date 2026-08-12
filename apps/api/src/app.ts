import { Hono } from "hono";
import { cors } from "hono/cors";
import type { StravaAthlete } from "@repo/shared";
import { auth, STRAVA_API_BASE } from "./auth.js";

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
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: "Not signed in" }, 401);

  const { accessToken } = await auth.api.getAccessToken({
    body: { providerId: "strava", userId: session.user.id },
  });

  const res = await fetch(`${STRAVA_API_BASE}/athlete`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    return c.json({ error: `Strava responded with ${res.status}` }, 502);
  }
  const athlete = (await res.json()) as StravaAthlete;
  return c.json(athlete);
});
