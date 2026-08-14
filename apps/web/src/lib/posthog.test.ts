import { afterEach, describe, expect, it, vi } from "vitest";
import { client } from "@/api";
import { flushClientLogs, trackError, trackEvent } from "@/lib/logger";
import * as analytics from "@/lib/posthog";

/**
 * The fan-out, not PostHog itself: one `trackEvent` has to reach both the
 * server logs and PostHog, and `ui.page_view` has to reach only the first
 * (PostHog captures `$pageview` for itself, and two copies double every
 * number on the web-analytics dashboards).
 */
function mockTransports() {
  const fetchMock = vi.fn(
    async (_request: Request) =>
      new Response(JSON.stringify({ accepted: 1 }), {
        status: 202,
        headers: { "Content-Type": "application/json" },
      }),
  );
  client.setConfig({
    baseUrl: "http://api.test",
    fetch: fetchMock as unknown as typeof fetch,
  });
  return {
    fetchMock,
    capture: vi
      .spyOn(analytics, "capturePostHogEvent")
      .mockImplementation(() => {}),
    captureException: vi
      .spyOn(analytics, "capturePostHogException")
      .mockImplementation(() => {}),
  };
}

afterEach(() => {
  flushClientLogs();
  vi.restoreAllMocks();
});

describe("analytics fan-out", () => {
  it("sends a user action to PostHog and to the server logs", async () => {
    const { fetchMock, capture } = mockTransports();

    trackEvent("ui.render_clicked", { activityId: 7 });

    expect(capture).toHaveBeenCalledWith("ui.render_clicked", {
      activityId: 7,
    });

    flushClientLogs();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const body = (await fetchMock.mock.calls[0][0].json()) as {
      events: { event: string }[];
    };
    expect(body.events[0].event).toBe("ui.render_clicked");
  });

  it("leaves pageviews to PostHog's own $pageview", () => {
    const { capture } = mockTransports();

    trackEvent("ui.page_view", { path: "/runs" });

    expect(capture).not.toHaveBeenCalled();
  });

  it("reports an error to both, giving PostHog the Error itself", async () => {
    const { fetchMock, captureException } = mockTransports();
    const boom = new TypeError("nope");

    trackError("ui.render_crashed", boom, { activityId: 7 });

    // Not the truncated string the log line carries — PostHog groups on the
    // real stack.
    expect(captureException).toHaveBeenCalledWith(boom, {
      event: "ui.render_crashed",
      activityId: 7,
    });

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
  });

  it("wraps a non-Error thrower so PostHog still gets an Error", () => {
    const { captureException } = mockTransports();

    trackError("browser.unhandled_rejection", "just a string");

    const [reported] = captureException.mock.calls[0];
    expect(reported).toBeInstanceOf(Error);
    expect((reported as Error).message).toBe("just a string");
  });
});

describe("with a project key", () => {
  it("initialises posthog-js with the config the app ships", async () => {
    vi.stubEnv("VITE_POSTHOG_KEY", "phc_test");
    vi.resetModules();

    const posthogJs = (await import("posthog-js")).default;
    const init = vi
      .spyOn(posthogJs, "init")
      .mockImplementation(() => posthogJs);
    const { initPostHog } = await import("@/lib/posthog");

    initPostHog();

    expect(init).toHaveBeenCalledWith(
      "phc_test",
      expect.objectContaining({
        // React Router navigates with the history API — without this, every
        // screen after the first would be missing from web analytics.
        capture_pageview: "history_change",
        // Anonymous visitors shouldn't each create a person.
        person_profiles: "identified_only",
        session_recording: { maskAllInputs: true },
      }),
    );

    vi.unstubAllEnvs();
    vi.resetModules();
  });
});

describe("without a project key", () => {
  it("does nothing at all", () => {
    // No VITE_POSTHOG_KEY in the test env, so every entry point is inert and
    // posthog-js is never initialised.
    expect(analytics.posthogEnabled).toBe(false);
    expect(() => {
      analytics.initPostHog();
      analytics.identifyAthlete("athlete-1", "Marianne");
      analytics.capturePostHogEvent("ui.render_clicked");
      analytics.capturePostHogException(new Error("boom"));
      analytics.resetPostHog();
    }).not.toThrow();
    // No replay to point an LLM trace at, so the coach request sends no header.
    expect(analytics.replaySessionId()).toBeUndefined();
  });
});
