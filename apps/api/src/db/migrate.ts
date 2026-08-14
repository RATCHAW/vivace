// Schema migration, run once before the port is bound.
//
// Every table in this database used to migrate itself: better-auth ran its own
// Kysely migrator, and each of our stores carried a `CREATE TABLE IF NOT
// EXISTS` plus a growing tail of `ADD COLUMN IF NOT EXISTS` that ran on first
// use in every process. Drizzle replaces all of it with the files in
// apps/api/drizzle, which are generated from src/db/schema and committed.
//
// The one thing that setup did for free, and this has to do deliberately, is
// arrive at a database that already exists. See `stampBaseline`.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { logger } from "../logger.js";
import { db, pool } from "./index.js";

/** Committed alongside the schema they were generated from, and copied into the
 *  image by `COPY apps/api apps/api` — the migrator reads them at runtime, so
 *  drizzle-kit itself is never needed in production. */
const MIGRATIONS_FOLDER = fileURLToPath(
  new URL("../../drizzle", import.meta.url),
);

/** Any positive int64. Shared by every process that migrates this database, and
 *  meaningless to anything else. */
const MIGRATION_LOCK_KEY = 4_021_755_301;

interface Journal {
  entries: { idx: number; when: number; tag: string }[];
}

function readJournal(): Journal {
  return JSON.parse(
    readFileSync(`${MIGRATIONS_FOLDER}/meta/_journal.json`, "utf8"),
  ) as Journal;
}

/**
 * Is this a database that predates Drizzle?
 *
 * True only when Drizzle has never run here *and* the tables are already
 * present — which is the production database, and any developer's local one
 * from before this change. A genuinely empty database answers false and gets
 * the migration applied normally.
 */
async function predatesDrizzle(): Promise<boolean> {
  const { rows } = await pool.query<{
    drizzle: string | null;
    user: string | null;
  }>(
    `SELECT to_regclass('drizzle.__drizzle_migrations')::text AS drizzle,
            to_regclass('public.user')::text AS "user"`,
  );
  return rows[0].drizzle === null && rows[0].user !== null;
}

/**
 * Columns that the old per-store bootstrap added with `ALTER TABLE`, after their
 * table already existed somewhere.
 *
 * They are the only way an old database can be *partly* at 0000: the production
 * one has them all, because the code that adds them has been deployed for
 * months, but a local database last opened before those releases would not.
 * Stamping that one would record a schema it doesn't have, and the failure would
 * surface later as a missing column in a query nobody changed.
 */
const LATE_COLUMNS: [table: string, column: string][] = [
  ["run_render", "template"],
  ["run_render", "options"],
  ["run_render", "props_hash"],
  ["run_render", "region"],
  ["run_render", "function_name"],
  ["run_render", "serve_url"],
  ["coach_message", "metadata"],
];

/** Refuses to adopt a database that isn't actually at 0000. */
async function assertAtBaseline(): Promise<void> {
  const { rows } = await pool.query<{
    table_name: string;
    column_name: string;
  }>(
    `SELECT table_name, column_name FROM information_schema.columns
      WHERE table_schema = 'public'`,
  );
  const present = new Set(rows.map((r) => `${r.table_name}.${r.column_name}`));
  const missing = LATE_COLUMNS.filter(
    ([table, column]) => !present.has(`${table}.${column}`),
  ).map(([table, column]) => `${table}.${column}`);

  if (missing.length > 0) {
    throw new Error(
      `This database predates Drizzle but is not at 0000 — missing ${missing.join(", ")}. ` +
        `It is older than any deployed release, so it is a stale local copy: drop it ` +
        `and let the migration build it (pnpm db:reset).`,
    );
  }
}

/**
 * Records 0000 as applied without running it.
 *
 * 0000 describes the schema those databases already have — it was generated
 * from a schema transcribed off a `pg_dump` of one. Running it would fail on the
 * first `CREATE TABLE`; skipping the journal entry entirely would make the
 * *next* migration the first one Drizzle ever saw, and it would then try to
 * apply 0000 again on the following boot. So the row goes in by hand, exactly as
 * the migrator would have written it: the sha256 of the file and the `when` from
 * the journal, which is the ordering key it compares against.
 *
 * This is `prisma migrate resolve --applied`, which drizzle-kit has no
 * equivalent of.
 */
async function stampBaseline(): Promise<string> {
  const [first] = readJournal().entries;
  const contents = readFileSync(
    `${MIGRATIONS_FOLDER}/${first.tag}.sql`,
    "utf8",
  );
  const hash = createHash("sha256").update(contents).digest("hex");

  await db.execute(sql`CREATE SCHEMA IF NOT EXISTS "drizzle"`);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "drizzle"."__drizzle_migrations" (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at bigint
    )
  `);
  await db.execute(sql`
    INSERT INTO "drizzle"."__drizzle_migrations" ("hash", "created_at")
    VALUES (${hash}, ${first.when})
  `);
  return first.tag;
}

/** Which migrations this database has already seen, newest last. */
async function appliedCount(): Promise<number> {
  const { rows } = await pool.query<{ count: string }>(
    `SELECT count(*)::text FROM "drizzle"."__drizzle_migrations"`,
  );
  return Number(rows[0].count);
}

/**
 * Bring the database up to the schema the running code expects.
 *
 * Fails closed. A process that binds the port against the wrong schema reads as
 * healthy while answering every request with a 500, which is the failure this is
 * meant to prevent — so the caller runs it before `serve`, not beside it.
 */
export async function runMigrations(): Promise<void> {
  const startedAt = performance.now();
  // Two containers overlapping during a deploy would otherwise both read an
  // unmigrated database and both try to apply the same file. The lock is held on
  // its own connection for the whole run; it is advisory, so it only works
  // because this is the one place that migrates.
  const lock = await pool.connect();

  try {
    await lock.query("SELECT pg_advisory_lock($1)", [MIGRATION_LOCK_KEY]);

    if (await predatesDrizzle()) {
      await assertAtBaseline();
      const tag = await stampBaseline();
      logger.info(
        { event: "db.baselined", migration: tag },
        `Adopted an existing database at ${tag}`,
      );
    }

    const before = await appliedCount().catch(() => 0);
    await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
    const after = await appliedCount();

    logger.info(
      {
        event: after > before ? "db.migrated" : "db.migration_skipped",
        applied: after - before,
        total: after,
        durationMs: Math.round(performance.now() - startedAt),
      },
      after > before
        ? `Applied ${after - before} migration(s)`
        : "Schema already matches the running code",
    );
  } catch (err) {
    // Logged for the specific event name, rethrown because the handler that
    // `installProcessLogging` puts on the process is what flushes Loki and
    // PostHog before exiting non-zero. Exiting here would drop both.
    logger.fatal(
      { event: "db.migration_failed", err },
      "Schema migration failed",
    );
    throw err;
  } finally {
    await lock
      .query("SELECT pg_advisory_unlock($1)", [MIGRATION_LOCK_KEY])
      // Releasing matters less than returning the connection: the lock dies with
      // the session either way, and a throw here would mask the real error.
      .catch((err: unknown) => {
        logger.warn(
          { event: "db.migration_unlock_failed", err },
          "Lock not released",
        );
      });
    lock.release();
  }
}
