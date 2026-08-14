// The two things the coach remembers that Strava cannot tell it: what the
// athlete is training for, and the week they agreed to run.
//
// Both are keyed by user and read on every coach turn, which is what stops each
// new thread from opening by asking "so what's the goal?" again.
import { and, eq, sql } from "drizzle-orm";
import { db } from "./db/index.js";
import { coachContext, coachPlan } from "./db/schema/coach.js";
import type { CoachContext, CoachPlan } from "./schemas.js";

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

type ContextRow = typeof coachContext.$inferSelect;

function toContext(row: ContextRow): CoachContext {
  return {
    race_name: row.raceName,
    race_date: row.raceDate,
    race_distance_m: row.raceDistanceM,
    target_seconds: row.targetSeconds,
    long_run_day: row.longRunDay,
    notes: row.notes,
    updated_at: row.updatedAt.toISOString(),
  };
}

export async function getContext(userId: string): Promise<CoachContext> {
  const [row] = await db
    .select()
    .from(coachContext)
    .where(eq(coachContext.userId, userId));
  return row ? toContext(row) : EMPTY_CONTEXT;
}

/**
 * Merges into what is already there.
 *
 * Undefined means "leave it alone" and null means "clear it" — the coach names
 * a goal race in one turn and a target time three turns later, and the second
 * must not erase the first. Explicit nulls are how an athlete drops a race.
 */
export type ContextPatch = Partial<Omit<CoachContext, "updated_at">>;

/** The API's snake_case field names against the columns that hold them. Written
 *  out rather than derived, so a renamed column is a compiler error here. */
const CONTEXT_COLUMNS = {
  race_name: "raceName",
  race_date: "raceDate",
  race_distance_m: "raceDistanceM",
  target_seconds: "targetSeconds",
  long_run_day: "longRunDay",
  notes: "notes",
} as const satisfies Record<keyof ContextPatch, keyof ContextRow>;

export async function saveContext(
  userId: string,
  patch: ContextPatch,
): Promise<CoachContext> {
  // Omitted fields are left out of the statement entirely rather than written as
  // null: that is the whole difference between "don't touch the race" and
  // "cancel the race", and both arrive on this one path.
  const touched: Partial<typeof coachContext.$inferInsert> = {};
  for (const [field, column] of Object.entries(CONTEXT_COLUMNS)) {
    const value = patch[field as keyof ContextPatch];
    if (value !== undefined) {
      Object.assign(touched, { [column]: value });
    }
  }

  const [row] = await db
    .insert(coachContext)
    .values({ userId, ...touched })
    .onConflictDoUpdate({
      target: coachContext.userId,
      set: { ...touched, updatedAt: sql`now()` },
    })
    .returning();

  return toContext(row);
}

/** The week the athlete accepted for `weekStarting`, or null. */
export async function getPlan(
  userId: string,
  weekStarting: string,
): Promise<CoachPlan | null> {
  const [row] = await db
    .select({
      week_starting: coachPlan.weekStarting,
      label: coachPlan.label,
      sessions: coachPlan.sessions,
    })
    .from(coachPlan)
    .where(
      and(
        eq(coachPlan.userId, userId),
        eq(coachPlan.weekStarting, weekStarting),
      ),
    );
  return row ?? null;
}

/** Accepting a week, or accepting a revision of one already accepted. */
export async function savePlan(
  userId: string,
  plan: CoachPlan,
): Promise<CoachPlan> {
  const [row] = await db
    .insert(coachPlan)
    .values({
      userId,
      weekStarting: plan.week_starting,
      label: plan.label,
      sessions: plan.sessions,
    })
    .onConflictDoUpdate({
      target: [coachPlan.userId, coachPlan.weekStarting],
      set: {
        label: plan.label,
        sessions: plan.sessions,
        updatedAt: sql`now()`,
      },
    })
    .returning({
      week_starting: coachPlan.weekStarting,
      label: coachPlan.label,
      sessions: coachPlan.sessions,
    });
  return row;
}
