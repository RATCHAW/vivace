// Strava's push subscription: the one place the app hears about a run without
// being asked. https://developers.strava.com/docs/webhooks/
//
// The shape of the deal:
//  - one subscription per application, created out of band with the CLI in
//    scripts/strava-webhook.ts;
//  - Strava validates the callback with a GET carrying `hub.challenge`, which
//    has to come back as JSON inside two seconds;
//  - every event is a POST that must be acknowledged with a 200 inside two
//    seconds, or Strava retries it up to three times total.
//
// Two seconds is not enough to read an activity and write a debrief, so the
// route acks first and works afterwards — `claimEvent` is what stops those
// retries from producing three debriefs of the same run.
//
// NOTE: this is the one part of the app that talks to Strava with bare `fetch`.
// CLAUDE.md says to use the generated SDK, and everything else does — but
// `/push_subscriptions` is absent from Strava's published Swagger, so there is
// nothing generated to call.
import { createHmac, timingSafeEqual } from "node:crypto";
import { pool } from "./db.js";
import { logger } from "./logger.js";
import type { StravaEvent } from "./schemas.js";

const STRAVA_API = "https://www.strava.com/api/v3";
const SUBSCRIPTIONS_URL = `${STRAVA_API}/push_subscriptions`;

/** Where Strava sends events. Mirrors the route registered in app.ts. */
export const WEBHOOK_PATH = "/api/strava/webhook";

/**
 * The string Strava echoes back during validation.
 *
 * Without one the callback cannot prove it is ours, so validation is refused
 * rather than waved through — an unauthenticated endpoint that answers any
 * challenge is an open relay for somebody else's subscription.
 */
export function verifyToken(): string | null {
  return process.env.STRAVA_WEBHOOK_VERIFY_TOKEN || null;
}

/** Secret Strava uses to authenticate each POST delivery. */
export function webhookSigningSecret(): string | null {
  return process.env.STRAVA_WEBHOOK_SIGNING_SECRET || null;
}

const SIGNATURE_MAX_AGE_SECONDS = 300;

/**
 * Verifies Strava's `X-Strava-Signature: t=…,v1=…` header over the exact body.
 *
 * The timestamp window prevents a captured delivery from being replayed after
 * five minutes. The database claim remains necessary for legitimate retries
 * that arrive inside that window.
 */
export function verifyWebhookSignature(
  rawBody: string,
  header: string | null,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): boolean {
  if (!header) return false;

  let timestamp: string | null = null;
  const signatures: string[] = [];
  for (const part of header.split(",")) {
    const separator = part.indexOf("=");
    if (separator <= 0) continue;
    const key = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (key === "t" && value) timestamp = value;
    if (key === "v1" && value) signatures.push(value);
  }

  if (!timestamp || !/^\d+$/.test(timestamp) || signatures.length === 0) {
    return false;
  }

  const eventSeconds = Number(timestamp);
  if (
    !Number.isSafeInteger(eventSeconds) ||
    Math.abs(nowSeconds - eventSeconds) > SIGNATURE_MAX_AGE_SECONDS
  ) {
    return false;
  }

  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest();

  return signatures.some((candidate) => {
    if (!/^[0-9a-f]{64}$/i.test(candidate)) return false;
    const actual = Buffer.from(candidate, "hex");
    return (
      actual.length === expected.length && timingSafeEqual(actual, expected)
    );
  });
}

function credentials(): { client_id: string; client_secret: string } {
  const client_id = process.env.STRAVA_CLIENT_ID;
  const client_secret = process.env.STRAVA_CLIENT_SECRET;
  if (!client_id || !client_secret) {
    throw new Error("STRAVA_CLIENT_ID and STRAVA_CLIENT_SECRET must be set");
  }
  return { client_id, client_secret };
}

export interface StravaSubscription {
  id: number;
  callback_url: string;
  created_at?: string;
  updated_at?: string;
}

/** The application's subscription, or an empty list when there isn't one. */
export async function viewSubscriptions(): Promise<StravaSubscription[]> {
  const query = new URLSearchParams(credentials());
  const response = await fetch(`${SUBSCRIPTIONS_URL}?${query}`);
  if (!response.ok) {
    throw new Error(
      `Strava returned ${response.status}: ${await response.text()}`,
    );
  }
  return (await response.json()) as StravaSubscription[];
}

/**
 * Creates the subscription. Strava calls `callbackUrl` with the validation
 * challenge *during* this request, so the API has to already be reachable at
 * that address — this fails rather than queueing if it isn't.
 */
export async function createSubscription(
  callbackUrl: string,
  token: string,
): Promise<StravaSubscription> {
  const response = await fetch(SUBSCRIPTIONS_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      ...credentials(),
      callback_url: callbackUrl,
      verify_token: token,
    }),
  });
  if (!response.ok) {
    throw new Error(
      `Strava returned ${response.status}: ${await response.text()}`,
    );
  }
  return (await response.json()) as StravaSubscription;
}

export async function deleteSubscription(id: number): Promise<void> {
  const query = new URLSearchParams(credentials());
  const response = await fetch(`${SUBSCRIPTIONS_URL}/${id}?${query}`, {
    method: "DELETE",
  });
  // 204 on success, per the docs.
  if (!response.ok) {
    throw new Error(
      `Strava returned ${response.status}: ${await response.text()}`,
    );
  }
}

// --- events -------------------------------------------------------------------

// The event's own shape lives in schemas.ts with the rest of the API contract,
// because the route that receives it is documented like every other route.

let tableReady: Promise<unknown> | null = null;

function ensureTable(): Promise<unknown> {
  tableReady ??= pool.query(`
    CREATE TABLE IF NOT EXISTS "strava_webhook_event" (
      "object_id" bigint NOT NULL,
      "aspect_type" text NOT NULL,
      "event_time" bigint NOT NULL,
      "received_at" timestamptz NOT NULL DEFAULT now(),
      -- Strava retries an unacknowledged event up to three times, and every
      -- retry is byte-identical. This is what makes the work happen once.
      PRIMARY KEY ("object_id", "aspect_type", "event_time")
    )
  `);
  return tableReady;
}

/**
 * Takes ownership of an event, or reports that someone already has.
 *
 * True means this process should do the work; false means it is a retry (or a
 * second instance got there first) and there is nothing to do.
 */
export async function claimEvent(event: StravaEvent): Promise<boolean> {
  await ensureTable();
  const { rowCount } = await pool.query(
    `INSERT INTO "strava_webhook_event" ("object_id", "aspect_type", "event_time")
     VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
    [event.object_id, event.aspect_type, event.event_time],
  );
  return (rowCount ?? 0) > 0;
}

/** Events older than this are dropped on the next claim; nothing replays a month later. */
const EVENT_RETENTION_DAYS = 30;

/** Keeps the idempotency table from growing without limit. Best effort. */
export async function pruneEvents(): Promise<void> {
  try {
    await ensureTable();
    await pool.query(
      `DELETE FROM "strava_webhook_event"
       WHERE "received_at" < now() - ($1 || ' days')::interval`,
      [EVENT_RETENTION_DAYS],
    );
  } catch (err) {
    logger.warn(
      { event: "webhook.prune_failed", err },
      "Could not prune webhook events",
    );
  }
}

/** The user behind a Strava athlete id, or null if nobody here has connected it. */
export async function userForAthlete(
  athleteId: number,
): Promise<string | null> {
  // better-auth owns this table; `accountId` is what `getUserInfo` returned for
  // the provider, which for Strava is the athlete id as a string (see auth.ts).
  const { rows } = await pool.query<{ userId: string }>(
    `SELECT "userId" FROM "account"
     WHERE "providerId" = 'strava' AND "accountId" = $1 LIMIT 1`,
    [String(athleteId)],
  );
  return rows[0]?.userId ?? null;
}
