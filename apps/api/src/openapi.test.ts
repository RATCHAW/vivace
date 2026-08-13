import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

process.env.BETTER_AUTH_SECRET ??= "test-secret-not-for-production";
process.env.DATABASE_URL ??= "postgres://app:app@localhost:5433/app";

describe("openapi", () => {
  let app: (typeof import("./app.js"))["app"];
  let openAPIConfig: (typeof import("./app.js"))["openAPIConfig"];

  beforeAll(async () => {
    ({ app, openAPIConfig } = await import("./app.js"));
  });

  it("serves the document", async () => {
    const res = await app.request("/api/openapi.json");
    expect(res.status).toBe(200);

    const document = await res.json();
    expect(document.openapi).toBe("3.1.0");
    expect(Object.keys(document.paths)).toEqual([
      "/health",
      "/api/me/strava",
      "/api/me/runs",
      "/api/runs/{id}/streams",
      "/api/runs/{id}/render",
      "/api/runs/{id}/render/progress",
      "/api/coach/threads",
      "/api/coach/threads/{id}",
      "/api/coach/briefing",
      "/api/coach/context",
      "/api/coach/plan",
      "/api/coach/chat",
      "/api/strava/webhook",
      "/api/logs",
    ]);
    expect(document.components.schemas).toHaveProperty("Athlete");
    expect(document.paths["/api/me/strava"].get.operationId).toBe(
      "getStravaAthlete",
    );
  });

  it("serves Swagger UI", async () => {
    const res = await app.request("/api/docs");
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("/api/openapi.json");
  });

  // apps/web generates its client from the committed file, so a stale one means
  // the browser is typed against an API that no longer exists.
  it("matches the committed apps/api/openapi.json", async () => {
    const committed = await readFile(
      fileURLToPath(new URL("../openapi.json", import.meta.url)),
      "utf8",
    );

    expect(JSON.parse(committed)).toEqual(
      app.getOpenAPI31Document(openAPIConfig),
    );
  });
});
