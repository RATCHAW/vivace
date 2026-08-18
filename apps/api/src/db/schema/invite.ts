// One row per invitation to appear in somebody else's run video.
//
// The invite is the whole social layer. There is deliberately no friendship, no
// follower list and no pending-requests inbox: an invite names one inviter, one
// of their runs, and one athlete who said yes to *that*, and it stops being
// interesting the moment it is answered. Strava's API cannot supply any of this
// — it exposes no social graph at all — so the connection between two athletes
// is something this table asserts rather than something we look up.
//
// It is also the data dependency. A second runner's pace can only be read with
// that runner's own Strava token, so a film with two people in it cannot exist
// until the second one has authorised us themselves.
import { bigint, index, pgTable, text, timestamp } from "drizzle-orm/pg-core";

const tz = { withTimezone: true } as const;

/**
 * Where an invitation has got to.
 *
 * There is no `expired` member on purpose: expiry is a fact about the clock, not
 * an event anybody writes. Nothing would ever run the UPDATE, so a row could sit
 * `pending` for a year and read as live. `expiresAt` is compared instead — see
 * `isOpen` in invite-store.ts.
 */
export type InviteStatus = "pending" | "accepted" | "declined" | "revoked";

export const runInvite = pgTable(
  "run_invite",
  {
    /** The bearer token in the link, and the row's identity. Unguessable
     *  because possession of it is the whole authorisation to see the preview:
     *  32 bytes from a CSPRNG, base64url. */
    token: text("token").primaryKey(),
    inviterUserId: text("inviter_user_id").notNull(),
    /** The run the film is of. */
    inviterActivityId: bigint("inviter_activity_id", {
      mode: "number",
    }).notNull(),
    /** Null until somebody accepts — an invite is a link before it is a pair. */
    inviteeUserId: text("invitee_user_id"),
    /** Which of *their* runs was the same run. Declared by the invitee rather
     *  than inferred by us: they are the only one who actually knows, and it
     *  turns a matching problem into a confirmation. */
    inviteeActivityId: bigint("invitee_activity_id", { mode: "number" }),
    status: text("status").$type<InviteStatus>().notNull().default("pending"),
    /** What the invitee was shown when they agreed, kept verbatim. The consent
     *  is per video and has to be evidenced as it was worded at the time, not
     *  as the catalogue words it today. */
    consentText: text("consent_text"),
    expiresAt: timestamp("expires_at", tz).notNull(),
    /** When it was accepted, declined or revoked. Null while pending. */
    respondedAt: timestamp("responded_at", tz),
    createdAt: timestamp("created_at", tz).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", tz).notNull().defaultNow(),
  },
  (table) => [
    // The studio asks "what is outstanding on this run?" on every open.
    index("run_invite_inviter_idx").on(
      table.inviterUserId,
      table.inviterActivityId,
    ),
    // Revocation asks the opposite question — "what has this athlete agreed to?"
    // — and has to answer it for a user who is halfway out of the door.
    index("run_invite_invitee_idx").on(table.inviteeUserId),
  ],
);
