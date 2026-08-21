/**
 * Every document this site serves, as data.
 *
 * The sitemap used to hold this list, the footer held part of it, and nothing
 * could answer "does this URL exist?" without rendering it. Four things now
 * need the same answer — `sitemap.ts`, `llms.txt`, the Markdown route and
 * `proxy.ts`, which has to tell a typo from a page before it decides between a
 * redirect and a 404 — so the list lives here and they all read it.
 *
 * Framework-free on purpose: `proxy.ts` imports it, and so does a route
 * handler that runs at build time.
 */
import { LOCALES, type Locale } from "@/i18n/config";
import {
  CONTENT_PAGE_KEYS,
  contentPageKey,
  contentPagePaths,
  getContentPage,
  type ContentPageKey,
} from "@/i18n/content-pages";
import { getDictionary } from "@/i18n/dictionaries";
import { homePagePaths, type LocalePaths } from "@/lib/metadata";

export type Page = { kind: "home" } | { kind: "content"; key: ContentPageKey };

/**
 * The slug every unknown URL is rewritten onto — `/en/404`, `/fr/404`.
 *
 * It has to be a slug rather than a `not-found.tsx`, because that file renders
 * without `params` and would have to read the language from a request header;
 * one `headers()` call inside the `[locale]` boundary turns every page under
 * it from a prerendered document into an on-demand render. A route with params
 * prerenders in both languages and takes its 404 status from the rewrite.
 *
 * No content page may claim it. `content-pages.test.ts` is what says so.
 */
export const NOT_FOUND_SLUG = "404";

/** In the order a reader — or an agent building an index — should meet them. */
export const SITE_PAGES: readonly Page[] = [
  { kind: "home" },
  ...CONTENT_PAGE_KEYS.map((key) => ({ kind: "content", key }) as const),
];

export function pagePaths(page: Page): LocalePaths {
  return page.kind === "home" ? homePagePaths() : contentPagePaths(page.key);
}

/** `/en/about` → `/en/about.md`, the sibling URL a crawler can fetch blind. */
export function markdownPath(locale: Locale, page: Page): string {
  return `${pagePaths(page)[locale]}.md`;
}

/**
 * The page a path names, or `null` when nothing does.
 *
 * `segments` is the pathname split on `/` with the empty leading entry
 * dropped, so `[]` is the home page of the locale asked about. Anything
 * deeper than one segment is a 404 by construction: this site has no nesting.
 */
export function resolvePage(locale: Locale, segments: string[]): Page | null {
  if (segments.length === 0) return { kind: "home" };
  if (segments.length > 1) return null;
  const key = contentPageKey(locale, segments[0]);
  return key ? { kind: "content", key } : null;
}

/**
 * The page an *unlocalised* slug names, in any language.
 *
 * `/about` and `/a-propos` both mean the About page; the proxy sends either to
 * whichever language the visitor reads. Without this, an English speaker who
 * followed a French link would land on a 404 rather than the page they were
 * promised.
 */
export function resolveUnlocalizedPage(segments: string[]): Page | null {
  if (segments.length === 0) return { kind: "home" };
  for (const locale of LOCALES) {
    const page = resolvePage(locale, segments);
    if (page) return page;
  }
  return null;
}

/** What to call the page in a link, in the language it will be read in. */
export function pageName(locale: Locale, page: Page): string {
  return page.kind === "home"
    ? getDictionary(locale).header.backToTop
    : getContentPage(locale, page.key).eyebrow;
}

/** One sentence on what the page is for — the note beside a link list entry. */
export function pageSummary(locale: Locale, page: Page): string {
  return page.kind === "home"
    ? getDictionary(locale).meta.description
    : getContentPage(locale, page.key).description;
}
