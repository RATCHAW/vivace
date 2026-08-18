// Drives the whole invitation flow against a local database and the real
// Strava API, without a second Strava account.
//
// The feature needs two athletes, and the second one's runs have to overlap the
// first one's — which is not something you can conjure while testing. So this
// makes a second *Vivace* user that borrows the same Strava grant. Two rows in
// `user`, two sessions, one Strava athlete behind both. Every line of the flow
// runs for real: the routes, the ownership checks, the ranking, the consent
// record and the database writes.
//
// What it therefore does *not* prove: that a genuinely different athlete's runs
// rank correctly, and that Strava will hand out a second grant at all (an app in
// Single Player Mode has an athlete capacity of one — see
// https://www.strava.com/settings/api). Those need two real accounts. Everything
// on this side of that line is covered here.
//
// Usage, with the API's .env pointing at a local database:
//   pnpm --filter @repo/api invite:smoke
//   pnpm --filter @repo/api invite:smoke -- --keep   # leave the rows behind
import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { makeSignature } from "better-auth/crypto";
import { db, pool } from "../src/db/index.js";
import { account, session, user } from "../src/db/schema/auth.js";
import { runInvite } from "../src/db/schema/invite.js";
import type { Run, RunInvite, RunInvitePreview } from "../src/schemas.js";

/** Mirrors `refuseInProduction` in db/seed.ts — the same guard, same reasons. */
function refuseInProduction(): void {
  if (
    process.env.NODE_ENV === "production" ||
    process.env.APP_ENV === "production"
  ) {
    throw new Error("Refusing to run: NODE_ENV/APP_ENV says production");
  }
  const url = process.env.DATABASE_URL ?? "";
  if (
    url &&
    !/@(localhost|127\.0\.0\.1|db|host\.docker\.internal)[:/]/.test(url)
  ) {
    throw new Error(
      `Refusing to run: DATABASE_URL is not a local database (${url.replace(/:[^:@]*@/, ":***@")})`,
    );
  }
}

const PARTNER_PREFIX = "smoke-partner-";

/**
 * A session cookie the app will actually accept.
 *
 * better-auth signs the cookie as `<token>.<HMAC-SHA256(token, secret)>`, and
 * `makeSignature` is its own implementation of that half — so this is the
 * library's format rather than a guess at it. The session row is written
 * directly because there is no password and no OAuth round trip to sign in with.
 */
async function signIn(userId: string): Promise<string> {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error("BETTER_AUTH_SECRET must be set");

  const token = randomUUID().replaceAll("-", "");
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
  await db.insert(session).values({
    id: randomUUID(),
    token,
    userId,
    expiresAt,
    updatedAt: new Date(),
  });

  return `better-auth.session_token=${token}.${await makeSignature(token, secret)}`;
}

/** The athlete already signed in here, and their Strava grant. */
async function realAthlete() {
  const [row] = await db
    .select({
      userId: account.userId,
      name: user.name,
      accountId: account.accountId,
    })
    .from(account)
    .innerJoin(user, eq(user.id, account.userId))
    .where(eq(account.providerId, "strava"))
    .orderBy(desc(account.createdAt))
    .limit(1);

  if (!row) {
    throw new Error(
      "No Strava account in this database. Sign in through the app first.",
    );
  }
  return row;
}

/**
 * A second Vivace user on the same Strava grant.
 *
 * The tokens are copied, but `accountId` deliberately is not: it holds the
 * Strava athlete id, and `userForAthlete` — which maps a webhook delivery back
 * to a user — reads exactly that column. Two rows carrying the same id would
 * make that lookup a coin toss. Nothing in the invite flow needs it, because
 * `getAccessToken` is keyed on the *user*.
 */
async function makePartner(realUserId: string) {
  const [grant] = await db
    .select()
    .from(account)
    .where(
      and(eq(account.providerId, "strava"), eq(account.userId, realUserId)),
    )
    .limit(1);
  if (!grant) throw new Error("The signed-in athlete has no Strava grant");

  const id = `${PARTNER_PREFIX}${randomUUID()}`;
  await db.insert(user).values({
    id,
    name: "Smoke Partner",
    email: `${id}@invite-smoke.local`,
    emailVerified: false,
    updatedAt: new Date(),
  });
  await db.insert(account).values({
    ...grant,
    id: randomUUID(),
    userId: id,
    accountId: `${grant.accountId}-${PARTNER_PREFIX}`,
    updatedAt: new Date(),
  });
  return id;
}

/** Deletes everything this script created. `account` and `session` cascade. */
async function cleanUp(partnerId: string, token: string | null) {
  if (token) await db.delete(runInvite).where(eq(runInvite.token, token));
  await db.delete(user).where(eq(user.id, partnerId));
}

let step = 0;
function say(message: string): void {
  step += 1;
  process.stdout.write(`\n${String(step).padStart(2, "0")}  ${message}\n`);
}

function detail(message: string): void {
  process.stdout.write(`    ${message}\n`);
}

/** `app.request`, with the failure body surfaced rather than swallowed. */
async function call<T>(
  app: (typeof import("../src/app.js"))["app"],
  path: string,
  init: RequestInit & { expect: number },
): Promise<T> {
  const { expect, ...rest } = init;
  const res = await app.request(path, rest);
  const body: unknown = await res.json().catch(() => null);
  if (res.status !== expect) {
    throw new Error(
      `${init.method ?? "GET"} ${path} → ${res.status}, wanted ${expect}: ${JSON.stringify(body)}`,
    );
  }
  return body as T;
}

async function main(): Promise<void> {
  refuseInProduction();
  const keep = process.argv.includes("--keep");

  // Imported late: app.ts reads the environment at module scope, and the guard
  // above has to have run before any of that happens.
  const { app } = await import("../src/app.js");

  const athlete = await realAthlete();
  say(`Signed-in athlete: ${athlete.name} (${athlete.userId})`);
  const inviterCookie = await signIn(athlete.userId);

  const runs = await call<Run[]>(app, "/api/me/runs", {
    headers: { cookie: inviterCookie },
    expect: 200,
  });
  if (runs.length === 0) throw new Error("This athlete has no runs on Strava");
  const target = runs[0];
  say(`Inviting on their most recent run: "${target.name}" (${target.id})`);

  let token: string | null = null;
  let partnerId: string | null = null;

  try {
    const invite = await call<RunInvite>(app, `/api/runs/${target.id}/invite`, {
      method: "POST",
      headers: { cookie: inviterCookie },
      expect: 200,
    });
    token = invite.token;
    say(`Invitation created — ${invite.status}, expires ${invite.expires_at}`);
    detail(`Link: http://localhost:5173/invite/${token}`);

    // Reuse, not a second token: two live links would be two standing
    // permissions to view the same run.
    const again = await call<RunInvite>(app, `/api/runs/${target.id}/invite`, {
      method: "POST",
      headers: { cookie: inviterCookie },
      expect: 200,
    });
    say(
      again.token === token
        ? "Asking again reused the same link ✓"
        : `MINTED A SECOND LINK ✗ (${again.token})`,
    );

    // No cookie at all — this is what somebody with no account sees.
    const preview = await call<RunInvitePreview>(app, `/api/invites/${token}`, {
      expect: 200,
    });
    say("Preview with no session ✓");
    detail(
      `"${preview.inviter_name} wants you in their run video" · ${preview.run_name} · ${preview.run_date}`,
    );

    partnerId = await makePartner(athlete.userId);
    const partnerCookie = await signIn(partnerId);
    say(`Second athlete created on the same Strava grant (${partnerId})`);

    // The inviter must not be able to answer their own invitation.
    await call(app, `/api/invites/${token}/candidates`, {
      headers: { cookie: inviterCookie },
      expect: 409,
    });
    say("Inviter answering their own invitation is refused ✓");

    const { candidates } = await call<{ candidates: Run[] }>(
      app,
      `/api/invites/${token}/candidates`,
      { headers: { cookie: partnerCookie }, expect: 200 },
    );
    say(`Ranked ${candidates.length} candidate run(s) for the partner`);
    for (const run of candidates.slice(0, 3)) {
      detail(
        `${run.id} · ${run.name} · ${run.start_date_local} · ${(run.distance / 1000).toFixed(2)} km`,
      );
    }
    if (candidates.length === 0) {
      throw new Error(
        "No candidates. The partner shares the athlete's Strava account, so " +
          "the invited run should always match itself — this is a real failure.",
      );
    }
    if (candidates[0].id !== target.id) {
      detail(`NOTE: expected ${target.id} first, got ${candidates[0].id}`);
    }

    const consent = `I agree to my run appearing in ${preview.inviter_name}'s video.`;
    const accepted = await call<RunInvite>(
      app,
      `/api/invites/${token}/accept`,
      {
        method: "POST",
        headers: { cookie: partnerCookie, "content-type": "application/json" },
        body: JSON.stringify({
          activity_id: candidates[0].id,
          consent_text: consent,
        }),
        expect: 200,
      },
    );
    say(
      `Accepted ✓ — status ${accepted.status}, paired with ${accepted.invitee_activity_id}`,
    );

    // Answering twice is a state, not a fault.
    await call(app, `/api/invites/${token}/accept`, {
      method: "POST",
      headers: { cookie: partnerCookie, "content-type": "application/json" },
      body: JSON.stringify({
        activity_id: candidates[0].id,
        consent_text: consent,
      }),
      expect: 409,
    });
    say("Accepting a second time is refused ✓");

    // `invite.token` rather than the outer `token`, which the `finally` block
    // below reads and so keeps widened to `string | null`.
    const [stored] = await db
      .select()
      .from(runInvite)
      .where(eq(runInvite.token, invite.token));
    say("Row as stored:");
    detail(`status            ${stored.status}`);
    detail(`inviter_activity  ${stored.inviterActivityId}`);
    detail(`invitee_activity  ${stored.inviteeActivityId}`);
    detail(`consent_text      ${stored.consentText}`);
    detail(`responded_at      ${stored.respondedAt?.toISOString()}`);

    const list = await call<{ invites: RunInvite[] }>(
      app,
      `/api/runs/${target.id}/invites`,
      { headers: { cookie: inviterCookie }, expect: 200 },
    );
    say(
      `The inviter sees ${list.invites.length} invitation(s), newest "${list.invites[0]?.status}" by ${list.invites[0]?.invitee_name}`,
    );

    process.stdout.write("\n    All steps passed.\n");
  } finally {
    if (keep) {
      process.stdout.write(
        `\n    --keep: leaving the rows behind. Partner ${partnerId}, token ${token}\n`,
      );
    } else if (partnerId) {
      await cleanUp(partnerId, token);
      process.stdout.write("\n    Cleaned up.\n");
    }
    await pool.end();
  }
}

await main();
