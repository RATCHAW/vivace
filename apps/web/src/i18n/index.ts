/**
 * i18next, initialised once, synchronously, before the first render.
 *
 * Synchronous matters: both catalogues are bundled rather than fetched, so
 * there is no loading state for language and no `<Suspense>` boundary around
 * the app. It also means a component test can render a screen without wiring a
 * provider — `src/test-setup.ts` imports this module and every `useTranslation`
 * in the tree resolves against the same instance.
 *
 * Detection order is `?lang=` → localStorage → the browser's own preference.
 * The querystring comes first because that is how apps/landing hands a language
 * over: its CTAs leave for `/login?lang=fr`, and the choice is then written to
 * localStorage so the athlete only makes it once.
 */
import i18n, { type ParseKeys } from "i18next";
import { initReactI18next, useTranslation } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { en, type Messages, type Translated } from "./messages/en";
import { fr } from "./messages/fr";
import {
  DEFAULT_LOCALE,
  INTL_LOCALES,
  isLocale,
  LOCALES,
  LOCALE_STORAGE_KEY,
  type Locale,
} from "./locales";

export const CATALOGUES: Record<Locale, Translated<Messages>> = { en, fr };

/**
 * Any key `t()` will accept.
 *
 * Useful where a module-level table holds keys rather than sentences — the
 * chip lists in the coach, the nav labels — so those tables are checked
 * against the catalogue the same way a call site is.
 */
export type TranslationKey = ParseKeys;

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      fr: { translation: fr },
    },
    fallbackLng: DEFAULT_LOCALE,
    supportedLngs: LOCALES,
    // `fr-CA` and `fr-BE` are French. Without this they fall all the way back
    // to English rather than to the base language they obviously are.
    nonExplicitSupportedLngs: true,
    // React escapes for us; letting i18next do it too turns an apostrophe in
    // an interpolated run name into `&#39;`.
    interpolation: { escapeValue: false },
    detection: {
      order: ["querystring", "localStorage", "navigator"],
      lookupQuerystring: "lang",
      lookupLocalStorage: LOCALE_STORAGE_KEY,
      caches: ["localStorage"],
    },
  });

export { i18n };

/** The language in force, always narrowed to one we actually have. */
export function currentLocale(): Locale {
  const resolved = i18n.resolvedLanguage ?? i18n.language;
  return isLocale(resolved) ? resolved : DEFAULT_LOCALE;
}

/**
 * The raw catalogue for the current language.
 *
 * For the handful of entries that are lists rather than sentences — weekday
 * names, mostly. `t()` can return an array with `returnObjects`, but at the
 * cost of widening every other call's return type to `string | object`, which
 * is a bad trade for seven strings.
 */
export function useMessages(): Translated<Messages> {
  const { i18n: instance } = useTranslation();
  const language = instance.resolvedLanguage ?? instance.language;
  return CATALOGUES[isLocale(language) ? language : DEFAULT_LOCALE];
}

/** The BCP 47 tag for `Intl`, following the language in force. */
export function useIntlLocale(): string {
  const { i18n: instance } = useTranslation();
  const language = instance.resolvedLanguage ?? instance.language;
  return INTL_LOCALES[isLocale(language) ? language : DEFAULT_LOCALE];
}

export function changeLocale(locale: Locale): void {
  void i18n.changeLanguage(locale);
  // The tag on <html> is what a screen reader switches voice on, and it is set
  // once at boot by index.html — nothing else updates it.
  document.documentElement.lang = locale;

  // `?lang=` outranks localStorage in the detector, so a landing handoff left
  // on the URL would undo this choice on the next reload of the same page. It
  // has done its job by now — the answer is in localStorage. React Router's
  // own history state is handed back untouched, or it loses its scroll keys.
  const url = new URL(window.location.href);
  if (url.searchParams.has("lang")) {
    url.searchParams.delete("lang");
    window.history.replaceState(window.history.state, "", url);
  }
}
