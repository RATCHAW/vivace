import { describe, expect, it } from "vitest";
import {
  DEFAULT_LOCALE,
  LOCALES,
  negotiateLocale,
  parseAcceptLanguage,
} from "./config";
import {
  CONTENT_PAGE_KEYS,
  CONTENT_PAGE_ROUTES,
  contentPageKey,
  contentPagePath,
  contentPagePaths,
  getContentPage,
} from "./content-pages";
import { fill, getDictionary } from "./dictionaries";
import { en } from "./messages/en";
import { fr } from "./messages/fr";

/** Every leaf key, dotted — `hero.badge`, `film.chapters.0.title`. */
function leaves(value: unknown, prefix = ""): string[] {
  if (typeof value === "string" || typeof value === "boolean") return [prefix];
  if (Array.isArray(value)) {
    return value.flatMap((item, i) => leaves(item, `${prefix}.${i}`));
  }
  if (typeof value === "object" && value !== null) {
    return Object.entries(value).flatMap(([key, child]) =>
      leaves(child, prefix ? `${prefix}.${key}` : key),
    );
  }
  return [];
}

function strings(value: unknown, prefix = ""): [string, string][] {
  if (typeof value === "string") return [[prefix, value]];
  if (Array.isArray(value)) {
    return value.flatMap((item, i) => strings(item, `${prefix}.${i}`));
  }
  if (typeof value === "object" && value !== null) {
    return Object.entries(value).flatMap(([key, child]) =>
      strings(child, prefix ? `${prefix}.${key}` : key),
    );
  }
  return [];
}

describe("dictionaries", () => {
  it("answer exactly the same keys", () => {
    expect(leaves(fr).sort()).toEqual(leaves(en).sort());
  });

  it.each(LOCALES)("%s has no empty strings", (locale) => {
    const blank = strings(getDictionary(locale))
      .filter(([, value]) => value.trim() === "")
      .map(([key]) => key);
    expect(blank).toEqual([]);
  });

  /**
   * Which sports have shipped is a fact about the product, not about the
   * language — a translation that flips one would advertise a feature that
   * does not exist.
   */
  it("agree on which sports are live", () => {
    expect(fr.sports.items.map((item) => item.live)).toEqual(
      en.sports.items.map((item) => item.live),
    );
  });

  it("keep every interpolation placeholder", () => {
    const french = new Map(strings(fr));
    const drifted = strings(en)
      .filter(([key, text]) => {
        const other = french.get(key);
        const of = (s: string) =>
          [...s.matchAll(/\{\{(\w+)\}\}/g)]
            .map((m) => m[1])
            .sort()
            .join();
        return other !== undefined && of(other) !== of(text);
      })
      .map(([key]) => key);
    expect(drifted).toEqual([]);
  });
});

describe("content pages", () => {
  it.each(LOCALES)("%s has complete, non-empty pages", (locale) => {
    for (const key of CONTENT_PAGE_KEYS) {
      const page = getContentPage(locale, key);
      const blank = strings(page)
        .filter(([, value]) => value.trim() === "")
        .map(([path]) => `${key}.${path}`);
      expect(blank).toEqual([]);
      expect(page.sections.length).toBeGreaterThan(0);
    }
  });

  it.each(LOCALES)("%s slugs are unique and round-trip", (locale) => {
    const slugs = Object.values(CONTENT_PAGE_ROUTES[locale]);
    expect(new Set(slugs).size).toBe(CONTENT_PAGE_KEYS.length);

    for (const key of CONTENT_PAGE_KEYS) {
      const slug = CONTENT_PAGE_ROUTES[locale][key];
      expect(contentPageKey(locale, slug)).toBe(key);
      expect(contentPagePath(locale, key)).toBe(`/${locale}/${slug}`);
    }
  });

  it("pairs each translation with the same content page", () => {
    for (const key of CONTENT_PAGE_KEYS) {
      const paths = contentPagePaths(key);
      expect(paths.en).toBe(`/en/${CONTENT_PAGE_ROUTES.en[key]}`);
      expect(paths.fr).toBe(`/fr/${CONTENT_PAGE_ROUTES.fr[key]}`);
    }
  });
});

describe("fill", () => {
  it("substitutes named values", () => {
    expect(fill("© {{year}} vivace.", { year: 2026 })).toBe("© 2026 vivace.");
  });

  it("leaves an unknown placeholder alone rather than printing undefined", () => {
    expect(fill("{{a}} and {{b}}", { a: "x" })).toBe("x and {{b}}");
  });
});

describe("parseAcceptLanguage", () => {
  it("reads a plain preference", () => {
    expect(parseAcceptLanguage("fr")).toBe("fr");
  });

  it("treats a regional tag as its base language", () => {
    // A Québécois browser asking for fr-CA should not get English.
    expect(parseAcceptLanguage("fr-CA,fr;q=0.9")).toBe("fr");
  });

  it("honours quality values over header order", () => {
    expect(parseAcceptLanguage("en;q=0.8,fr;q=1.0")).toBe("fr");
  });

  it("skips languages we do not speak", () => {
    expect(parseAcceptLanguage("de-DE,de;q=0.9,fr;q=0.5")).toBe("fr");
  });

  it("answers null when nothing matches", () => {
    expect(parseAcceptLanguage("de,es")).toBeNull();
    expect(parseAcceptLanguage(null)).toBeNull();
  });

  it("ignores a language explicitly refused with q=0", () => {
    expect(parseAcceptLanguage("fr;q=0,en;q=0.5")).toBe("en");
  });
});

describe("negotiateLocale", () => {
  it("prefers an explicit choice over the browser's list", () => {
    expect(negotiateLocale("en", "fr-FR,fr;q=0.9")).toBe("en");
  });

  it("falls back to the browser when there is no cookie", () => {
    expect(negotiateLocale(undefined, "fr-FR,fr;q=0.9")).toBe("fr");
  });

  it("ignores a cookie holding a language we dropped", () => {
    expect(negotiateLocale("de", "fr")).toBe("fr");
  });

  it("lands on the default when nobody has an opinion", () => {
    expect(negotiateLocale(undefined, undefined)).toBe(DEFAULT_LOCALE);
  });
});
