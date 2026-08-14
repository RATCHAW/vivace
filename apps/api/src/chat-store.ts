// Persistence for the coach chat: one row per conversation, one row per message.
//
// The AI SDK's `useChat` only ever sends the message the athlete just typed —
// the transcript the model reasons over is loaded from here on every turn, and
// the assistant's reply is written back when its stream ends. That keeps the
// request small and makes the server, not the browser, the source of truth for
// a conversation.
import { randomUUID } from "node:crypto";
import type { UIMessage } from "ai";
import { and, asc, desc, eq, exists, gte, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "./db/index.js";
import { coachDebrief, coachMessage, coachThread } from "./db/schema/coach.js";
import type { CoachThread } from "./schemas.js";

/** A thread title is cut from the first thing the athlete says. */
const TITLE_MAX_LENGTH = 60;

type ThreadRow = typeof coachThread.$inferSelect;

function toThread(row: ThreadRow): CoachThread {
  return {
    id: row.id,
    title: row.title,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

/** Starts an empty conversation. The title arrives with the first message. */
export async function createThread(userId: string): Promise<CoachThread> {
  const [row] = await db
    .insert(coachThread)
    .values({ id: randomUUID(), userId })
    .returning();
  return toThread(row);
}

/** Every conversation this athlete has had, most recently used first. */
export async function listThreads(userId: string): Promise<CoachThread[]> {
  const rows = await db
    .select()
    .from(coachThread)
    .where(eq(coachThread.userId, userId))
    .orderBy(desc(coachThread.updatedAt));
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
  const [row] = await db
    .select()
    .from(coachThread)
    .where(and(eq(coachThread.id, threadId), eq(coachThread.userId, userId)));
  return row ? toThread(row) : null;
}

export async function deleteThread(
  userId: string,
  threadId: string,
): Promise<boolean> {
  const deleted = await db
    .delete(coachThread)
    .where(and(eq(coachThread.id, threadId), eq(coachThread.userId, userId)))
    .returning({ id: coachThread.id });
  return deleted.length > 0;
}

/** The transcript, oldest first — the history `streamText` is given. */
export async function getMessages(threadId: string): Promise<UIMessage[]> {
  const rows = await db
    .select({
      id: coachMessage.id,
      role: coachMessage.role,
      parts: coachMessage.parts,
      metadata: coachMessage.metadata,
    })
    .from(coachMessage)
    .where(eq(coachMessage.threadId, threadId))
    .orderBy(asc(coachMessage.seq));

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
  await db
    .insert(coachMessage)
    .values({
      id: message.id,
      threadId,
      role: message.role,
      parts: message.parts,
      metadata: message.metadata ?? null,
    })
    .onConflictDoUpdate({
      target: [coachMessage.threadId, coachMessage.id],
      set: {
        parts: sql`excluded."parts"`,
        metadata: sql`excluded."metadata"`,
      },
    });

  await db
    .update(coachThread)
    .set({ updatedAt: sql`now()` })
    .where(eq(coachThread.id, threadId));
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
  const anchor = alias(coachMessage, "anchor");

  await db.delete(coachMessage).where(
    and(
      eq(coachMessage.threadId, threadId),
      exists(
        db
          .select({ one: sql`1` })
          .from(anchor)
          .where(
            and(
              eq(anchor.id, messageId),
              eq(anchor.threadId, threadId),
              gte(
                coachMessage.seq,
                sql`CASE WHEN ${anchor.role} = 'assistant' THEN ${anchor.seq} ELSE ${anchor.seq} + 1 END`,
              ),
            ),
          ),
      ),
    ),
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
  const [existing] = await db
    .select()
    .from(coachThread)
    .where(and(eq(coachThread.userId, userId), eq(coachThread.title, title)))
    .orderBy(asc(coachThread.createdAt))
    .limit(1);
  if (existing) return toThread(existing);

  const [created] = await db
    .insert(coachThread)
    .values({ id: randomUUID(), userId, title })
    .returning();
  return toThread(created);
}

/** The debrief already posted for a run, or null. */
export async function findDebrief(
  userId: string,
  activityId: number,
): Promise<{ thread_id: string; message_id: string } | null> {
  const [row] = await db
    .select({
      thread_id: coachDebrief.threadId,
      message_id: coachDebrief.messageId,
    })
    .from(coachDebrief)
    .where(
      and(
        eq(coachDebrief.userId, userId),
        eq(coachDebrief.activityId, activityId),
      ),
    );
  return row ?? null;
}

/** Records that a run has been debriefed, so it never is again. */
export async function recordDebrief(
  userId: string,
  activityId: number,
  threadId: string,
  messageId: string,
): Promise<void> {
  await db
    .insert(coachDebrief)
    .values({ userId, activityId, threadId, messageId })
    .onConflictDoNothing();
}

/** Names a thread the first time the athlete says something in it. */
export async function setTitleIfUnset(
  threadId: string,
  title: string,
): Promise<void> {
  await db
    .update(coachThread)
    .set({ title })
    .where(
      and(eq(coachThread.id, threadId), sql`${coachThread.title} IS NULL`),
    );
}
