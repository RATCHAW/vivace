// Persistence for the coach chat: one row per conversation, one row per message.
//
// The AI SDK's `useChat` only ever sends the message the athlete just typed —
// the transcript the model reasons over is loaded from here on every turn, and
// the assistant's reply is written back when its stream ends. That keeps the
// request small and makes the server, not the browser, the source of truth for
// a conversation.
import { randomUUID } from "node:crypto";
import type { UIMessage } from "ai";
import { pool } from "./db.js";
import type { CoachThread } from "./schemas.js";

/** A thread title is cut from the first thing the athlete says. */
const TITLE_MAX_LENGTH = 60;

interface ThreadRow {
  id: string;
  user_id: string;
  title: string | null;
  created_at: Date;
  updated_at: Date;
}

interface MessageRow {
  id: string;
  role: UIMessage["role"];
  parts: UIMessage["parts"];
  metadata: UIMessage["metadata"];
}

// better-auth migrates its own tables via `pnpm auth:migrate`; these two are
// ours, so they are created idempotently on first use — the same bargain
// run_render makes.
let tablesReady: Promise<unknown> | null = null;

function ensureTables(): Promise<unknown> {
  tablesReady ??= (async () => {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "coach_thread" (
        "id" uuid PRIMARY KEY,
        "user_id" text NOT NULL,
        "title" text,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS "coach_thread_user_idx"
        ON "coach_thread" ("user_id", "updated_at" DESC)
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "coach_message" (
        -- The AI SDK's message id, so re-sending a message updates it in place.
        -- Keyed with the thread rather than alone: the id arrives from the
        -- browser, and a global key would let a collision rewrite a message in
        -- somebody else's conversation.
        "id" text NOT NULL,
        "thread_id" uuid NOT NULL
          REFERENCES "coach_thread" ("id") ON DELETE CASCADE,
        "role" text NOT NULL,
        -- The UIMessage parts array verbatim: text, reasoning, files, tool calls.
        "parts" jsonb NOT NULL,
        -- Insertion order, not wall clock: a turn's messages land in the same
        -- millisecond and still have to come back in the order they were said.
        "seq" bigserial NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY ("thread_id", "id")
      )
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS "coach_message_thread_idx"
        ON "coach_message" ("thread_id", "seq")
    `);
    // Added after the table shipped — the run the athlete attached to a
    // question with the composer's `@` picker. Existing rows keep a null.
    await pool.query(`
      ALTER TABLE "coach_message" ADD COLUMN IF NOT EXISTS "metadata" jsonb
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "coach_debrief" (
        "user_id" text NOT NULL,
        "activity_id" bigint NOT NULL,
        "thread_id" uuid NOT NULL
          REFERENCES "coach_thread" ("id") ON DELETE CASCADE,
        "message_id" text NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        -- One debrief per run. The webhook is at-least-once delivery, and this
        -- is the second guard behind claimEvent: a redelivery weeks later,
        -- after the event table has been pruned, still cannot post twice.
        PRIMARY KEY ("user_id", "activity_id")
      )
    `);
  })();
  return tablesReady;
}

function toThread(row: ThreadRow): CoachThread {
  return {
    id: row.id,
    title: row.title,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}

/** Starts an empty conversation. The title arrives with the first message. */
export async function createThread(userId: string): Promise<CoachThread> {
  await ensureTables();
  const { rows } = await pool.query<ThreadRow>(
    `INSERT INTO "coach_thread" ("id", "user_id") VALUES ($1, $2) RETURNING *`,
    [randomUUID(), userId],
  );
  return toThread(rows[0]);
}

/** Every conversation this athlete has had, most recently used first. */
export async function listThreads(userId: string): Promise<CoachThread[]> {
  await ensureTables();
  const { rows } = await pool.query<ThreadRow>(
    `SELECT * FROM "coach_thread" WHERE "user_id" = $1 ORDER BY "updated_at" DESC`,
    [userId],
  );
  return rows.map(toThread);
}

/**
 * One thread, or null when it doesn't exist or belongs to someone else — the
 * user id is part of the lookup, so callers can't read across accounts.
 */
export async function getThread(
  userId: string,
  threadId: string,
): Promise<CoachThread | null> {
  await ensureTables();
  const { rows } = await pool.query<ThreadRow>(
    `SELECT * FROM "coach_thread" WHERE "id" = $1 AND "user_id" = $2`,
    [threadId, userId],
  );
  return rows[0] ? toThread(rows[0]) : null;
}

export async function deleteThread(
  userId: string,
  threadId: string,
): Promise<boolean> {
  await ensureTables();
  const { rowCount } = await pool.query(
    `DELETE FROM "coach_thread" WHERE "id" = $1 AND "user_id" = $2`,
    [threadId, userId],
  );
  return (rowCount ?? 0) > 0;
}

/** The transcript, oldest first — the history `streamText` is given. */
export async function getMessages(threadId: string): Promise<UIMessage[]> {
  await ensureTables();
  const { rows } = await pool.query<MessageRow>(
    `SELECT "id", "role", "parts", "metadata" FROM "coach_message"
     WHERE "thread_id" = $1 ORDER BY "seq"`,
    [threadId],
  );
  return rows.map((row) => ({
    id: row.id,
    role: row.role,
    parts: row.parts,
    // `undefined`, not `null`: the SDK's UIMessage treats metadata as optional,
    // and a null would be handed to the model as a metadata object.
    ...(row.metadata ? { metadata: row.metadata } : {}),
  }));
}

/**
 * Appends a message, or rewrites it if the id is already there — regenerating
 * an answer replays the same assistant id and should replace, not duplicate.
 * Touching the thread doubles as the "most recently used" clock for the list.
 */
export async function saveMessage(
  threadId: string,
  message: UIMessage,
): Promise<void> {
  await ensureTables();
  await pool.query(
    `INSERT INTO "coach_message" ("id", "thread_id", "role", "parts", "metadata")
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT ("thread_id", "id") DO UPDATE
       SET "parts" = EXCLUDED."parts", "metadata" = EXCLUDED."metadata"`,
    [
      message.id,
      threadId,
      message.role,
      JSON.stringify(message.parts),
      message.metadata ? JSON.stringify(message.metadata) : null,
    ],
  );
  await pool.query(
    `UPDATE "coach_thread" SET "updated_at" = now() WHERE "id" = $1`,
    [threadId],
  );
}

/**
 * Forgets the turn being regenerated, exactly as far back as the browser does.
 *
 * `useChat`'s `regenerate({ messageId })` truncates its own transcript *at* an
 * assistant message (throwing that answer away) but *after* a user message
 * (keeping the question). The stored transcript has to land in the same place,
 * or the model would be asked to improve on an answer it can still see. An id
 * that isn't in this thread deletes nothing.
 */
export async function truncateForRegenerate(
  threadId: string,
  messageId: string,
): Promise<void> {
  await ensureTables();
  await pool.query(
    `DELETE FROM "coach_message" m
     WHERE m."thread_id" = $1
       AND EXISTS (
         SELECT 1 FROM "coach_message" anchor
         WHERE anchor."id" = $2
           AND anchor."thread_id" = $1
           AND m."seq" >= CASE
             WHEN anchor."role" = 'assistant' THEN anchor."seq"
             ELSE anchor."seq" + 1
           END
       )`,
    [threadId, messageId],
  );
}

/** The first line of the athlete's opening message, trimmed to fit a sidebar. */
export function titleFrom(message: UIMessage): string | null {
  const text = message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return null;
  return text.length > TITLE_MAX_LENGTH
    ? `${text.slice(0, TITLE_MAX_LENGTH).trimEnd()}…`
    : text;
}

/**
 * The athlete's thread with this exact title, creating it if it isn't there.
 *
 * Used by the automatic debrief, which needs somewhere predictable to land:
 * posting into whatever conversation happens to be open would interrupt a
 * question about next week with a card about yesterday.
 */
export async function findOrCreateThread(
  userId: string,
  title: string,
): Promise<CoachThread> {
  await ensureTables();
  const { rows } = await pool.query<ThreadRow>(
    `SELECT * FROM "coach_thread"
     WHERE "user_id" = $1 AND "title" = $2
     ORDER BY "created_at" LIMIT 1`,
    [userId, title],
  );
  if (rows[0]) return toThread(rows[0]);

  const { rows: created } = await pool.query<ThreadRow>(
    `INSERT INTO "coach_thread" ("id", "user_id", "title")
     VALUES ($1, $2, $3) RETURNING *`,
    [randomUUID(), userId, title],
  );
  return toThread(created[0]);
}

/** The debrief already posted for a run, or null. */
export async function findDebrief(
  userId: string,
  activityId: number,
): Promise<{ thread_id: string; message_id: string } | null> {
  await ensureTables();
  const { rows } = await pool.query<{ thread_id: string; message_id: string }>(
    `SELECT "thread_id", "message_id" FROM "coach_debrief"
     WHERE "user_id" = $1 AND "activity_id" = $2`,
    [userId, activityId],
  );
  return rows[0] ?? null;
}

/** Records that a run has been debriefed, so it never is again. */
export async function recordDebrief(
  userId: string,
  activityId: number,
  threadId: string,
  messageId: string,
): Promise<void> {
  await ensureTables();
  await pool.query(
    `INSERT INTO "coach_debrief" ("user_id", "activity_id", "thread_id", "message_id")
     VALUES ($1, $2, $3, $4)
     ON CONFLICT ("user_id", "activity_id") DO NOTHING`,
    [userId, activityId, threadId, messageId],
  );
}

/** Names a thread the first time the athlete says something in it. */
export async function setTitleIfUnset(
  threadId: string,
  title: string,
): Promise<void> {
  await ensureTables();
  await pool.query(
    `UPDATE "coach_thread" SET "title" = $2 WHERE "id" = $1 AND "title" IS NULL`,
    [threadId, title],
  );
}
