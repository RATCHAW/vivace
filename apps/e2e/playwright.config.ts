import { defineConfig, devices } from "@playwright/test";
import {
  API_URL,
  FAKE_STRAVA_PORT,
  FAKE_STRAVA_URL,
  WEB_PORT,
  WEB_URL,
  apiEnv,
} from "./env.js";

/**
 * Three servers, all of them the real ones except Strava.
 *
 * The suite drives a browser at the Vite app, which proxies to the Hono API,
 * which reads and writes Postgres and talks to a Strava the tests own. Nothing
 * is mocked inside the code under test — the seam is the address Strava lives
 * at, so the OAuth plugin, the generated SDK, the routes and the migrations are
 * all the ones that ship.
 *
 * `reuseExistingServer` is off even locally: a stale API still holding the last
 * run's environment is the kind of failure that costs an afternoon.
 */
export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  // One worker, one database. Sharding would need a schema per worker, which is
  // not worth it for a suite this size.
  workers: 1,
  reporter: process.env.CI
    ? [["github"], ["html", { open: "never" }]]
    : [["list"]],
  globalSetup: "./global-setup.ts",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: WEB_URL,
    trace: "retain-on-failure",
    video: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "pnpm exec tsx fake-strava.ts",
      url: `${FAKE_STRAVA_URL}/health`,
      env: { FAKE_STRAVA_PORT: String(FAKE_STRAVA_PORT) },
      reuseExistingServer: false,
      stdout: "pipe",
      stderr: "pipe",
    },
    {
      command: "pnpm --filter @repo/api start",
      url: `${API_URL}/health`,
      cwd: "../..",
      env: apiEnv,
      reuseExistingServer: false,
      stdout: "pipe",
      stderr: "pipe",
      timeout: 60_000,
    },
    {
      // Vite directly rather than through `pnpm --filter … dev`, which needs a
      // `--` to forward arguments and then hands Vite the `--` as well — so the
      // port was ignored and the server quietly drifted to the next free one.
      // `--strictPort` is what turns that drift into a failure.
      //
      // `--host 127.0.0.1` because Vite otherwise binds `localhost`, which on
      // macOS resolves to ::1 first — and then every address in this suite is
      // IPv4 except the one the browser is pointed at.
      command: `pnpm exec vite --port ${WEB_PORT} --strictPort --host 127.0.0.1`,
      url: WEB_URL,
      cwd: "../web",
      env: { API_URL },
      reuseExistingServer: false,
      stdout: "pipe",
      stderr: "pipe",
      timeout: 60_000,
    },
  ],
});
