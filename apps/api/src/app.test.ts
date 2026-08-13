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
          { level: "info", event: "ui.render_clicked", context: { activityId: 1 } },
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
      body: JSON.stringify({ events: [{ level: "info", event: "Clicked Render!" }] }),
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
