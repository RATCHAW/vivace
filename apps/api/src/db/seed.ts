// Fills a local database with plausible athletes, so the coach, the run
// catalogue and the render history have something in them before anyone has
// signed in through Strava.
//
// `drizzle-seed` generates the values and is deterministic for a given seed, so
// a screenshot taken today is the screenshot taken next week and the same row
// ids can be pasted into a bug report.
//
// Never run against production: `reset` truncates every table it is given, and
// `refuseInProduction` is the only thing between this file and an empty
// database.
import { reset, seed } from "drizzle-seed";
import { logger } from "../logger.js";
import { db, pool } from "./index.js";
import {
  account,
  coachContext,
  coachDebrief,
  coachMessage,
  coachPlan,
  coachThread,
  runRender,
  session,
  stravaWebhookEvent,
  user,
  verification,
} from "./schema/index.js";

/** Same numbers every run — see the note about screenshots above. */
const SEED = 20_260_814;

/** Small on purpose: a development fixture, not a load test. */
const COUNTS = {
  users: 3,
  threadsPerUser: 2,
  messagesPerThread: 6,
  rendersPerUser: 3,
} as const;

/** Everything `reset` empties, dependents first — it reads the foreign keys it
 *  can see, and the ones from our tables to `user` exist only by convention. */
const ALL_TABLES = {
  coachDebrief,
  coachMessage,
  coachThread,
  coachContext,
  coachPlan,
  runRender,
  stravaWebhookEvent,
  session,
  account,
  verification,
  user,
};

function refuseInProduction(): void {
  if (
    process.env.NODE_ENV === "production" ||
    process.env.APP_ENV === "production"
  ) {
    throw new Error("Refusing to seed: NODE_ENV/APP_ENV says production");
  }
  const url = process.env.DATABASE_URL ?? "";
  if (
    url &&
    !/@(localhost|127\.0\.0\.1|db|host\.docker\.internal)[:/]/.test(url)
  ) {
    throw new Error(
      `Refusing to seed: DATABASE_URL is not a local database (${url.replace(/:[^:@]*@/, ":***@")})`,
    );
  }
}

export async function seedDatabase(): Promise<void> {
  refuseInProduction();

  // Truncate first: seeding twice gives the same database, not twice the rows.
  await reset(db, ALL_TABLES);

  // Two passes, because none of our tables declares a foreign key to `user` —
  // they hold a bare `user_id text`, which is what better-auth's own tables gave
  // them and what the live data is. drizzle-seed's `with` needs a real
  // reference, so the athletes are created first and their ids are handed to the
  // second pass as a value pool.
  await seed(db, { user }, { seed: SEED }).refine((f) => ({
    user: {
      count: COUNTS.users,
      columns: {
        name: f.fullName(),
        // A placeholder, like the one `getUserInfo` writes — Strava never gives
        // us a real address, and a seeded one that looked real would be worse.
        email: f.email(),
        emailVerified: f.default({ defaultValue: false }),
        image: f.default({ defaultValue: null }),
      },
    },
  }));

  const userIds = (await db.select({ id: user.id }).from(user)).map(
    (row) => row.id,
  );

  await seed(
    db,
    { coachThread, coachMessage, coachContext, coachPlan, runRender },
    { seed: SEED },
  ).refine((f) => ({
    coachThread: {
      count: COUNTS.users * COUNTS.threadsPerUser,
      columns: {
        userId: f.valuesFromArray({ values: userIds }),
        title: f.loremIpsum({ sentencesCount: 1 }),
      },
      // coach_message.thread_id *is* a foreign key, so this one relation can be
      // expressed the way drizzle-seed prefers.
      with: { coachMessage: COUNTS.messagesPerThread },
    },
    coachMessage: {
      columns: {
        role: f.valuesFromArray({ values: ["user", "assistant"] }),
        // The UIMessage shape the transcript loader expects. Anything else would
        // crash the coach page rather than fill it.
        parts: f.default({
          defaultValue: [{ type: "text", text: "A seeded message." }],
        }),
        metadata: f.default({ defaultValue: null }),
      },
    },
    coachContext: {
      count: COUNTS.users,
      columns: {
        // The primary key, so one row per athlete and no repeats.
        userId: f.valuesFromArray({ values: userIds, isUnique: true }),
        raceName: f.city(),
        raceDate: f.default({ defaultValue: "2026-10-04" }),
        raceDistanceM: f.default({ defaultValue: 42195 }),
        targetSeconds: f.int({ minValue: 9000, maxValue: 16200 }),
        longRunDay: f.int({ minValue: 0, maxValue: 6 }),
      },
    },
    coachPlan: {
      count: COUNTS.users,
      columns: {
        userId: f.valuesFromArray({ values: userIds, isUnique: true }),
        weekStarting: f.default({ defaultValue: "2026-08-10" }),
        label: f.default({ defaultValue: "Base week" }),
        sessions: f.default({
          defaultValue: [{ day: 0, kind: "easy", distance_m: 8000 }],
        }),
      },
    },
    runRender: {
      count: COUNTS.users * COUNTS.rendersPerUser,
      columns: {
        userId: f.valuesFromArray({ values: userIds }),
        // Part of the primary key with user and template; unique keeps the whole
        // key unique without having to reason about the other two.
        activityId: f.int({ minValue: 1e9, maxValue: 2e9, isUnique: true }),
        template: f.valuesFromArray({
          values: ["minimal-numbers", "route-replay", "run-video"],
        }),
        status: f.default({ defaultValue: "done" }),
        progress: f.default({ defaultValue: 1 }),
        options: f.default({ defaultValue: { show_avatar: false } }),
        outputUrl: f.default({ defaultValue: null }),
        error: f.default({ defaultValue: null }),
      },
    },
  }));

  logger.info(
    { event: "db.seeded", seed: SEED, users: userIds.length },
    `Seeded ${userIds.length} athletes`,
  );
}

// `pnpm db:seed` runs this file directly; importing it does nothing, which is
// what lets a test call `seedDatabase()` itself.
if (import.meta.url === `file://${process.argv[1]}`) {
  await seedDatabase();
  await pool.end();
}
