// A Strava the tests own.
//
// Everything else in the end-to-end run is real — the browser, the Vite app, the
// Hono API, better-auth's redirect and token exchange, Postgres. Strava is the
// one thing that cannot be, so it is replaced here rather than stubbed inside
// the API. That distinction is the point: `STRAVA_API_BASE_URL` and
// `STRAVA_OAUTH_BASE_URL` move the address, so the code under test is the code
// that ships, down to the generated SDK and the OAuth plugin.
//
// It implements only what the invite flow touches:
//
//   GET  /oauth/authorize          the consent screen, as two buttons
//   POST /oauth/token              code → access token
//   GET  /api/v3/athlete           the signed-in athlete
//   GET  /api/v3/athlete/activities
//   GET  /api/v3/activities/:id
//   GET  /api/v3/activities/:id/streams
//
// Which athlete you are is carried in the authorization code and then in the
// access token, so two browser contexts can be two different people against one
// server.
import { createServer } from "node:http";
import { ATHLETES, athleteForToken, tokenFor } from "./athletes.js";

const PORT = Number(process.env.FAKE_STRAVA_PORT ?? 4100);

function json(
  res: import("node:http").ServerResponse,
  status: number,
  body: unknown,
): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

/** Strava's `SummaryActivity`, as much of it as `toRun` in the API reads. */
function toActivity(
  athlete: (typeof ATHLETES)["ayoub"],
  run: (typeof ATHLETES)["ayoub"]["runs"][number],
) {
  return {
    id: run.id,
    name: run.name,
    distance: run.distance,
    moving_time: run.moving_time,
    elapsed_time: run.moving_time + 60,
    total_elevation_gain: 42,
    type: "Run",
    sport_type: "Run",
    start_date: run.start_date_local,
    start_date_local: run.start_date_local,
    timezone: "(GMT+01:00) Africa/Casablanca",
    average_speed: run.distance / run.moving_time,
    max_speed: run.distance / run.moving_time + 1,
    average_heartrate: 152,
    max_heartrate: 176,
    workout_type: 2,
    athlete: { id: athlete.id },
    trainer: false,
    manual: false,
    athlete_count: 2,
  };
}

/** A short, valid-looking route so the studio has something to draw. */
function streamsFor(run: { moving_time: number; distance: number }) {
  const points = 20;
  const latlng: number[][] = [];
  const time: number[] = [];
  const distance: number[] = [];
  for (let i = 0; i < points; i += 1) {
    const t = i / (points - 1);
    latlng.push([33.5731 + t * 0.01, -7.5898 + t * 0.008]);
    time.push(Math.round(t * run.moving_time));
    distance.push(Math.round(t * run.distance));
  }
  return {
    latlng: {
      data: latlng,
      series_type: "distance",
      original_size: points,
      resolution: "high",
    },
    time: {
      data: time,
      series_type: "distance",
      original_size: points,
      resolution: "high",
    },
    distance: {
      data: distance,
      series_type: "distance",
      original_size: points,
      resolution: "high",
    },
  };
}

/** The athlete behind an `Authorization: Bearer …` header, if any. */
function caller(req: import("node:http").IncomingMessage) {
  const header = req.headers.authorization ?? "";
  const token = header.replace(/^Bearer\s+/i, "");
  return athleteForToken(token);
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  const path = url.pathname;

  // What Playwright waits on before starting the other servers.
  if (path === "/health") {
    json(res, 200, { status: "ok" });
    return;
  }

  // --- OAuth ----------------------------------------------------------------

  // Strava's consent screen. Two buttons rather than an automatic redirect, so
  // the test says who it is signing in as by clicking — and so a failure here is
  // visible in the trace instead of being an invisible 302.
  if (req.method === "GET" && path === "/oauth/authorize") {
    const redirectUri = url.searchParams.get("redirect_uri");
    if (!redirectUri) {
      json(res, 400, { message: "redirect_uri is required", errors: [] });
      return;
    }
    const state = url.searchParams.get("state") ?? "";
    const scope = url.searchParams.get("scope") ?? "read";
    const buttons = Object.values(ATHLETES)
      .map((athlete) => {
        const back = new URL(redirectUri);
        back.searchParams.set("code", athlete.key);
        back.searchParams.set("state", state);
        back.searchParams.set("scope", scope);
        return `<a id="authorize-${athlete.key}" href="${back.toString()}">Authorize as ${athlete.firstname}</a>`;
      })
      .join("\n");
    const body = `<!doctype html><meta charset="utf-8"><title>Fake Strava</title>
<h1>Fake Strava</h1>${buttons}`;
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(body);
    return;
  }

  if (req.method === "POST" && path === "/oauth/token") {
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => {
      // better-auth is configured with `authentication: "post"`, so the code
      // arrives form-encoded in the body the way Strava wants it.
      const params = new URLSearchParams(raw);
      const code = params.get("code") ?? "";
      const athlete = ATHLETES[code as keyof typeof ATHLETES];
      if (!athlete) {
        json(res, 400, { message: "Bad code", errors: [] });
        return;
      }
      json(res, 200, {
        token_type: "Bearer",
        access_token: tokenFor(athlete.key),
        refresh_token: `e2e-refresh-${athlete.key}`,
        expires_at: Math.floor(Date.now() / 1000) + 6 * 60 * 60,
        expires_in: 6 * 60 * 60,
        scope: "read,activity:read_all,profile:read_all",
        athlete: { id: athlete.id },
      });
    });
    return;
  }

  // --- API ------------------------------------------------------------------

  const athlete = caller(req);
  if (path.startsWith("/api/v3/") && !athlete) {
    json(res, 401, { message: "Authorization Error", errors: [] });
    return;
  }
  if (!athlete) {
    json(res, 404, { message: "Not found", errors: [] });
    return;
  }

  if (path === "/api/v3/athlete") {
    json(res, 200, {
      id: athlete.id,
      username: `${athlete.firstname.toLowerCase()}_e2e`,
      resource_state: 3,
      firstname: athlete.firstname,
      lastname: athlete.lastname,
      bio: "",
      city: "Casablanca",
      state: "",
      country: "Morocco",
      sex: "M",
      premium: false,
      summit: false,
      created_at: "2020-01-01T00:00:00Z",
      updated_at: "2026-08-15T00:00:00Z",
      badge_type_id: 0,
      weight: 70,
      profile_medium: "",
      profile: "",
    });
    return;
  }

  if (path === "/api/v3/athlete/activities") {
    json(
      res,
      200,
      athlete.runs.map((run) => toActivity(athlete, run)),
    );
    return;
  }

  const streams = /^\/api\/v3\/activities\/(\d+)\/streams$/.exec(path);
  if (streams) {
    const run = athlete.runs.find(
      (candidate) => candidate.id === Number(streams[1]),
    );
    // Strava serves an activity only to the athlete who owns it, and the API
    // leans on exactly that as its ownership check — so this 404 is load-bearing.
    if (!run) {
      json(res, 404, { message: "Record Not Found", errors: [] });
      return;
    }
    json(res, 200, streamsFor(run));
    return;
  }

  const activity = /^\/api\/v3\/activities\/(\d+)$/.exec(path);
  if (activity) {
    const run = athlete.runs.find(
      (candidate) => candidate.id === Number(activity[1]),
    );
    if (!run) {
      json(res, 404, { message: "Record Not Found", errors: [] });
      return;
    }
    json(res, 200, {
      ...toActivity(athlete, run),
      description: "",
      calories: 640,
      device_name: "Garmin Forerunner",
      gear_id: null,
      best_efforts: [],
      map: { id: `a${run.id}`, polyline: "", summary_polyline: "" },
    });
    return;
  }

  json(res, 404, { message: "Record Not Found", errors: [] });
});

server.listen(PORT, "127.0.0.1", () => {
  process.stdout.write(`fake-strava listening on http://127.0.0.1:${PORT}\n`);
});
