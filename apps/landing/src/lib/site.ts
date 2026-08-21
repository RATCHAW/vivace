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
const appUrl = (
  process.env.NEXT_PUBLIC_APP_URL || "http://localhost:5173"
).replace(/\/$/, "");

/**
 * Strava is the only way in — the app redirects straight to OAuth from here.
 *
 * The language and sign-in intent travel on the URL. `apps/web` has its own
 * copy of the catalogue and its own detector, and `?lang=` is the first thing
 * that detector looks at, so somebody who read this page in French does not
 * arrive at an English sign-in screen. `provider=strava` tells that screen to
 * continue straight to OAuth instead of asking for the same click again.
 */
export function signInUrl(locale: Locale, next?: string): string {
  const base = `${appUrl}/login?lang=${locale}&provider=strava`;
  return next ? `${base}&next=${encodeURIComponent(next)}` : base;
}

/**
 * Take athletes straight to the live coach.
 *
 * Through sign-in, not around it. This used to point at `/coach` directly,
 * which for the signed-out visitor this button is written for meant the app's
 * route guard bounced them to `/login` and then dropped them on the Overview —
 * the one surface that, until recently, never mentioned the coach at all. The
 * app reads `next` on the way back out of OAuth; see `next-path.ts` over there,
 * which is also what refuses anything that isn't a path on its own origin.
 */
export function coachUrl(locale: Locale): string {
  return signInUrl(locale, "/coach");
}

/**
 * The canonical origin, for `hreflang` and Open Graph. Falls back to the
 * production host: an absolute URL is required in metadata, and a relative one
 * silently produces a useless `<link rel="alternate">`.
 */
export function resolveSiteUrl(value?: string): string {
  return (value || "https://www.vivace.run").replace(/\/$/, "");
}

/**
 * Where else Vivace is, in schema.org's sense of `sameAs`: the same entity,
 * under our control, somewhere else.
 *
 * This is the one lever a codebase has on brand-name search. "Vivace" on its
 * own competes with the tempo marking, and an entity a search engine can only
 * see at one URL is an entity it has no reason to connect to a name. Every
 * profile here is `vivace.run`, deliberately — a handle that differs from the
 * domain is a link, not a claim of identity.
 *
 * Only profiles we actually run belong here. A `sameAs` pointing at a dead
 * handle is worse than no `sameAs` at all.
 */
export const SOCIAL_PROFILES = [
  "https://www.tiktok.com/@vivace.run",
  "https://www.instagram.com/vivace.run",
] as const;

export const siteUrl = resolveSiteUrl(process.env.NEXT_PUBLIC_SITE_URL);
