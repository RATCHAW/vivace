// Every address and secret the end-to-end run uses, in one place.
//
// The ports are deliberately not the development ones. A suite that truncates
// its database must never be one `docker compose up` away from truncating the
// one you have been signing into all afternoon, and `pnpm dev` should be able to
// keep running while the suite does.
//
// They are also all shiftable by one number. This repository is worked on in
// several checkouts at once (see the harness in the README), and every one of
// them wants the same four ports — so the second worktree to run `pnpm e2e`
// would otherwise fail on a port bind, or worse, quietly find the first one's
// database and truncate it. `E2E_PORT_OFFSET=10` moves the whole set.

/** Added to every port below. One number, so the set can never half-move. */
const OFFSET = Number(process.env.E2E_PORT_OFFSET ?? 0);

export const FAKE_STRAVA_PORT = 4100 + OFFSET;
export const API_PORT = 3100 + OFFSET;
export const WEB_PORT = 5273 + OFFSET;
export const DB_PORT = Number(process.env.E2E_DB_PORT ?? 5434 + OFFSET);

/**
 * Postgres for the suite alone — `pnpm e2e:db`, which honours the same offset.
 *
 * `E2E_DATABASE_URL` wins outright, for a database that is not the compose one.
 */
export const DATABASE_URL =
  process.env.E2E_DATABASE_URL ?? `postgres://app:app@localhost:${DB_PORT}/app`;

export const FAKE_STRAVA_URL = `http://127.0.0.1:${FAKE_STRAVA_PORT}`;
export const API_URL = `http://127.0.0.1:${API_PORT}`;
export const WEB_URL = `http://127.0.0.1:${WEB_PORT}`;

/** Long enough for better-auth's production check, which the suite never trips. */
export const BETTER_AUTH_SECRET = "e2e-secret-not-for-production-0123456789";

/**
 * What the API is started with.
 *
 * `STRAVA_API_BASE_URL` and `STRAVA_OAUTH_BASE_URL` are the two test seams —
 * see the notes on them in @repo/strava-api and apps/api/src/auth.ts. Both are
 * inert when NODE_ENV says production, which is why this never sets it.
 */
export const apiEnv: Record<string, string> = {
  NODE_ENV: "test",
  APP_ENV: "test",
  DATABASE_URL,
  BETTER_AUTH_SECRET,
  // The *web* origin, not the API's. Vite proxies /api through to the API, so
  // this is the same same-origin arrangement nginx gives production — and it
  // means better-auth's OAuth `redirect_uri` comes back to the browser's own
  // origin rather than jumping ports mid-sign-in.
  BETTER_AUTH_URL: WEB_URL,
  WEB_ORIGIN: WEB_URL,
  PORT: String(API_PORT),
  STRAVA_CLIENT_ID: "e2e-client-id",
  STRAVA_CLIENT_SECRET: "e2e-client-secret",
  STRAVA_API_BASE_URL: `${FAKE_STRAVA_URL}/api/v3`,
  STRAVA_OAUTH_BASE_URL: FAKE_STRAVA_URL,
  // Keep the run quiet and keep the third parties out of it.
  LOG_LEVEL: "warn",
  POSTHOG_KEY: "",
};
