import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

    trackEvent("ui.page_view", { path: "/replays" });

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

  /**
   * The one thing that tells a laptop's test athletes apart from the people
   * actually using the app — they share a PostHog project, and nothing else in
   * an event says which deploy it came from.
   */
  it("stamps the environment on every event and on the athlete", async () => {
    vi.stubEnv("VITE_POSTHOG_KEY", "phc_test");
    vi.stubEnv("VITE_APP_ENV", "staging");
    vi.resetModules();

    const posthogJs = (await import("posthog-js")).default;
    vi.spyOn(posthogJs, "init").mockImplementation(() => posthogJs);
    const register = vi
      .spyOn(posthogJs, "register")
      .mockImplementation(() => undefined);
    const identify = vi
      .spyOn(posthogJs, "identify")
      .mockImplementation(() => undefined);
    const { initPostHog, identifyAthlete } = await import("@/lib/posthog");

    initPostHog();
    identifyAthlete("athlete-1", "Ayoub");

    // A super property, so the anonymous pageviews before anyone signs in
    // carry it too.
    expect(register).toHaveBeenCalledWith({ environment: "staging" });
    // And on the person, which is what the Persons list filters on.
    expect(identify).toHaveBeenCalledWith("athlete-1", {
      name: "Ayoub",
      environment: "staging",
    });

    vi.unstubAllEnvs();
    vi.resetModules();
  });
});

describe("coach feedback", () => {
  /**
   * A storage the test owns.
   *
   * Node ships its own half-implemented `localStorage` global, which wins over
   * jsdom's here — so what a browser would do has to be stated rather than
   * assumed.
   */
  function memoryStorage(): Storage {
    const data = new Map<string, string>();
    return {
      getItem: (key) => data.get(key) ?? null,
      setItem: (key, value) => void data.set(key, value),
      removeItem: (key) => void data.delete(key),
      clear: () => data.clear(),
      key: (index) => [...data.keys()][index] ?? null,
      get length() {
        return data.size;
      },
    };
  }

  /** The two env vars the thumbs need, and a posthog-js that records calls. */
  async function withSurvey() {
    vi.stubEnv("VITE_POSTHOG_KEY", "phc_test");
    vi.stubEnv("VITE_POSTHOG_COACH_SURVEY_ID", "survey-1");
    vi.resetModules();

    const posthogJs = (await import("posthog-js")).default;
    const capture = vi
      .spyOn(posthogJs, "capture")
      .mockImplementation(() => undefined as never);
    // The survey PostHog has already fetched for the page, which is where the
    // question ids a response is filed under come from.
    vi.spyOn(posthogJs, "getSurveys").mockImplementation((callback) => {
      callback([
        {
          id: "survey-1",
          questions: [{ id: "q-rating" }, { id: "q-note" }],
        },
      ] as never);
    });

    return { ...(await import("@/lib/posthog")), capture };
  }

  const sent = (capture: { mock: { calls: unknown[][] } }) =>
    capture.mock.calls
      .filter(([event]) => event === "survey sent")
      .map(([, properties]) => properties as Record<string, unknown>);

  beforeEach(() => {
    // What was rated outlives the module now, so each test starts from the
    // browser a first-time athlete has.
    vi.stubGlobal("localStorage", memoryStorage());
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("files a rating under the survey's own question id", async () => {
    const { rateCoachAnswer, capture } = await withSurvey();

    rateCoachAnswer("trace-1", "down");

    expect(sent(capture)[0]).toMatchObject({
      $survey_id: "survey-1",
      // Without this the rating reaches PostHog attached to nothing.
      $ai_trace_id: "trace-1",
      // 1 is up and 2 is down — the two points of the rating scale.
      "$survey_response_q-rating": 2,
      // A thumbs down leaves the response open for the note that may follow.
      $survey_completed: false,
    });
  });

  it("completes a thumbs up on its own — there is nothing to ask", async () => {
    const { rateCoachAnswer, capture } = await withSurvey();

    rateCoachAnswer("trace-1", "up");

    expect(sent(capture)[0]).toMatchObject({
      "$survey_response_q-rating": 1,
      $survey_completed: true,
    });
  });

  it("joins the note to the rating it belongs to", async () => {
    const { rateCoachAnswer, noteCoachAnswer, capture } = await withSurvey();

    const submissionId = rateCoachAnswer("trace-1", "down");
    noteCoachAnswer("trace-1", submissionId!, "It invented a run I never did.");

    const [rating, note] = sent(capture);
    // One response in PostHog, not two — the submission id is the join.
    expect(note.$survey_submission_id).toBe(rating.$survey_submission_id);
    expect(note).toMatchObject({
      "$survey_response_q-note": "It invented a run I never did.",
      $survey_completed: true,
      $ai_trace_id: "trace-1",
    });
  });

  it("counts an answer as seen once, however often it is remounted", async () => {
    const { trackCoachFeedbackShown, capture } = await withSurvey();

    trackCoachFeedbackShown("trace-1");
    trackCoachFeedbackShown("trace-1");
    trackCoachFeedbackShown("trace-2");

    // Switching tab or asking again remounts the transcript; each remount
    // counted as an impression would only skew the response rate.
    const shown = capture.mock.calls.filter(
      ([event]) => event === "survey shown",
    );
    expect(shown).toHaveLength(2);
    expect(shown[0][1]).toMatchObject({ $ai_trace_id: "trace-1" });
  });

  it("takes one rating per answer, and remembers it across a reload", async () => {
    const first = await withSurvey();

    expect(first.rateCoachAnswer("trace-1", "up")).not.toBeNull();
    // The same answer, rated again in the same breath.
    expect(first.rateCoachAnswer("trace-1", "down")).toBeNull();
    expect(sent(first.capture)).toHaveLength(1);

    // A reload: new module, new component, same browser. The thumb comes back
    // pressed instead of the question being asked again.
    const reloaded = await withSurvey();
    expect(reloaded.coachAnswerRating("trace-1")).toBe("up");
    expect(reloaded.rateCoachAnswer("trace-1", "down")).toBeNull();
    expect(sent(reloaded.capture)).toHaveLength(0);
    // An answer nobody rated is still open to it.
    expect(reloaded.coachAnswerRating("trace-2")).toBeNull();
  });

  it("still rates when the browser has no storage to remember it with", async () => {
    const { rateCoachAnswer, capture } = await withSurvey();
    // Safari's private mode throws on the first read. The rating matters more
    // than the bookkeeping: the worst case is that it can be given twice.
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("no storage");
      },
      setItem: () => {
        throw new Error("no storage");
      },
    });

    expect(rateCoachAnswer("trace-9", "down")).not.toBeNull();
    expect(sent(capture)).toHaveLength(1);
  });

  it("draws no thumbs when no survey is configured", async () => {
    vi.stubEnv("VITE_POSTHOG_KEY", "phc_test");
    vi.stubEnv("VITE_POSTHOG_COACH_SURVEY_ID", "");
    vi.resetModules();
    const { coachFeedbackEnabled } = await import("@/lib/posthog");

    // A key alone isn't enough: a thumb that records nothing is worse than none.
    expect(coachFeedbackEnabled).toBe(false);
  });
});

describe("without a project key", () => {
  it("does nothing at all", async () => {
    // Stubbed empty rather than assumed empty: a developer with PostHog set up
    // locally has these in apps/web/.env, and Vite loads it in tests too — so
    // the suite would otherwise pass in CI and fail on their machine.
    vi.stubEnv("VITE_POSTHOG_KEY", "");
    vi.stubEnv("VITE_POSTHOG_COACH_SURVEY_ID", "");
    vi.resetModules();
    const inert = await import("@/lib/posthog");

    // Every entry point is a no-op and posthog-js is never initialised.
    expect(inert.posthogEnabled).toBe(false);
    expect(() => {
      inert.initPostHog();
      inert.identifyAthlete("athlete-1", "Marianne");
      inert.capturePostHogEvent("ui.render_clicked");
      inert.capturePostHogException(new Error("boom"));
      inert.resetPostHog();
      inert.trackCoachFeedbackShown("trace-1");
      inert.rateCoachAnswer("trace-1", "up");
      inert.noteCoachAnswer("trace-1", "submission-1", "…");
    }).not.toThrow();
    // No replay to point an LLM trace at, so the coach request sends no header.
    expect(inert.replaySessionId()).toBeUndefined();
    expect(inert.coachFeedbackEnabled).toBe(false);

    vi.unstubAllEnvs();
    vi.resetModules();
  });
});
