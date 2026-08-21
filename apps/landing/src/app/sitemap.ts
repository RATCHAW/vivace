import type { MetadataRoute } from "next";
import { LOCALES } from "@/i18n/config";
import { absoluteSiteUrl, type LocalePaths } from "@/lib/metadata";
import { pagePaths, SITE_PAGES, type Page } from "@/lib/pages";

function localizedUrls(paths: LocalePaths, xDefault: string) {
  return {
    ...Object.fromEntries(
      LOCALES.map((locale) => [locale, absoluteSiteUrl(paths[locale])]),
    ),
    "x-default": absoluteSiteUrl(xDefault),
  };
}

/**
 * The About page is the one a search engine reads to learn what Vivace is, so
 * it outranks the legal pages; the home page outranks everything.
 */
function priorityOf(page: Page): number {
  if (page.kind === "home") return 1;
  return page.key === "about" ? 0.7 : 0.5;
}

export default function sitemap(): MetadataRoute.Sitemap {
  return SITE_PAGES.flatMap((page) => {
    const paths = pagePaths(page);
    // Same rule as the `hreflang` tags: the home page's `x-default` is `/`,
    // the redirect that chooses a language, because that is the URL an athlete
    // with no stated preference should land on.
    const xDefault = page.kind === "home" ? "/" : paths.en;

    return LOCALES.map((locale) => ({
      url: absoluteSiteUrl(paths[locale]),
      changeFrequency: "monthly" as const,
      priority: priorityOf(page),
      alternates: { languages: localizedUrls(paths, xDefault) },
    }));
  });
}
