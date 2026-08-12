/**
 * The landing page is a separate deployment from the app, so every call to
 * action has to leave for it. `NEXT_PUBLIC_APP_URL` is the app's origin —
 * `apps/web` on :5173 in dev.
 */
const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:5173";

/** Strava is the only way in — the app redirects straight to OAuth from here. */
export const signInUrl = `${appUrl.replace(/\/$/, "")}/login`;

/**
 * The coach waitlist has no backend yet, so the form posts a mail draft rather
 * than pretending to store the address. Point this at a real endpoint when
 * there is one.
 */
export const waitlistEmail =
  process.env.NEXT_PUBLIC_WAITLIST_EMAIL ?? "hello@vivace.run";
