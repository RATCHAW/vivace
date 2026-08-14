"use client";

// The only analytics on the landing page, and the second of the two client
// components here (see replay-phone.tsx) — everything else stays a Server
// Component, so the page still prerenders to static HTML.
//
// This is deliberately just the initialiser. Autocapture records the clicks on
// the "Connect Strava" buttons, hrefs included, so tracking the conversion
// costs nothing at each of the six call sites — and none of them has to become
// a client component to get an onClick.
import { useEffect } from "react";

// NEXT_PUBLIC_* is inlined at build time, so this is a Docker build arg, not a
// runtime variable — same as NEXT_PUBLIC_APP_URL in lib/site.ts.
const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const host = process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com";

export function Analytics() {
  useEffect(() => {
    if (!key) return;

    let cancelled = false;

    void import("posthog-js").then(({ default: posthog }) => {
      if (cancelled) return;

      posthog.init(key, {
        api_host: host,
        // Visitors here are anonymous by definition — they become a person
        // when they reach the app and sign in, and PostHog stitches the two.
        person_profiles: "identified_only",
        capture_pageview: "history_change",
        capture_pageleave: true,
        // The waitlist email is the only input on the page, and masking is on
        // by default — a replay shows the scroll, not the address.
        session_recording: { maskAllInputs: true },
      });
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
