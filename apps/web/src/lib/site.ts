/**
 * Links out of the app, to the marketing site.
 *
 * `apps/landing` is a separate deployment and nothing in it is importable from
 * here — the two apps share a design language, not a module graph. So the slug
 * table below is a *copy* of `CONTENT_PAGE_ROUTES` in
 * `apps/landing/src/i18n/content-pages.ts`, for the same reason `button.tsx`
 * and `wordmark.tsx` are copied the other way. A slug renamed there has to be
 * renamed here, and `site.test.ts` is what says so out loud.
 *
 * Why the app needs these at all: an athlete who has just handed over their
 * whole training history is entitled to read the privacy policy without
 * signing out first, and Strava's API terms want the attribution visible.
 * Before this, the app had no footer and no route to any of it.
 */
import type { Locale } from "@/i18n/locales";

/**
 * `||`, not `??`. An unset Docker build arg is exported as `""`, which is not
 * nullish — `??` would let the empty string through and produce `/en/privacy`
 * as a relative link into the app, which is a 404 rather than a policy.
 */
const siteUrl = (
  import.meta.env.VITE_SITE_URL || "https://www.vivace.run"
).replace(/\/$/, "");

export const CONTENT_PAGES = [
  "about",
  "privacy",
  "terms",
  "stravaData",
  "contact",
] as const;

export type ContentPage = (typeof CONTENT_PAGES)[number];

/** Localised slugs — a French athlete reads `/fr/confidentialite`. */
const ROUTES: Record<Locale, Record<ContentPage, string>> = {
  en: {
    about: "about",
    privacy: "privacy",
    terms: "terms",
    stravaData: "strava-data",
    contact: "contact",
  },
  fr: {
    about: "a-propos",
    privacy: "confidentialite",
    terms: "conditions",
    stravaData: "donnees-strava",
    contact: "contact",
  },
};

/** An absolute URL, because these leave this origin. */
export function contentPageUrl(locale: Locale, page: ContentPage): string {
  return `${siteUrl}/${locale}/${ROUTES[locale][page]}`;
}

/** The marketing home, in the language the app is being read in. */
export function marketingHomeUrl(locale: Locale): string {
  return `${siteUrl}/${locale}`;
}
