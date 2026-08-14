/**
 * The dictionary for a locale, and the one interpolation helper the page needs.
 *
 * A static map rather than a dynamic `import()`: both languages prerender at
 * build time, so there is no bundle to split — and a synchronous lookup keeps
 * every section a plain Server Component instead of an async one.
 */
import { DEFAULT_LOCALE, type Locale } from "./config";
import { en, type Dictionary, type Translated } from "./messages/en";
import { fr } from "./messages/fr";

/**
 * What a section is handed. The English dictionary widened to `string`, so a
 * component cannot accidentally depend on an English literal.
 */
export type Copy = Translated<Dictionary>;

const DICTIONARIES: Record<Locale, Copy> = { en, fr };

export function getDictionary(locale: Locale): Copy {
  return DICTIONARIES[locale] ?? DICTIONARIES[DEFAULT_LOCALE];
}

/**
 * `{{name}}` substitution — the only formatting the copy asks for.
 *
 * Two strings use it (the footer's year and the language switcher's label), so
 * this is a five-line function rather than a reason to take an ICU dependency.
 * If the page ever needs plurals or dates, that is the moment to reach for
 * `next-intl`, not before.
 */
export function fill(
  template: string,
  values: Record<string, string | number>,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match,
  );
}

export type { Dictionary };
