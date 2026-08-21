/**
 * What an agent gets, as opposed to what a browser gets: the Markdown
 * representations, `llms.txt` and the routing decisions that lead to them.
 */
import { describe, expect, it } from "vitest";
import { LOCALES, type Locale } from "@/i18n/config";
import {
  CONTENT_PAGE_KEYS,
  CONTENT_PAGE_ROUTES,
  getContentPage,
} from "@/i18n/content-pages";
import { getDictionary } from "@/i18n/dictionaries";
import { llmsTxt } from "./llms";
import { fullMarkdown, notFoundMarkdown, pageMarkdown } from "./markdown";
import {
  markdownPath,
  NOT_FOUND_SLUG,
  pageName,
  pagePaths,
  resolvePage,
  resolveUnlocalizedPage,
  SITE_PAGES,
  type Page,
} from "./pages";
import { siteUrl, SOCIAL_PROFILES } from "./site";

/** Every heading in a Markdown document, as `[level, text]`. */
function headings(markdown: string): [number, string][] {
  return [...markdown.matchAll(/^(#{1,6}) (.+)$/gm)].map((match) => [
    match[1].length,
    match[2],
  ]);
}

const EVERY_PAGE: [Locale, Page][] = LOCALES.flatMap((locale) =>
  SITE_PAGES.map((page): [Locale, Page] => [locale, page]),
);

describe("page resolution", () => {
  it("reads the home page from an empty path", () => {
    expect(resolvePage("en", [])).toEqual({ kind: "home" });
    expect(resolveUnlocalizedPage([])).toEqual({ kind: "home" });
  });

  it("reads a content page from its slug in that language", () => {
    expect(resolvePage("fr", ["a-propos"])).toEqual({
      kind: "content",
      key: "about",
    });
    // French slugs are not English routes, and the other way round.
    expect(resolvePage("en", ["a-propos"])).toBeNull();
  });

  it("answers null for anything that names no page", () => {
    expect(resolvePage("en", ["nope"])).toBeNull();
    expect(resolvePage("en", ["about", "deeper"])).toBeNull();
    expect(resolveUnlocalizedPage(["nope"])).toBeNull();
  });

  /**
   * The proxy sends `/about` and `/a-propos` to whichever language the visitor
   * reads. An old link in the wrong language is a redirect, not a 404.
   */
  it("reads an unlocalised slug in either language", () => {
    for (const locale of LOCALES) {
      for (const key of CONTENT_PAGE_KEYS) {
        expect(
          resolveUnlocalizedPage([CONTENT_PAGE_ROUTES[locale][key]]),
        ).toEqual({ kind: "content", key });
      }
    }
  });

  /**
   * `proxy.ts` rewrites every unknown URL onto this slug. A content page that
   * claimed it would answer 404 from then on.
   */
  it("keeps the 404 slug clear of every content page", () => {
    for (const locale of LOCALES) {
      expect(resolvePage(locale, [NOT_FOUND_SLUG])).toBeNull();
    }
  });

  it("points every page at its own .md sibling", () => {
    expect(markdownPath("en", { kind: "home" })).toBe("/en.md");
    expect(markdownPath("fr", { kind: "content", key: "privacy" })).toBe(
      "/fr/confidentialite.md",
    );
  });
});

describe("markdown representations", () => {
  it.each(EVERY_PAGE)(
    "%s %s opens with one H1 and a summary",
    (locale, page) => {
      const markdown = pageMarkdown(locale, page, { directory: false });
      const levels = headings(markdown);

      expect(levels.filter(([level]) => level === 1)).toHaveLength(1);
      expect(levels[0][0]).toBe(1);
      expect(markdown).toMatch(/^> .+$/m);
    },
  );

  it.each(EVERY_PAGE)("%s %s never skips a heading level", (locale, page) => {
    const levels = headings(pageMarkdown(locale, page)).map(([level]) => level);
    for (let i = 1; i < levels.length; i += 1) {
      expect(levels[i]).toBeLessThanOrEqual(levels[i - 1] + 1);
    }
  });

  it.each(EVERY_PAGE)("%s %s says what the page says", (locale, page) => {
    const markdown = pageMarkdown(locale, page);
    const copy = getDictionary(locale);

    if (page.kind === "home") {
      // Every question the page answers, so an agent quoting the Markdown
      // quotes the same words a reader sees.
      for (const item of copy.questions.items) {
        expect(markdown).toContain(item.q);
        expect(markdown).toContain(item.a);
      }
      expect(markdown).toContain(copy.hero.body);
    } else {
      const content = getContentPage(locale, page.key);
      for (const section of content.sections) {
        expect(markdown).toContain(section.heading);
        for (const paragraph of section.paragraphs) {
          expect(markdown).toContain(paragraph);
        }
      }
    }
  });

  it.each(EVERY_PAGE)(
    "%s %s carries a directory an agent can recover from",
    (locale, page) => {
      const markdown = pageMarkdown(locale, page);

      expect(markdown).toContain(`${siteUrl}/llms.txt`);
      expect(markdown).toContain(`${siteUrl}/sitemap.xml`);
      // Every other page, and this page in the other language.
      for (const other of SITE_PAGES) {
        const href = `${siteUrl}${pagePaths(other)[locale]}`;
        if (other.kind === page.kind && other.kind === "home") continue;
        if (other.kind === "content" && page.kind === "content") {
          if (other.key === page.key) continue;
        }
        expect(markdown).toContain(href);
      }
      for (const other of LOCALES.filter((one) => one !== locale)) {
        expect(markdown).toContain(`${siteUrl}${pagePaths(page)[other]}`);
      }
    },
  );

  it("drops the directory when asked, so llms-full.txt is not twelve copies", () => {
    const withTail = pageMarkdown("en", { kind: "home" });
    const without = pageMarkdown("en", { kind: "home" }, { directory: false });

    expect(withTail).toContain(`${siteUrl}/llms-full.txt`);
    expect(without).not.toContain(`${siteUrl}/llms-full.txt`);
    expect(withTail.startsWith(without)).toBe(true);
  });
});

describe("the 404 body", () => {
  it.each(LOCALES)("%s lists every page and where the index is", (locale) => {
    const markdown = notFoundMarkdown(locale);
    const copy = getDictionary(locale);

    expect(markdown).toContain(copy.notFound.heading);
    expect(markdown).toContain(`${siteUrl}/llms.txt`);
    expect(markdown).toContain(`${siteUrl}/sitemap.xml`);
    for (const page of SITE_PAGES) {
      expect(markdown).toContain(`${siteUrl}${pagePaths(page)[locale]}`);
      expect(markdown).toContain(pageName(locale, page));
    }
  });
});

describe("llms-full.txt", () => {
  const full = fullMarkdown();

  it("holds every page in every language, stamped with its URL", () => {
    for (const [locale, page] of EVERY_PAGE) {
      expect(full).toContain(`<!-- ${siteUrl}${pagePaths(page)[locale]} -->`);
    }
  });

  it("keeps one H1 per document", () => {
    expect(headings(full).filter(([level]) => level === 1)).toHaveLength(
      EVERY_PAGE.length,
    );
  });
});

/**
 * llmstxt.org fixes the order: H1, then an optional blockquote, then Markdown
 * carrying no headings, then H2 sections whose bodies are link lists. A file
 * that drifts from that is one a fixed parser reads wrong rather than one it
 * complains about, which is why this is asserted rather than eyeballed.
 */
describe("llms.txt", () => {
  const text = llmsTxt();
  const lines = text.split("\n");

  it("opens with the H1 and the blockquote, in that order", () => {
    expect(lines[0]).toBe("# Vivace");
    expect(lines[2].startsWith("> ")).toBe(true);
  });

  it("keeps every heading below the first at H2", () => {
    expect(headings(text).map(([level]) => level)).toEqual([
      1,
      ...Array(headings(text).length - 1).fill(2),
    ]);
  });

  it("puts prose before the first H2 and link lists after it", () => {
    const firstSection = lines.findIndex((line) => line.startsWith("## "));
    expect(firstSection).toBeGreaterThan(3);

    const body = lines.slice(firstSection);
    const bullets = body.filter((line) => line.startsWith("- "));
    expect(bullets.length).toBeGreaterThan(0);
    for (const bullet of bullets) {
      expect(bullet).toMatch(/^- \[[^\]]+\]\([^)]+\)(: .+)?$/);
    }
  });

  it("tells an agent when to reach for Vivace, with a URL per job", () => {
    const start = lines.findIndex((line) => line === "## When to use Vivace");
    expect(start).toBeGreaterThan(-1);

    const section = lines
      .slice(start + 1)
      .slice(
        0,
        lines.slice(start + 1).findIndex((line) => line.startsWith("## ")),
      )
      .filter((line) => line.startsWith("- "));

    expect(section.length).toBeGreaterThanOrEqual(3);
    for (const line of section) {
      expect(line).toMatch(/^- \[.+\]\(https:\/\/[^)]+\): .{40,}$/);
    }
  });

  it("names what Vivace is not for, so an agent can rule it out", () => {
    expect(text).toMatch(/not\*{0,2} for/i);
    expect(text).toContain("read-only on Strava");
  });

  it("links every page, and puts the second language under Optional", () => {
    const optional = text.indexOf("## Optional");
    expect(optional).toBeGreaterThan(-1);

    for (const page of SITE_PAGES) {
      expect(text.slice(0, optional)).toContain(
        `${siteUrl}${pagePaths(page)["en"]}`,
      );
      expect(text.slice(optional)).toContain(
        `${siteUrl}${pagePaths(page)["fr"]}`,
      );
    }
  });

  it("points at the same profiles the JSON-LD graph claims", () => {
    for (const profile of SOCIAL_PROFILES) {
      expect(text).toContain(`(${profile})`);
    }
  });

  it("says how to get Markdown out of any URL", () => {
    expect(text).toContain("Accept: text/markdown");
    expect(text).toContain(`${siteUrl}/en.md`);
    expect(text).toContain("Vary: Accept");
  });

  it("ends with a newline and no run of blank lines", () => {
    expect(text.endsWith("\n")).toBe(true);
    expect(text).not.toMatch(/\n{3}/);
  });
});
