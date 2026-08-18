// Every address and secret a fake-Strava stack uses, in one place.
//
// There are two of them. The suite (`pnpm e2e`) and the manual one
// (`pnpm dev:fake`) are the same three servers around the same fake Strava, and
// they differ in exactly two ways: which ports they hold, and whether the
// database is disposable. Building both from one function is what keeps them
// from drifting into two subtly different apps.
//
// The ports are deliberately not the development ones. A suite that truncates
// its database must never be one `docker compose up` away from truncating the
// one you have been signing into all afternoon, and `pnpm dev` should be able to
// keep running while either of these does.
//
// They are also all shiftable by one number. This repository is worked on in
// several checkouts at once (see the harness in the README), and every one of
// them wants the same four ports — so the second worktree to run `pnpm e2e`
// would otherwise fail on a port bind, or worse, quietly find the first one's
// database and truncate it. `E2E_PORT_OFFSET=10` moves the whole set.

/** Long enough for better-auth's production check, which neither stack trips. */
export const BETTER_AUTH_SECRET = "e2e-secret-not-for-production-0123456789";

export interface Stack {
  fakeStravaPort: number;
  apiPort: number;
  webPort: number;
  dbPort: number;
  fakeStravaUrl: string;
  apiUrl: string;
  webUrl: string;
  databaseUrl: string;
  /** What the API is started with. */
  apiEnv: Record<string, string>;
}

/**
 * One stack, `offset` ports above the base set.
 *
 * `STRAVA_API_BASE_URL` and `STRAVA_OAUTH_BASE_URL` are the two test seams — see
 * the notes on them in @repo/strava-api and apps/api/src/auth.ts. Both are inert
 * when NODE_ENV says production, which is why this never sets it.
 */
function stack(offset: number, databaseUrl: string): Stack {
  const fakeStravaPort = 4100 + offset;
  const apiPort = 3100 + offset;
  const webPort = 5273 + offset;
  const dbPort = 5434 + offset;

  const fakeStravaUrl = `http://127.0.0.1:${fakeStravaPort}`;
  const apiUrl = `http://127.0.0.1:${apiPort}`;
  const webUrl = `http://127.0.0.1:${webPort}`;

  return {
    fakeStravaPort,
    apiPort,
    webPort,
    dbPort,
    fakeStravaUrl,
    apiUrl,
    webUrl,
    databaseUrl,
    apiEnv: {
      NODE_ENV: "test",
      APP_ENV: "test",
      DATABASE_URL: databaseUrl,
      BETTER_AUTH_SECRET,
      // The *web* origin, not the API's. Vite proxies /api through to the API,
      // so this is the same same-origin arrangement nginx gives production — and
      // it means better-auth's OAuth `redirect_uri` comes back to the browser's
      // own origin rather than jumping ports mid-sign-in.
      BETTER_AUTH_URL: webUrl,
      WEB_ORIGIN: webUrl,
      PORT: String(apiPort),
      STRAVA_CLIENT_ID: "e2e-client-id",
      STRAVA_CLIENT_SECRET: "e2e-client-secret",
      STRAVA_API_BASE_URL: `${fakeStravaUrl}/api/v3`,
      STRAVA_OAUTH_BASE_URL: fakeStravaUrl,
      // Keep the run quiet and keep the third parties out of it.
      LOG_LEVEL: "warn",
      POSTHOG_KEY: "",
    },
  };
}

/** Added to every port. One number, so the set can never half-move. */
const E2E_OFFSET = Number(process.env.E2E_PORT_OFFSET ?? 0);

/**
 * The suite's own database — `pnpm e2e:db`, which honours the same offset.
 *
 * `E2E_DATABASE_URL` wins outright, for a database that is not the compose one.
 */
const E2E_DB_PORT = Number(process.env.E2E_DB_PORT ?? 5434 + E2E_OFFSET);

const E2E = stack(
  E2E_OFFSET,
  process.env.E2E_DATABASE_URL ??
    `postgres://app:app@localhost:${E2E_DB_PORT}/app`,
);

/*
 * The suite's stack, spelled flat because playwright.config.ts and
 * global-setup.ts read it that way and there is only ever one of it per run.
 */
export const FAKE_STRAVA_PORT = E2E.fakeStravaPort;
export const API_PORT = E2E.apiPort;
export const WEB_PORT = E2E.webPort;
export const DB_PORT = E2E_DB_PORT;
export const DATABASE_URL = E2E.databaseUrl;
export const FAKE_STRAVA_URL = E2E.fakeStravaUrl;
export const API_URL = E2E.apiUrl;
export const WEB_URL = E2E.webUrl;
export const apiEnv = E2E.apiEnv;

/**
 * The manual stack — `pnpm dev:fake`, a hundred ports above the suite.
 *
 * A hundred rather than one so the two can be up at the same time: the suite
 * truncates every table it knows about, and finding that it had done so to the
 * session you were clicking through is the failure this separation exists to
 * prevent. Its database is a volume rather than `tmpfs`, because a stack you
 * sign into by hand should still know who you are tomorrow.
 */
export const DEV = stack(
  100 + Number(process.env.DEV_FAKE_PORT_OFFSET ?? 0),
  process.env.DEV_FAKE_DATABASE_URL ??
    `postgres://app:app@localhost:${Number(
      process.env.DEV_FAKE_DB_PORT ??
        5534 + Number(process.env.DEV_FAKE_PORT_OFFSET ?? 0),
    )}/app`,
);
