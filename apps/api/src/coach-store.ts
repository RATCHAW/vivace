// The two things the coach remembers that Strava cannot tell it: what the
// athlete is training for, and the week they agreed to run.
//
// Both are keyed by user and read on every coach turn, which is what stops each
// new thread from opening by asking "so what's the goal?" again.
import { pool } from "./db.js";
import type { CoachContext, CoachPlan, PlannedSession } from "./schemas.js";

// Created idempotently on first use — the same bargain coach_thread and
// run_render make, since better-auth owns the only real migration runner here.
let tablesReady: Promise<unknown> | null = null;

function ensureTables(): Promise<unknown> {
  tablesReady ??= (async () => {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "coach_context" (
        "user_id" text PRIMARY KEY,
        "race_name" text,
        -- Calendar dates are stored as text, not date: node-postgres parses a
        -- date column into a JS Date at *local* midnight, so a server an hour
        -- west of UTC hands back the day before. A race day has no timezone.
        "race_date" text,
        "race_distance_m" double precision,
        "target_seconds" integer,
        "long_run_day" smallint,
        "notes" text,
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "coach_plan" (
        "user_id" text NOT NULL,
        -- The Monday of the week, as text for the same reason as above.
        "week_starting" text NOT NULL,
        "label" text,
        -- PlannedSession[]: seven entries, day 0 = Monday.
        "sessions" jsonb NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        -- One accepted week per week: accepting a revision replaces it.
        PRIMARY KEY ("user_id", "week_starting")
      )
    `);
  })();
  return tablesReady;
}

interface ContextRow {
  race_name: string | null;
  race_date: string | null;
  race_distance_m: number | null;
  target_seconds: number | null;
  long_run_day: number | null;
  notes: string | null;
  updated_at: Date;
}

/** An athlete who has never told the coach anything. */
export const EMPTY_CONTEXT: CoachContext = {
  race_name: null,
  race_date: null,
  race_distance_m: null,
  target_seconds: null,
  long_run_day: null,
  notes: null,
  updated_at: null,
};

export async function getContext(userId: string): Promise<CoachContext> {
  await ensureTables();
  const { rows } = await pool.query<ContextRow>(
    `SELECT "race_name", "race_date", "race_distance_m", "target_seconds",
            "long_run_day", "notes", "updated_at"
       FROM "coach_context" WHERE "user_id" = $1`,
    [userId],
  );
  const row = rows[0];
  if (!row) return EMPTY_CONTEXT;
  return {
    race_name: row.race_name,
    race_date: row.race_date,
    race_distance_m: row.race_distance_m,
    target_seconds: row.target_seconds,
    long_run_day: row.long_run_day,
    notes: row.notes,
    updated_at: row.updated_at.toISOString(),
  };
}

/**
 * Merges into what is already there.
 *
 * Undefined means "leave it alone" and null means "clear it" — the coach names
 * a goal race in one turn and a target time three turns later, and the second
 * must not erase the first. Explicit nulls are how an athlete drops a race.
 */
export type ContextPatch = Partial<Omit<CoachContext, "updated_at">>;

export async function saveContext(
  userId: string,
  patch: ContextPatch,
): Promise<CoachContext> {
  await ensureTables();
  const columns = [
    "race_name",
    "race_date",
    "race_distance_m",
    "target_seconds",
    "long_run_day",
    "notes",
  ] as const;

  // Omitted fields are dropped from the statement entirely rather than written
  // as null: that is the whole difference between "don't touch the race" and
  // "cancel the race", and both arrive on this one path. Column names come from
  // the literal list above, never from the patch.
  const touched = columns.filter((column) => patch[column] !== undefined);
  const values = touched.map((column) => patch[column] ?? null);

  const { rows } = await pool.query<ContextRow>(
    `INSERT INTO "coach_context" ("user_id"${touched.map((c) => `, "${c}"`).join("")})
     VALUES ($1${touched.map((_, i) => `, $${i + 2}`).join("")})
     ON CONFLICT ("user_id") DO UPDATE SET
       ${touched.map((c) => `"${c}" = EXCLUDED."${c}"`).join(", ")}${touched.length ? "," : ""}
       "updated_at" = now()
     RETURNING "race_name", "race_date", "race_distance_m", "target_seconds",
               "long_run_day", "notes", "updated_at"`,
    [userId, ...values],
  );

  const row = rows[0];
  return {
    race_name: row.race_name,
    race_date: row.race_date,
    race_distance_m: row.race_distance_m,
    target_seconds: row.target_seconds,
    long_run_day: row.long_run_day,
    notes: row.notes,
    updated_at: row.updated_at.toISOString(),
  };
}

interface PlanRow {
  week_starting: string;
  label: string | null;
  sessions: PlannedSession[];
}

/** The week the athlete accepted for `weekStarting`, or null. */
export async function getPlan(
  userId: string,
  weekStarting: string,
): Promise<CoachPlan | null> {
  await ensureTables();
  const { rows } = await pool.query<PlanRow>(
    `SELECT "week_starting", "label", "sessions"
       FROM "coach_plan" WHERE "user_id" = $1 AND "week_starting" = $2`,
    [userId, weekStarting],
  );
  return rows[0] ?? null;
}

/** Accepting a week, or accepting a revision of one already accepted. */
export async function savePlan(
  userId: string,
  plan: CoachPlan,
): Promise<CoachPlan> {
  await ensureTables();
  const { rows } = await pool.query<PlanRow>(
    `INSERT INTO "coach_plan" ("user_id", "week_starting", "label", "sessions")
     VALUES ($1, $2, $3, $4)
     ON CONFLICT ("user_id", "week_starting") DO UPDATE
       SET "label" = EXCLUDED."label",
           "sessions" = EXCLUDED."sessions",
           "updated_at" = now()
     RETURNING "week_starting", "label", "sessions"`,
    [userId, plan.week_starting, plan.label, JSON.stringify(plan.sessions)],
  );
  return rows[0];
}
