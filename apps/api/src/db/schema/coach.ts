// The coach's four tables: conversations, their messages, the debriefs already
// posted, and the two things the coach remembers between threads.
import { relations } from "drizzle-orm";
import {
  bigint,
  bigserial,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import type { UIMessage } from "ai";
import type { PlannedSession } from "../../schemas.js";

const tz = { withTimezone: true } as const;

export const coachThread = pgTable(
  "coach_thread",
  {
    id: uuid("id").primaryKey(),
    userId: text("user_id").notNull(),
    /** Cut from the first thing the athlete says; null until they say it. */
    title: text("title"),
    createdAt: timestamp("created_at", tz).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", tz).notNull().defaultNow(),
  },
  (table) => [
    // Ordered DESC because that is the only way the list is ever read: most
    // recently used first. `nullsFirst` is Postgres's own default for DESC and
    // is spelled out only so this matches the index already in production —
    // Drizzle would otherwise emit `NULLS LAST`, which is a different index.
    index("coach_thread_user_idx").on(
      table.userId,
      table.updatedAt.desc().nullsFirst(),
    ),
  ],
);

export const coachMessage = pgTable(
  "coach_message",
  {
    /** The AI SDK's message id, so re-sending a message updates it in place. */
    id: text("id").notNull(),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => coachThread.id, { onDelete: "cascade" }),
    role: text("role").$type<UIMessage["role"]>().notNull(),
    /** The UIMessage parts array verbatim: text, reasoning, files, tool calls. */
    parts: jsonb("parts").$type<UIMessage["parts"]>().notNull(),
    /** Insertion order, not wall clock: a turn's messages land in the same
     *  millisecond and still have to come back in the order they were said. */
    seq: bigserial("seq", { mode: "number" }).notNull(),
    createdAt: timestamp("created_at", tz).notNull().defaultNow(),
    /** The run the athlete attached with the composer's `@` picker, if any. */
    metadata: jsonb("metadata").$type<UIMessage["metadata"]>(),
  },
  (table) => [
    // Keyed with the thread rather than alone: the id arrives from the browser,
    // and a global key would let a collision rewrite a message in somebody
    // else's conversation.
    primaryKey({ columns: [table.threadId, table.id] }),
    index("coach_message_thread_idx").on(table.threadId, table.seq),
  ],
);

export const coachDebrief = pgTable(
  "coach_debrief",
  {
    userId: text("user_id").notNull(),
    activityId: bigint("activity_id", { mode: "number" }).notNull(),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => coachThread.id, { onDelete: "cascade" }),
    messageId: text("message_id").notNull(),
    createdAt: timestamp("created_at", tz).notNull().defaultNow(),
  },
  (table) => [
    // One debrief per run. The webhook is at-least-once delivery, and this is
    // the second guard behind claimEvent: a redelivery weeks later, after the
    // event table has been pruned, still cannot post twice.
    primaryKey({ columns: [table.userId, table.activityId] }),
  ],
);

export const coachContext = pgTable("coach_context", {
  userId: text("user_id").primaryKey(),
  raceName: text("race_name"),
  /** Calendar dates are stored as text, not date: node-postgres parses a date
   *  column into a JS Date at *local* midnight, so a server an hour west of UTC
   *  hands back the day before. A race day has no timezone. */
  raceDate: text("race_date"),
  raceDistanceM: doublePrecision("race_distance_m"),
  targetSeconds: integer("target_seconds"),
  longRunDay: smallint("long_run_day"),
  notes: text("notes"),
  updatedAt: timestamp("updated_at", tz).notNull().defaultNow(),
});

export const coachPlan = pgTable(
  "coach_plan",
  {
    userId: text("user_id").notNull(),
    /** The Monday of the week, as text for the same reason as `race_date`. */
    weekStarting: text("week_starting").notNull(),
    label: text("label"),
    /** Seven entries, day 0 = Monday. */
    sessions: jsonb("sessions").$type<PlannedSession[]>().notNull(),
    createdAt: timestamp("created_at", tz).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", tz).notNull().defaultNow(),
  },
  // One accepted week per week: accepting a revision replaces it.
  (table) => [primaryKey({ columns: [table.userId, table.weekStarting] })],
);

export const coachThreadRelations = relations(coachThread, ({ many }) => ({
  messages: many(coachMessage),
  debriefs: many(coachDebrief),
}));

export const coachMessageRelations = relations(coachMessage, ({ one }) => ({
  thread: one(coachThread, {
    fields: [coachMessage.threadId],
    references: [coachThread.id],
  }),
}));

export const coachDebriefRelations = relations(coachDebrief, ({ one }) => ({
  thread: one(coachThread, {
    fields: [coachDebrief.threadId],
    references: [coachThread.id],
  }),
}));
