import { describe, expect, it } from "vitest";

process.env.BETTER_AUTH_SECRET ??= "test-secret-not-for-production";
process.env.DATABASE_URL ??= "postgres://app:app@localhost:5433/app";

/**
 * A fresh clone has no POSTHOG_KEY, and neither does CI. Nothing here may
 * throw, block, or open a socket in that state — the whole integration has to
 * be invisible when it is switched off.
 */
describe("posthog, unconfigured", () => {
  it("is inert", async () => {
    const posthog = await import("./posthog.js");

    expect(posthog.posthogEnabled).toBe(false);

    expect(() => {
      posthog.captureUserEvent({
        distinctId: "athlete-1",
        event: "render.started",
        properties: { activityId: 1 },
      });
      posthog.captureServerException(new Error("boom"), "athlete-1");
      posthog.captureServerException(new Error("boom"), undefined);
    }).not.toThrow();

    await expect(posthog.shutdownPostHog()).resolves.toBeUndefined();
  });

  it("hands back the flag's fallback, so behaviour is unchanged", async () => {
    const { isFeatureEnabledFor } = await import("./posthog.js");

    // Both directions: an unreachable PostHog must never decide a feature.
    await expect(isFeatureEnabledFor("video-render", "athlete-1", true)).resolves.toBe(
      true,
    );
    await expect(isFeatureEnabledFor("video-render", "athlete-1", false)).resolves.toBe(
      false,
    );
  });

  it("drops LLM generations on the floor", async () => {
    const { captureCoachGeneration } = await import("./posthog.js");

    expect(() =>
      captureCoachGeneration({
        distinctId: "athlete-1",
        modelId: "gemini-2.5-flash",
        latencySeconds: 1.2,
        inputTokens: 100,
        outputTokens: 50,
        input: [{ role: "user" }],
        output: "…",
      }),
    ).not.toThrow();
  });
});
