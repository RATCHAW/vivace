// PostHog in the browser: product + web analytics, session replay, error
// tracking, surveys and feature flags.
//
// Nothing outside this module imports posthog-js. Two reasons: every call has
// to be guarded (an un-inited client logs an error for each one, and a fresh
// clone has no key), and user actions belong in `@/lib/logger`, which fans them
// out to PostHog *and* the server logs. Reach for `trackEvent` there first —
// the exports here are for the things only PostHog does.
import { useEffect, useState } from "react";
import posthog from "posthog-js";

const key = import.meta.env.VITE_POSTHOG_KEY;

/**
 * Where events are sent.
 *
 * US cloud unless the project lives in the EU or on a self-hosted instance —
 * or unless this deploy sends them through a reverse proxy on our own domain,
 * which is what production does (`cadence.vivace.run`). An ad blocker's list is
 * a list of *hosts*, so a request to `us.i.posthog.com` is dropped in the
 * browser before it is made, taking the athlete, their session replay and their
 * feature flags with it. See the README.
 */
const host = import.meta.env.VITE_POSTHOG_HOST || "https://us.i.posthog.com";

/**
 * Where PostHog itself lives, which is not the same question once `host` is a
 * proxy.
 *
 * The SDK builds links to the app out of this — "view recording", and the
 * toolbar's own authentication handshake, which asks the *project* for
 * permission and cannot get it from a host that only forwards ingestion. Both
 * silently point at the proxy when it is left unset.
 *
 * Its value with no proxy in front is exactly what the SDK would derive from
 * `host` anyway, so it is safe to pass unconditionally.
 */
const uiHost = import.meta.env.VITE_POSTHOG_UI_HOST || "https://us.posthog.com";

/**
 * Which deploy these events came from — `production`, `staging`, or the
 * `development` a laptop reports.
 *
 * A PostHog project is one silo of data, so `pnpm dev` against a real key puts
 * the athlete you are testing with in the same Persons list as the people
 * actually using the app. Nothing in an event says where it came from unless we
 * put it there; this is that property, and it is what a `environment =
 * production` filter on the Persons list and the project's "Filter out internal
 * and test users" setting both read.
 *
 * `VITE_APP_ENV` overrides it, because a staging deploy is a production *build*
 * — Vite's own mode can't tell the two apart, and the API makes the same
 * distinction with `APP_ENV`.
 *
 * A separate PostHog project for development is stronger than a property: the
 * data never arrives at all. This doesn't replace that — it is what keeps the
 * project honest without one. See the README.
 */
const environment =
  import.meta.env.VITE_APP_ENV ||
  // `MODE` is Vite's own build mode, not a value read from the environment, so
  // turbo's `env` list has nothing to say about it — `vite build --mode` is
  // what sets it, and that is part of the command, not of the cache key.
  // eslint-disable-next-line turbo/no-undeclared-env-vars
  import.meta.env.MODE;

/** False on a fresh clone, in tests, and in any deploy without a key. */
export const posthogEnabled = Boolean(key);

/**
 * Called once from main.tsx, before the first render.
 *
 * Autocapture, `$pageview` and session replay all start here — React Router
 * navigates with the history API, which `capture_pageview: "history_change"`
 * follows, so screens are counted without a hook in every page.
 */
export function initPostHog(): void {
  if (!posthogEnabled) return;

  posthog.init(key, {
    api_host: host,
    ui_host: uiHost,
    // Only build a person profile once someone signs in. Anonymous events
    // still power web analytics; they just don't each create a person.
    person_profiles: "identified_only",
    capture_pageview: "history_change",
    capture_pageleave: true,
    session_recording: {
      // Inputs are masked by default; this app's are search and the coach
      // composer. Anything genuinely private carries `ph-no-capture`, which
      // blocks it in replays and in autocapture alike — see AppHeader.
      maskAllInputs: true,
    },
    // Surveys are authored in PostHog and targeted at the events below, so
    // asking a new question never needs a deploy. It is also what loads the
    // survey machinery the coach's thumbs read their question ids from — with
    // this off, `getSurveys` never answers.
    disable_surveys: false,
  });

  // A super property: every event from this browser carries it, including the
  // anonymous `$pageview`s and autocaptures that happen before anyone signs in.
  posthog.register({ environment });
}

/**
 * Ties everything since the last `reset()` to this athlete, so a session that
 * started signed-out (the landing page, the sign-in screen) joins up with the
 * one that follows it.
 */
export function identifyAthlete(id: string, name: string | null): void {
  if (!posthogEnabled) return;
  // On the *person*, not just the events: the Persons list filters on person
  // properties, and "show me production's athletes" is the question it is
  // asked. Set rather than set-once, so someone who is both a real athlete and
  // the one testing locally isn't stuck as `development`.
  posthog.identify(id, { ...(name ? { name } : {}), environment });
}

/** Sign-out: the next athlete on this browser must not inherit the last one. */
export function resetPostHog(): void {
  if (!posthogEnabled) return;
  posthog.reset();
}

/**
 * The id of the replay being recorded right now, if one is.
 *
 * The coach's answers are written on the server, so the trace PostHog draws for
 * a turn knows nothing about the athlete who is waiting for it. Sending this
 * along with the question is what links the two: `$session_id` on an `$ai_*`
 * event is a link to the replay from the trace.
 *
 * PostHog can do this by patching every `fetch` in the page (`tracing_headers`),
 * which is a lot of machinery for the one request that needs it.
 */
export function replaySessionId(): string | undefined {
  if (!posthogEnabled) return undefined;
  return posthog.get_session_id() || undefined;
}

/**
 * The survey a coach answer's thumbs up/down answers.
 *
 * A survey id rather than a plain event, because that is what PostHog reads
 * back: a `survey sent` carrying `$ai_trace_id` shows up on the trace's own
 * Feedback tab *and* in Surveys, where response rates and follow-ups are
 * already built. The survey is authored in PostHog with presentation **API** —
 * a first question on a 1–2 rating scale, then an open one — which is the
 * presentation that records responses and draws nothing. The thumbs and the
 * note are this app's own, in this app's type and both its languages.
 *
 * Unset is the ordinary state: no id, no thumbs. See the README.
 */
const coachSurveyId = import.meta.env.VITE_POSTHOG_COACH_SURVEY_ID;

/** Whether to draw the thumbs at all. False on a fresh clone and in tests. */
export const coachFeedbackEnabled = posthogEnabled && Boolean(coachSurveyId);

/** What both survey events carry, and what ties them to the answer. */
function feedbackProperties(traceId: string) {
  return {
    $survey_id: coachSurveyId,
    $ai_trace_id: traceId,
    // Lets a thumbs-down be watched rather than guessed at.
    sessionRecordingUrl: posthog.get_session_replay_url?.(),
  };
}

/**
 * What this browser has already said about an answer.
 *
 * On disk rather than in memory because an answer is rated once, not once per
 * mount: a thread's messages are rebuilt every time the athlete switches tab,
 * asks something else or reloads, and each of those would otherwise offer the
 * same answer to be rated again and count another impression against it.
 * PostHog's own guidance for a hand-rolled survey is exactly this.
 *
 * It is per browser, so the same athlete on their phone could rate an answer
 * their laptop already did. Fixing that means storing the rating on the message
 * server-side, which is a schema and an endpoint for a number PostHog is
 * already holding.
 */
const FEEDBACK_KEY = "vivace.coach-feedback";

interface FeedbackRecord {
  shown?: true;
  rating?: "up" | "down";
}

function readFeedback(): Record<string, FeedbackRecord> {
  try {
    const stored: unknown = JSON.parse(
      localStorage.getItem(FEEDBACK_KEY) ?? "{}",
    );
    return typeof stored === "object" && stored !== null
      ? (stored as Record<string, FeedbackRecord>)
      : {};
  } catch {
    // Unreadable or unavailable storage (Safari's private mode throws on the
    // first read). Nothing here is worth a broken thumb: the worst case is
    // that an answer can be rated twice.
    return {};
  }
}

function writeFeedback(all: Record<string, FeedbackRecord>): void {
  const entries = Object.entries(all);
  try {
    localStorage.setItem(
      FEEDBACK_KEY,
      // The newest few hundred answers is far more than a conversation needs,
      // and stops a long-lived browser growing a key without end.
      JSON.stringify(Object.fromEntries(entries.slice(-200))),
    );
  } catch {
    // A full or unavailable quota. The rating itself already reached PostHog —
    // this only remembers that it did.
  }
}

/** How the athlete rated this answer before, if they have. */
export function coachAnswerRating(traceId: string): "up" | "down" | null {
  return readFeedback()[traceId]?.rating ?? null;
}

/**
 * The athlete saw the thumbs on an answer.
 *
 * Impressions are what turn "eleven thumbs-down" into a rate — without them
 * PostHog can only count the athletes who felt strongly enough to click. One
 * per answer, ever: an answer offered twice was still only one answer.
 */
export function trackCoachFeedbackShown(traceId: string): void {
  if (!coachFeedbackEnabled) return;

  const all = readFeedback();
  if (all[traceId]?.shown) return;
  writeFeedback({ ...all, [traceId]: { ...all[traceId], shown: true } });

  posthog.capture("survey shown", feedbackProperties(traceId));
}

/**
 * The survey's own question ids, once PostHog has told us what they are.
 *
 * A response is filed under the id of the question it answers, so that
 * reordering the survey's questions in PostHog can't silently start filing
 * ratings as free text. The ids are read from the survey PostHog has already
 * fetched for this page, rather than configured — one env var is enough.
 */
let questionIds: (string | undefined)[] | null = null;

function withQuestionIds(send: (ids: (string | undefined)[]) => void): void {
  if (questionIds) {
    send(questionIds);
    return;
  }
  posthog.getSurveys((surveys) => {
    const survey = surveys.find((one) => one.id === coachSurveyId);
    questionIds = survey?.questions.map((question) => question.id) ?? [];
    send(questionIds);
  });
}

/**
 * Where one question's answer goes.
 *
 * By id when the survey has them, by position when it doesn't — PostHog still
 * reads the older positional form, and a rating recorded positionally is worth
 * more than one dropped for want of an id.
 */
function responseKey(index: number, ids: (string | undefined)[]): string {
  const id = ids[index];
  if (id) return `$survey_response_${id}`;
  return index === 0 ? "$survey_response" : `$survey_response_${index}`;
}

/**
 * The athlete rated an answer. Returns the id that ties this rating to the
 * note that may follow it, or null when feedback is switched off.
 *
 * Written as survey events by hand rather than through `displaySurvey`, which
 * would render PostHog's own pop-up over the conversation: their widget knows
 * nothing about this app's type scale, its two languages or the fact that it is
 * sitting inside a chat transcript. The events are identical either way — this
 * is a question about who draws the box, not about what PostHog receives.
 *
 * `1` is up and `2` is down: the two points of the survey's rating scale.
 * A thumbs up completes the response on its own; a thumbs down leaves it open
 * for the note, so a partial answer is still recorded if nothing else comes.
 */
export function rateCoachAnswer(
  traceId: string,
  rating: "up" | "down",
): string | null {
  if (!coachFeedbackEnabled) return null;

  // One answer, one rating — enforced here rather than in the component,
  // because the component is rebuilt every time the athlete leaves the thread
  // and comes back, and its memory of the click goes with it.
  const all = readFeedback();
  if (all[traceId]?.rating) return null;
  writeFeedback({ ...all, [traceId]: { ...all[traceId], rating } });

  const submissionId = crypto.randomUUID();
  withQuestionIds((ids) => {
    posthog.capture("survey sent", {
      ...feedbackProperties(traceId),
      [responseKey(0, ids)]: rating === "up" ? 1 : 2,
      $survey_submission_id: submissionId,
      $survey_completed: rating === "up",
    });
  });
  return submissionId;
}

/**
 * What was wrong with it — the second half of a thumbs down.
 *
 * Same submission id as the rating it belongs to, which is what PostHog joins
 * the two events on to show them as one response.
 */
export function noteCoachAnswer(
  traceId: string,
  submissionId: string,
  note: string,
): void {
  if (!coachFeedbackEnabled) return;

  withQuestionIds((ids) => {
    posthog.capture("survey sent", {
      ...feedbackProperties(traceId),
      [responseKey(1, ids)]: note,
      $survey_submission_id: submissionId,
      $survey_completed: true,
    });
  });
}

/** Prefer `trackEvent` in `@/lib/logger`, which also reaches the server logs. */
export function capturePostHogEvent(
  event: string,
  properties?: Record<string, unknown>,
): void {
  if (!posthogEnabled) return;
  posthog.capture(event, properties);
}

/** Prefer `trackError` in `@/lib/logger`. Feeds PostHog Error Tracking. */
export function capturePostHogException(
  error: unknown,
  properties?: Record<string, unknown>,
): void {
  if (!posthogEnabled) return;
  posthog.captureException(error, properties);
}

/**
 * A feature flag, evaluated for the signed-in athlete.
 *
 * `fallback` is the answer while flags are still loading, when the flag does
 * not exist, and when PostHog is switched off entirely — so it must always be
 * the behaviour the app shipped with. Written by hand rather than with
 * `useFeatureFlagEnabled` so that no PostHog call happens without a key.
 */
export function useFeatureFlag(flag: string, fallback: boolean): boolean {
  const [enabled, setEnabled] = useState(fallback);

  useEffect(() => {
    if (!posthogEnabled) return;
    // Fires once flags have loaded, and again whenever they are re-evaluated.
    return posthog.onFeatureFlags(() => {
      setEnabled(posthog.isFeatureEnabled(flag) ?? fallback);
    });
  }, [flag, fallback]);

  return enabled;
}
