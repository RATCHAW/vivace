import { beforeAll, describe, expect, it } from "vitest";

process.env.BETTER_AUTH_SECRET ??= "test-secret-not-for-production";
process.env.DATABASE_URL ??= "postgres://app:app@localhost:5433/app";

describe("api", () => {
  let app: (typeof import("./app.js"))["app"];

  beforeAll(async () => {
    ({ app } = await import("./app.js"));
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
});
