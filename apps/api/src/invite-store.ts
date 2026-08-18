// Persistence for run invitations — see db/schema/invite.ts for what one is.
import { randomBytes } from "node:crypto";
import { and, eq, or, sql } from "drizzle-orm";
import { db } from "./db/index.js";
import { user } from "./db/schema/auth.js";
import { runInvite, type InviteStatus } from "./db/schema/invite.js";

export type InviteRow = typeof runInvite.$inferSelect;

/**
 * How long a link is good for.
 *
 * Short enough that a link forwarded on months later is dead, long enough that
 * somebody who ran on Saturday and opened the message on their commute a week
 * later still gets the film. It is not a security control — the token is — it
 * is a limit on how long an unanswered request stays answerable.
 */
export const INVITE_TTL_DAYS = 14;

/** 32 bytes of CSPRNG, URL-safe. The link is a bearer credential. */
function mintToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Still answerable: nobody has responded and the clock hasn't run out. */
export function isOpen(row: InviteRow, now = new Date()): boolean {
  return row.status === "pending" && row.expiresAt.getTime() > now.getTime();
}

/**
 * A link for this run, minting one only if this run has no live link already.
 *
 * Reuse rather than a fresh row per click: "share again" is the same request,
 * and an athlete who taps it three times should not leave three live tokens
 * behind — each of which would be a separate standing permission to see the
 * run.
 */
export async function createInvite(input: {
  inviterUserId: string;
  inviterActivityId: number;
}): Promise<{ invite: InviteRow; reused: boolean }> {
  const open = await openInviteForRun(
    input.inviterUserId,
    input.inviterActivityId,
  );
  if (open) return { invite: open, reused: true };

  const [invite] = await db
    .insert(runInvite)
    .values({
      token: mintToken(),
      inviterUserId: input.inviterUserId,
      inviterActivityId: input.inviterActivityId,
      expiresAt: sql`now() + ${`${INVITE_TTL_DAYS} days`}::interval`,
    })
    .returning();
  return { invite, reused: false };
}

/** The live, unanswered link for a run, if there is one. */
async function openInviteForRun(
  inviterUserId: string,
  inviterActivityId: number,
): Promise<InviteRow | null> {
  const [row] = await db
    .select()
    .from(runInvite)
    .where(
      and(
        eq(runInvite.inviterUserId, inviterUserId),
        eq(runInvite.inviterActivityId, inviterActivityId),
        eq(runInvite.status, "pending"),
        sql`${runInvite.expiresAt} > now()`,
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function getInvite(token: string): Promise<InviteRow | null> {
  const [row] = await db
    .select()
    .from(runInvite)
    .where(eq(runInvite.token, token))
    .limit(1);
  return row ?? null;
}

/** An invitation plus the name of whoever answered it, if anyone has. */
export interface InviteWithInvitee {
  invite: InviteRow;
  /** better-auth's stored display name for the invitee — the route cuts it down
   *  to a first name. Null while the invitation is unanswered. */
  inviteeName: string | null;
}

/**
 * Every invitation this athlete has sent for this run, newest first.
 *
 * Left-joined rather than fetched from Strava: the inviter is owed a name
 * beside "accepted", and reading it from our own `user` row costs nothing —
 * where asking Strava would cost a request per invitee against a budget shared
 * by the whole application.
 */
export async function listInvitesForRun(
  inviterUserId: string,
  inviterActivityId: number,
): Promise<InviteWithInvitee[]> {
  const rows = await db
    .select({ invite: runInvite, inviteeName: user.name })
    .from(runInvite)
    .leftJoin(user, eq(user.id, runInvite.inviteeUserId))
    .where(
      and(
        eq(runInvite.inviterUserId, inviterUserId),
        eq(runInvite.inviterActivityId, inviterActivityId),
      ),
    )
    .orderBy(sql`${runInvite.createdAt} desc`);
  return rows;
}

/**
 * The answered invitation that puts a second runner in this run's film.
 *
 * At most one is ever used, and the newest wins: `createInvite` will not mint a
 * second link while one is live, so two accepted rows on one run means the first
 * partner's invitation was superseded rather than that the film has three people
 * in it. Expiry is not consulted — an accepted invitation is a permission that
 * was given, and the link's clock only ever governed answering it.
 */
export async function acceptedInviteForRun(
  inviterUserId: string,
  inviterActivityId: number,
): Promise<InviteRow | null> {
  const [row] = await db
    .select()
    .from(runInvite)
    .where(
      and(
        eq(runInvite.inviterUserId, inviterUserId),
        eq(runInvite.inviterActivityId, inviterActivityId),
        eq(runInvite.status, "accepted"),
      ),
    )
    .orderBy(sql`${runInvite.respondedAt} desc`)
    .limit(1);
  return row ?? null;
}

/**
 * Answer a live invitation.
 *
 * The status is part of the WHERE rather than checked first, so two taps on a
 * slow connection settle it once — the second updates no rows and gets null
 * back, which the route reads as "already answered" rather than as a failure.
 */
async function respond(
  token: string,
  status: Exclude<InviteStatus, "pending">,
  set: Partial<typeof runInvite.$inferInsert> = {},
): Promise<InviteRow | null> {
  const [row] = await db
    .update(runInvite)
    .set({
      status,
      respondedAt: sql`now()`,
      updatedAt: sql`now()`,
      ...set,
    })
    .where(
      and(
        eq(runInvite.token, token),
        eq(runInvite.status, "pending"),
        sql`${runInvite.expiresAt} > now()`,
      ),
    )
    .returning();
  return row ?? null;
}

export async function acceptInvite(input: {
  token: string;
  inviteeUserId: string;
  inviteeActivityId: number;
  consentText: string;
}): Promise<InviteRow | null> {
  return respond(input.token, "accepted", {
    inviteeUserId: input.inviteeUserId,
    inviteeActivityId: input.inviteeActivityId,
    consentText: input.consentText,
  });
}

export async function declineInvite(
  token: string,
  inviteeUserId: string,
): Promise<InviteRow | null> {
  // The decliner is recorded: without it a declined invite cannot be told from
  // one nobody ever opened, and the inviter deserves to know which it was.
  return respond(token, "declined", { inviteeUserId });
}

/** The inviter taking the link back. Only a live one can be withdrawn. */
export async function revokeInvite(
  token: string,
  inviterUserId: string,
): Promise<InviteRow | null> {
  const [row] = await db
    .update(runInvite)
    .set({ status: "revoked", respondedAt: sql`now()`, updatedAt: sql`now()` })
    .where(
      and(
        eq(runInvite.token, token),
        eq(runInvite.inviterUserId, inviterUserId),
        eq(runInvite.status, "pending"),
      ),
    )
    .returning();
  return row ?? null;
}

/**
 * Withdraw everything an athlete is party to, in either direction.
 *
 * Called when they disconnect Strava. An accepted invitation is a standing
 * permission to put their run in somebody else's film, and revoking the grant
 * that made the data reachable has to revoke the permission with it — the
 * alternative is a consent that outlives the account that gave it.
 *
 * Returns the rows that were live, so the caller can log what it undid.
 */
export async function revokeAllForUser(userId: string): Promise<InviteRow[]> {
  return db
    .update(runInvite)
    .set({ status: "revoked", respondedAt: sql`now()`, updatedAt: sql`now()` })
    .where(
      and(
        or(
          eq(runInvite.inviterUserId, userId),
          eq(runInvite.inviteeUserId, userId),
        ),
        // `accepted` is included deliberately: it is the one that grants
        // something. `declined` and `revoked` are already closed.
        or(eq(runInvite.status, "pending"), eq(runInvite.status, "accepted")),
      ),
    )
    .returning();
}
