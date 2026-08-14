/**
 * The languages the landing page speaks.
 *
 * A deliberate copy of `apps/web/src/i18n/locales.ts`, for the same reason
 * `button.tsx` and `wordmark.tsx` are copies: the two apps share a design
 * language, not a module graph. The lists have to agree, because a CTA here
 * leaves for the app with `?lang=<locale>` on it and the app's detector reads
 * that first. Add a locale in one place and add it in the other.
 *
 * Everything here is React-free and framework-free so `middleware.ts` — which
 * runs on the edge runtime — can import it.
 */
export const LOCALES = ["en", "fr"] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

/** How a language names itself — never translated. */
export const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  fr: "Français",
};

/** The stamp on the switcher, where the full name will not fit. */
export const LOCALE_SHORT: Record<Locale, string> = {
  en: "EN",
  fr: "FR",
};

/**
 * Remembers the visitor's choice across visits, and is what the middleware
 * reads before it falls back to `Accept-Language`. Same name as the key
 * `apps/web` stores in localStorage, so the two are legible as one setting.
 */
export const LOCALE_COOKIE = "vivace_locale";

/** A year: this is a preference, not a session. */
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function isLocale(value: unknown): value is Locale {
  return (
    typeof value === "string" && (LOCALES as readonly string[]).includes(value)
  );
}

/**
 * Which language to serve `/`, given what the visitor brought with them.
 *
 * An explicit choice beats the browser's list, and the browser's list beats the
 * default. Pure, and exported on its own, so the negotiation is unit-testable
 * without standing up a request.
 */
export function negotiateLocale(
  cookie: string | undefined,
  acceptLanguage: string | null | undefined,
): Locale {
  if (isLocale(cookie)) return cookie;
  return parseAcceptLanguage(acceptLanguage) ?? DEFAULT_LOCALE;
}

/**
 * The best supported language in an `Accept-Language` header.
 *
 * `fr-CA` counts as French: the header names regions we do not distinguish, and
 * falling back to English because a Québécois browser asked for `fr-CA` would
 * be a bug rather than a policy. Quality values are honoured — a browser that
 * says `en;q=0.9, fr;q=1.0` prefers French.
 */
export function parseAcceptLanguage(
  header: string | null | undefined,
): Locale | null {
  if (!header) return null;

  const ranked = header
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params
        .map((param) => param.trim())
        .find((param) => param.startsWith("q="));
      const quality = q ? Number.parseFloat(q.slice(2)) : 1;
      return {
        tag: tag.trim().toLowerCase(),
        quality: Number.isNaN(quality) ? 0 : quality,
      };
    })
    .filter((entry) => entry.tag && entry.quality > 0)
    // A stable sort keeps header order for equal weights, which is what the
    // spec means by "in order of preference".
    .sort((a, b) => b.quality - a.quality);

  for (const { tag } of ranked) {
    const base = tag.split("-")[0];
    if (isLocale(base)) return base;
  }
  return null;
}
