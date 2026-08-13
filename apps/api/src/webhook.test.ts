// The Strava webhook end to end, with everything it reaches for stubbed.
//
// This endpoint is unauthenticated by necessity — Strava has no credential to
// present — so what is actually under test is the two things that stand in for
// one: the verify token on the handshake, and the claim that stops a retried
// event from being processed twice.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StravaEvent } from "./schemas.js";

process.env.BETTER_AUTH_SECRET ??= "test-secret-not-for-production";
process.env.DATABASE_URL ??= "postgres://app:app@localhost:5433/app";

const VERIFY_TOKEN = "a-random-string";
const ATHLETE_ID = 165387970;
const USER_ID = "athlete-1";
const ACTIVITY_ID = 987654321;

vi.mock("./auth.js", () => ({
  auth: {
    api: {
      getSession: async () => null,
      getAccessToken: async () => ({ accessToken: "strava-token" }),
    },
    handler: async () => new Response(null, { status: 404 }),
  },
}));

/** Events this process has already taken ownership of. */
let claimed: string[] = [];
/** Athletes connected here. */
let known: number[] = [ATHLETE_ID];

vi.mock("./webhook.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./webhook.js")>();
  return {
    ...actual,
    claimEvent: async (event: StravaEvent) => {
      const key = `${event.object_id}:${event.aspect_type}:${event.event_time}`;
      if (claimed.includes(key)) return false;
      claimed.push(key);
      return true;
    },
    pruneEvents: async () => {},
    userForAthlete: async (athleteId: number) =>
      known.includes(athleteId) ? USER_ID : null,
  };
});

let debriefed: { userId: string; activityId: number }[] = [];
let existingDebrief: { thread_id: string; message_id: string } | null = null;

vi.mock("./debrief.js", () => ({
  DEBRIEF_THREAD_TITLE: "Post-run debriefs",
  postRunDebrief: async (userId: string, _token: string, activityId: number) => {
    debriefed.push({ userId, activityId });
    return "thread-1";
  },
}));

vi.mock("./chat-store.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./chat-store.js")>();
  return { ...actual, findDebrief: async () => existingDebrief };
});

const { app } = await import("./app.js");

/** The work behind the ack is deliberately not awaited by the handler. */
async function settle() {
  for (let i = 0; i < 5; i++) await new Promise((resolve) => setImmediate(resolve));
}

function event(over: Partial<StravaEvent> = {}) {
  return {
    object_type: "activity",
    object_id: ACTIVITY_ID,
    aspect_type: "create",
    updates: {},
    owner_id: ATHLETE_ID,
    subscription_id: 1,
    event_time: 1786631264,
    ...over,
  };
}

function post(body: unknown) {
  return app.request("/api/strava/webhook", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("GET /api/strava/webhook", () => {
  beforeEach(() => {
    process.env.STRAVA_WEBHOOK_VERIFY_TOKEN = VERIFY_TOKEN;
  });

  const challenge = (token: string, mode = "subscribe") =>
    app.request(
      `/api/strava/webhook?hub.mode=${mode}&hub.challenge=abc123&hub.verify_token=${token}`,
    );

  it("echoes the challenge back to Strava", async () => {
    const res = await challenge(VERIFY_TOKEN);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ "hub.challenge": "abc123" });
  });

  it("refuses a challenge carrying somebody else's token", async () => {
    const res = await challenge("not-our-token");
    expect(res.status).toBe(403);
  });

  it("refuses anything that isn't a subscribe", async () => {
    expect((await challenge(VERIFY_TOKEN, "unsubscribe")).status).toBe(403);
  });

  it("refuses to validate at all when no token is configured", async () => {
    delete process.env.STRAVA_WEBHOOK_VERIFY_TOKEN;
    expect((await challenge(VERIFY_TOKEN)).status).toBe(403);
  });
});

describe("POST /api/strava/webhook", () => {
  beforeEach(() => {
    claimed = [];
    known = [ATHLETE_ID];
    debriefed = [];
    existingDebrief = null;
  });

  it("acknowledges a new run and debriefs it", async () => {
    const res = await post(event());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });

    await settle();
    expect(debriefed).toEqual([{ userId: USER_ID, activityId: ACTIVITY_ID }]);
  });

  it("debriefs a retried event once", async () => {
    // Strava retries up to three times when it doesn't see a 200 in time.
    await post(event());
    await post(event());
    await post(event());
    await settle();

    expect(debriefed).toHaveLength(1);
  });

  it("never debriefs the same run twice, even after the event table is pruned", async () => {
    existingDebrief = { thread_id: "thread-1", message_id: "msg-1" };
    await post(event({ event_time: 1786631999 }));
    await settle();

    expect(debriefed).toEqual([]);
  });

  it("ignores an update to an existing activity", async () => {
    await post(event({ aspect_type: "update", updates: { title: "Renamed" } }));
    await settle();

    expect(debriefed).toEqual([]);
  });

  it("acknowledges an event for an athlete who has never signed in here", async () => {
    known = [];
    const res = await post(event());
    expect(res.status).toBe(200);

    await settle();
    expect(debriefed).toEqual([]);
  });

  it("acknowledges a deauthorisation without trying to read anything", async () => {
    const res = await post(
      event({
        object_type: "athlete",
        object_id: ATHLETE_ID,
        updates: { authorized: "false" },
      }),
    );
    expect(res.status).toBe(200);

    await settle();
    expect(debriefed).toEqual([]);
  });

  it("rejects a body that isn't a Strava event", async () => {
    expect((await post({ hello: "world" })).status).toBe(400);
  });
});
