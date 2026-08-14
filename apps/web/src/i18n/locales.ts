/**
 * The languages Vivace speaks.
 *
 * Deliberately tiny and React-free: `apps/landing` holds its own copy of this
 * list (the two apps share a design language, not a module graph), and the two
 * have to agree — a locale added here is a locale the landing page must be able
 * to hand over in `?lang=`. Keep them in step.
 */
export const LOCALES = ["en", "fr"] as const;

export type Locale = (typeof LOCALES)[number];

/** What a browser with no opinion gets. */
export const DEFAULT_LOCALE: Locale = "en";

/** How a language names itself — never translated, always in its own tongue. */
export const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  fr: "Français",
};

/** The two-letter stamp on the switcher, where a full name will not fit. */
export const LOCALE_SHORT: Record<Locale, string> = {
  en: "EN",
  fr: "FR",
};

/**
 * The BCP 47 tag handed to `Intl`. Separate from the locale id because a date
 * wants a region and our message catalogue does not: `en-GB` and `en-US` are
 * one catalogue and two very different date formats.
 */
export const INTL_LOCALES: Record<Locale, string> = {
  en: "en-GB",
  fr: "fr-FR",
};

/**
 * Where the choice is kept. Read by i18next's detector, and written by it —
 * the landing page uses the same name so a language picked over there survives
 * the hop to the app on a shared host.
 */
export const LOCALE_STORAGE_KEY = "vivace_locale";

export function isLocale(value: unknown): value is Locale {
  return (
    typeof value === "string" && (LOCALES as readonly string[]).includes(value)
  );
}
