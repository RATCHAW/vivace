import type { MetadataRoute } from "next";
import { LOCALES } from "@/i18n/config";
import { CONTENT_PAGE_KEYS, contentPagePaths } from "@/i18n/content-pages";
import {
  absoluteSiteUrl,
  homePagePaths,
  type LocalePaths,
} from "@/lib/metadata";

function localizedUrls(paths: LocalePaths): Record<string, string> {
  return {
    ...Object.fromEntries(
      LOCALES.map((locale) => [locale, absoluteSiteUrl(paths[locale])]),
    ),
    "x-default": absoluteSiteUrl(paths.en),
  };
}

export default function sitemap(): MetadataRoute.Sitemap {
  const pages: { paths: LocalePaths; priority: number }[] = [
    { paths: homePagePaths(), priority: 1 },
    ...CONTENT_PAGE_KEYS.map((key) => ({
      paths: contentPagePaths(key),
      priority: key === "about" ? 0.7 : 0.5,
    })),
  ];

  return pages.flatMap(({ paths, priority }) =>
    LOCALES.map((locale) => ({
      url: absoluteSiteUrl(paths[locale]),
      changeFrequency: "monthly" as const,
      priority,
      alternates: {
        languages: localizedUrls(paths),
      },
    })),
  );
}
