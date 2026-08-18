// Brings the suite's database to a known state before anything runs.
//
// Migrating here rather than leaning on the API's own boot-time migration is
// deliberate: Playwright's ordering between `webServer` and `globalSetup` is not
// something the suite should depend on, and truncating a table that does not
// exist yet is a confusing first failure. Doing both here is idempotent either
// way — Drizzle records what it has applied.
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import pg from "pg";
import { DATABASE_URL } from "./env.js";

const run = promisify(execFile);

const API_DIR = fileURLToPath(new URL("../api", import.meta.url));

/**
 * Everything the app owns, emptied between runs.
 *
 * Named rather than discovered, so a table added to the schema shows up as a
 * test that suddenly depends on data from the last run instead of being silently
 * swept. `CASCADE` covers better-auth's foreign keys; Drizzle's own bookkeeping
 * lives in a separate schema and is untouched, which is what keeps the
 * migrations recorded as applied.
 */
const TABLES = [
  "run_invite",
  "run_render",
  "coach_debrief",
  "coach_message",
  "coach_thread",
  "coach_context",
  "coach_plan",
  "strava_webhook_event",
  "session",
  "account",
  "verification",
  "user",
];

async function waitForPostgres(): Promise<void> {
  const deadline = Date.now() + 30_000;
  let lastError: unknown;
  while (Date.now() < deadline) {
    const client = new pg.Client({ connectionString: DATABASE_URL });
    try {
      await client.connect();
      await client.end();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  throw new Error(
    `No Postgres at ${DATABASE_URL} after 30s. Start it with:\n` +
      `  docker compose --profile e2e up -d db-e2e\n` +
      `Last error: ${String(lastError)}`,
  );
}

export default async function globalSetup(): Promise<void> {
  await waitForPostgres();

  await run("pnpm", ["exec", "drizzle-kit", "migrate"], {
    cwd: API_DIR,
    env: { ...process.env, DATABASE_URL },
  });

  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    await client.query(
      `TRUNCATE TABLE ${TABLES.map((t) => `"${t}"`).join(", ")} RESTART IDENTITY CASCADE`,
    );
  } finally {
    await client.end();
  }
}
