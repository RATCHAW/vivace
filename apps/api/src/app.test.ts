import { beforeAll, describe, expect, it } from "vitest";

process.env.BETTER_AUTH_SECRET ??= "test-secret-not-for-production";
process.env.DATABASE_URL ??= "postgres://app:app@localhost:5433/app";

describe("api", () => {
  let app: (typeof import("./app.js"))["app"];

  beforeAll(async () => {
    ({ app } = await import("./app.js"));
    // Registered here because Hono freezes its router on the first request.
    // A plain Hono route, so the OpenAPI document is untouched.
    app.get("/__boom", () => {
      throw new Error("boom");
    });
  });

  it("responds to /health", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });

  it("rejects /api/me/strava without a session", async () => {
    const res = await app.request("/api/me/strava");
    expect(res.status).toBe(401);
  });

  it("stamps every response with a request id, echoing an inbound one", async () => {
    const generated = await app.request("/health");
    expect(generated.headers.get("x-request-id")).toMatch(/[0-9a-f-]{36}/);

    const echoed = await app.request("/health", {
      headers: { "x-request-id": "trace-me" },
    });
    expect(echoed.headers.get("x-request-id")).toBe("trace-me");
  });

  it("turns an unexpected failure into a 500 the client can read", async () => {
    const res = await app.request("/__boom");

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Internal server error" });
    // Still correlatable: the id on the error response finds the logged stack.
    expect(res.headers.get("x-request-id")).toMatch(/[0-9a-f-]{36}/);
  });

  it("accepts a batch of browser events without a session", async () => {
    const res = await app.request("/api/logs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        events: [
          {
            level: "info",
            event: "ui.render_clicked",
            context: { activityId: 1 },
          },
          { level: "error", event: "ui.crashed", message: "Boom" },
        ],
      }),
    });

    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ accepted: 2 });
  });

  it("rejects browser events with an unusable event name", async () => {
    const res = await app.request("/api/logs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      // Free-text names would blow up the cardinality of every dashboard.
      body: JSON.stringify({
        events: [{ level: "info", event: "Clicked Render!" }],
      }),
    });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid request" });
  });

  it("rejects the render endpoints without a session", async () => {
    for (const [method, path] of [
      ["GET", "/api/runs/123/render"],
      ["POST", "/api/runs/123/render"],
      ["GET", "/api/runs/123/render/progress"],
    ] as const) {
      const res = await app.request(path, { method });
      expect(res.status, `${method} ${path}`).toBe(401);
    }

    // The video options are an optional body, so a caller that sends one is
    // still turned away by the session check and not by the validator.
    const withOptions = await app.request("/api/runs/123/render", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ show_avatar: true }),
    });
    expect(withOptions.status).toBe(401);
  });

  it("rejects render options that aren't the options", async () => {
    const res = await app.request("/api/runs/123/render", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ show_avatar: "yes" }),
    });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid request" });
  });

  it("rejects the invite endpoints that act on somebody's behalf", async () => {
    // Everything that mints, answers or withdraws an invitation is a signed-in
    // action — the preview below is the one deliberate exception.
    const token = "a".repeat(43);
    for (const [method, path] of [
      ["POST", "/api/runs/123/invite"],
      ["GET", "/api/runs/123/invites"],
      ["GET", `/api/invites/${token}/candidates`],
      ["POST", `/api/invites/${token}/decline`],
      ["DELETE", `/api/invites/${token}`],
    ] as const) {
      const res = await app.request(path, { method });
      expect(res.status, `${method} ${path}`).toBe(401);
    }

    // Accept validates its body first, so it needs one to reach the session
    // check at all.
    const accept = await app.request(`/api/invites/${token}/accept`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ activity_id: 1, consent_text: "I agree." }),
    });
    expect(accept.status).toBe(401);
  });

  it("refuses an acceptance with no record of what was agreed to", async () => {
    // `consent_text` is what the row stores as evidence, so an acceptance
    // without one is rejected by the validator rather than written empty.
    const res = await app.request(`/api/invites/${"a".repeat(43)}/accept`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ activity_id: 1, consent_text: "" }),
    });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid request" });
  });

  it("previews an invitation without a session, refusing a malformed token", async () => {
    // Two things at once, and the second is why the first is testable here.
    //
    // The preview is deliberately unauthenticated — the whole point of the link
    // is that it reaches somebody who has no account yet — so reaching the
    // *validator* is the proof: a 400 can only come from a request that got
    // past every gate in front of it, and a 401 would mean this endpoint had
    // grown one. The token's shape is that gate: too short, or not base64url,
    // and it never becomes a database lookup.
    //
    // A well-formed unknown token is not asserted here on purpose. It reaches
    // `getInvite`, and this suite has no database behind it.
    for (const token of [
      "short",
      "has spaces here and is long enough",
      "a/b",
    ]) {
      const res = await app.request(
        `/api/invites/${encodeURIComponent(token)}`,
      );
      expect(res.status, token).toBe(400);
    }
  });

  it("rejects the coach endpoints without a session", async () => {
    for (const [method, path] of [
      ["GET", "/api/coach/threads"],
      ["POST", "/api/coach/threads"],
      ["GET", "/api/coach/threads/abc"],
      ["DELETE", "/api/coach/threads/abc"],
    ] as const) {
      const res = await app.request(path, { method });
      expect(res.status, `${method} ${path}`).toBe(401);
    }

    // The chat route validates its body first, so it needs one to reach the
    // session check at all.
    const chat = await app.request("/api/coach/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ thread_id: "abc" }),
    });
    expect(chat.status).toBe(401);
  });
});
