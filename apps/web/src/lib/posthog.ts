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

/** US cloud unless the project lives in the EU or on a self-hosted instance. */
const host = import.meta.env.VITE_POSTHOG_HOST || "https://us.i.posthog.com";

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
    // asking a new question never needs a deploy.
    disable_surveys: false,
  });
}

/**
 * Ties everything since the last `reset()` to this athlete, so a session that
 * started signed-out (the landing page, the sign-in screen) joins up with the
 * one that follows it.
 */
export function identifyAthlete(id: string, name: string | null): void {
  if (!posthogEnabled) return;
  posthog.identify(id, name ? { name } : undefined);
}

/** Sign-out: the next athlete on this browser must not inherit the last one. */
export function resetPostHog(): void {
  if (!posthogEnabled) return;
  posthog.reset();
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
