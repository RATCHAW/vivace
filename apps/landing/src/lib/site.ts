/**
 * The landing page is a separate deployment from the app, so every call to
 * action has to leave for it. `NEXT_PUBLIC_APP_URL` is the app's origin —
 * `apps/web` on :5173 in dev.
 */
import type { Locale } from "@/i18n/config";

/**
 * `||`, not `??`, everywhere in this file. A Docker `ARG` that nobody passed is
 * still exported to the build as `""` — `apps/landing/Dockerfile` declares four
 * of them and docker-compose supplies two — and an empty string is not nullish,
 * so `??` would hand the fallback back and let `""` through.
 */
const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:5173").replace(
  /\/$/,
  "",
);

/**
 * Strava is the only way in — the app redirects straight to OAuth from here.
 *
 * The language travels on the URL. `apps/web` has its own copy of the
 * catalogue and its own detector, and `?lang=` is the first thing that
 * detector looks at, so somebody who read this page in French does not arrive
 * at an English sign-in screen. It is written to their localStorage there, so
 * this only has to be right once.
 */
export function signInUrl(locale: Locale): string {
  return `${appUrl}/login?lang=${locale}`;
}

/**
 * The canonical origin, for `hreflang` and Open Graph. Falls back to the
 * production host: an absolute URL is required in metadata, and a relative one
 * silently produces a useless `<link rel="alternate">`.
 */
export function resolveSiteUrl(value?: string): string {
  return (value || "https://www.vivace.run").replace(/\/$/, "");
}

export const siteUrl = resolveSiteUrl(process.env.NEXT_PUBLIC_SITE_URL);

/**
 * The coach waitlist has no backend yet, so the form posts a mail draft rather
 * than pretending to store the address. Point this at a real endpoint when
 * there is one.
 */
export const waitlistEmail =
  process.env.NEXT_PUBLIC_WAITLIST_EMAIL || "hello@vivace.run";
