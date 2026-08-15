// The chat route end to end, with the two things it can't own stubbed out: the
// session and the model. The store is stubbed too — the rest of the suite runs
// without Postgres and this shouldn't be the test that changes that — so what is
// actually under test is the wiring: history in, stream out, both sides of the
// turn written back.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MockLanguageModelV4, simulateReadableStream } from "ai/test";
import type { LanguageModelV4StreamPart } from "@ai-sdk/provider";
import type { UIMessage } from "ai";

process.env.BETTER_AUTH_SECRET ??= "test-secret-not-for-production";
process.env.DATABASE_URL ??= "postgres://app:app@localhost:5433/app";

const USER_ID = "athlete-1";
const THREAD_ID = "11111111-2222-3333-4444-555555555555";

let session: { user: { id: string } } | null = { user: { id: USER_ID } };
let accessToken: string | undefined = "strava-token";

vi.mock("./auth.js", () => ({
  auth: {
    api: {
      getSession: async () => session,
      getAccessToken: async () => ({ accessToken }),
    },
    handler: async () => new Response(null, { status: 404 }),
  },
}));

/** The transcript the route thinks is in Postgres. */
let stored: UIMessage[] = [];
let title: string | null = null;

vi.mock("./chat-store.js", async (importOriginal) => {
  // titleFrom is pure and is covered in coach.test.ts; only the I/O is faked.
  const actual = await importOriginal<typeof import("./chat-store.js")>();
  return {
    ...actual,
    getThread: async (userId: string, id: string) =>
      userId === USER_ID && id === THREAD_ID
        ? {
            id: THREAD_ID,
            title,
            created_at: "2026-08-12T00:00:00Z",
            updated_at: "2026-08-12T00:00:00Z",
          }
        : null,
    getMessages: async () => stored,
    saveMessage: async (_threadId: string, message: UIMessage) => {
      const at = stored.findIndex((m) => m.id === message.id);
      if (at === -1) stored.push(message);
      else stored[at] = message;
    },
    // Mirrors the SQL in truncateForRegenerate: an assistant anchor goes too, a
    // user anchor stays.
    truncateForRegenerate: async (_threadId: string, messageId: string) => {
      const at = stored.findIndex((m) => m.id === messageId);
      if (at === -1) return;
      stored = stored.slice(0, stored[at].role === "assistant" ? at : at + 1);
    },
    setTitleIfUnset: async (_threadId: string, next: string) => {
      title ??= next;
    },
  };
});

/** A model that says one thing, in as many chunks as it is given, and stops. */
function mockModel(text: string[]) {
  const chunks: LanguageModelV4StreamPart[] = [
    { type: "stream-start", warnings: [] },
    {
      type: "response-metadata",
      id: "id-0",
      modelId: "mock",
      timestamp: new Date(0),
    },
    { type: "text-start", id: "1" },
    ...text.map((delta) => ({ type: "text-delta" as const, id: "1", delta })),
    { type: "text-end", id: "1" },
    {
      type: "finish",
      finishReason: { unified: "stop", raw: "stop" },
      usage: {
        inputTokens: { total: 3, noCache: 3, cacheRead: 0, cacheWrite: 0 },
        outputTokens: { total: 5, text: 5, reasoning: 0 },
      },
    },
  ];

  return new MockLanguageModelV4({
    doStream: async () => ({ stream: simulateReadableStream({ chunks }) }),
  });
}

let config: { model: MockLanguageModelV4; modelId: string } | null = null;

vi.mock("./coach.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./coach.js")>();
  return { ...actual, getCoachConfig: () => config };
});

const { app } = await import("./app.js");

/** What the browser's `prepareSendMessagesRequest` puts on the wire. */
function chat(body: Record<string, unknown>) {
  return app.request("/api/coach/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/coach/chat", () => {
  beforeEach(() => {
    session = { user: { id: USER_ID } };
    accessToken = "strava-token";
    stored = [];
    title = null;
    config = {
      model: mockModel(["Build volume ", "before speed."]),
      modelId: "mock",
    };
  });

  it("streams the reply and persists both sides of the turn", async () => {
    const res = await chat({
      thread_id: THREAD_ID,
      trigger: "submit-message",
      message: {
        id: "user-1",
        role: "user",
        parts: [{ type: "text", text: "Where do I start?" }],
      },
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");

    const body = await res.text();
    expect(body).toContain('"delta":"Build volume "');
    expect(body).toContain('"delta":"before speed."');

    expect(stored.map((message) => message.role)).toEqual([
      "user",
      "assistant",
    ]);
    expect(JSON.stringify(stored[1].parts)).toContain(
      "Build volume before speed.",
    );
  });

  it("hands the answer's trace id to the browser, and stores it", async () => {
    // The athlete rates an answer after it has finished — often after a
    // reload — so the trace it was written under has to travel with the
    // message and be there when the transcript is read back. Without it a
    // thumbs-down is a number PostHog can't attach to anything.
    const res = await chat({
      thread_id: THREAD_ID,
      trigger: "submit-message",
      message: {
        id: "user-1",
        role: "user",
        parts: [{ type: "text", text: "Where do I start?" }],
      },
    });

    const body = await res.text();
    const streamed = /"trace_id":"([^"]+)"/.exec(body);
    expect(streamed?.[1]).toBeTruthy();

    const answer = stored[1];
    expect(answer.role).toBe("assistant");
    expect(answer.metadata).toEqual({ trace_id: streamed?.[1] });
  });

  it("names the thread after the first message, and only the first", async () => {
    await chat({
      thread_id: THREAD_ID,
      message: {
        id: "user-1",
        role: "user",
        parts: [{ type: "text", text: "Half marathon in October" }],
      },
    });
    expect(title).toBe("Half marathon in October");

    config = { model: mockModel(["Sure."]), modelId: "mock" };
    await chat({
      thread_id: THREAD_ID,
      message: {
        id: "user-2",
        role: "user",
        parts: [{ type: "text", text: "And a taper?" }],
      },
    });
    expect(title).toBe("Half marathon in October");
  });

  it("drops the answer being regenerated, and keeps the question", async () => {
    stored = [
      {
        id: "user-1",
        role: "user",
        parts: [{ type: "text", text: "Where do I start?" }],
      },
      {
        id: "msg-1",
        role: "assistant",
        parts: [{ type: "text", text: "Rest." }],
      },
    ];

    // The UI regenerates *an assistant message*, which is the id that travels.
    const res = await chat({
      thread_id: THREAD_ID,
      trigger: "regenerate-message",
      message_id: "msg-1",
    });
    await res.text(); // onEnd runs as the stream drains

    expect(stored).toHaveLength(2);
    expect(stored[0].id).toBe("user-1");
    expect(JSON.stringify(stored[1].parts)).toContain(
      "Build volume before speed.",
    );
    expect(JSON.stringify(stored)).not.toContain("Rest.");
  });

  it("replaces a rewritten question, and forgets what it produced", async () => {
    stored = [
      {
        id: "user-1",
        role: "user",
        parts: [{ type: "text", text: "Plan my week" }],
      },
      {
        id: "msg-1",
        role: "assistant",
        parts: [{ type: "text", text: "Four easy runs." }],
      },
    ];

    // The edit resends *the athlete's own message*, under the id it already
    // has — which is what tells the route this is a rewrite, not a new turn.
    const res = await chat({
      thread_id: THREAD_ID,
      trigger: "submit-message",
      message_id: "user-1",
      message: {
        id: "user-1",
        role: "user",
        parts: [{ type: "text", text: "What should I run on Sunday?" }],
      },
    });
    await res.text(); // onEnd runs as the stream drains

    // One question, still in its own place, in its new words — and one answer.
    expect(stored.map((message) => message.role)).toEqual([
      "user",
      "assistant",
    ]);
    expect(stored[0].id).toBe("user-1");
    expect(JSON.stringify(stored[0].parts)).toContain(
      "What should I run on Sunday?",
    );
    expect(JSON.stringify(stored)).not.toContain("Plan my week");
    expect(JSON.stringify(stored)).not.toContain("Four easy runs.");
  });

  it("rejects a turn with nothing to answer", async () => {
    const res = await chat({ thread_id: THREAD_ID, trigger: "submit-message" });
    expect(res.status).toBe(400);
    expect(stored).toEqual([]);
  });

  it("404s on someone else's conversation", async () => {
    const res = await chat({
      thread_id: "99999999-2222-3333-4444-555555555555",
      message: {
        id: "user-1",
        role: "user",
        parts: [{ type: "text", text: "Hi" }],
      },
    });
    expect(res.status).toBe(404);
  });

  it("503s with instructions when no model is configured", async () => {
    config = null;
    const res = await chat({
      thread_id: THREAD_ID,
      message: {
        id: "user-1",
        role: "user",
        parts: [{ type: "text", text: "Hi" }],
      },
    });
    expect(res.status).toBe(503);
    expect((await res.json()).error).toContain("GOOGLE_GENERATIVE_AI_API_KEY");
  });

  it("401s when the Strava token has gone", async () => {
    accessToken = undefined;
    const res = await chat({
      thread_id: THREAD_ID,
      message: {
        id: "user-1",
        role: "user",
        parts: [{ type: "text", text: "Hi" }],
      },
    });
    expect(res.status).toBe(401);
  });
});
