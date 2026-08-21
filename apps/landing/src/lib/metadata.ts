import type { Metadata } from "next";
import { LOCALES, type Locale } from "@/i18n/config";
import { siteUrl } from "@/lib/site";

export type LocalePaths = Record<Locale, string>;

const OPEN_GRAPH_LOCALES: Record<Locale, string> = {
  en: "en_US",
  fr: "fr_FR",
};

export function homePagePaths(): LocalePaths {
  return Object.fromEntries(
    LOCALES.map((locale) => [locale, `/${locale}`]),
  ) as LocalePaths;
}

export function absoluteSiteUrl(path: string): string {
  return new URL(path, `${siteUrl}/`).toString();
}

export function createPageMetadata({
  locale,
  title,
  description,
  openGraphTitle = title,
  openGraphDescription = description,
  imageAlt,
  paths,
  xDefault = paths.en,
}: {
  locale: Locale;
  title: string;
  description: string;
  openGraphTitle?: string;
  openGraphDescription?: string;
  imageAlt: string;
  paths: LocalePaths;
  /**
   * What `hreflang="x-default"` points at. The home page overrides it with
   * `/`, which is the language-negotiating redirect Google documents
   * `x-default` for — and the only URL on this site that is the bare domain.
   */
  xDefault?: string;
}): Metadata {
  return {
    metadataBase: new URL(siteUrl),
    title,
    description,
    applicationName: "Vivace",
    publisher: "Vivace",
    alternates: {
      canonical: paths[locale],
      languages: {
        ...Object.fromEntries(LOCALES.map((other) => [other, paths[other]])),
        "x-default": xDefault,
      },
      // The same page as Markdown, for a crawler that reads `rel="alternate"`
      // rather than sending `Accept: text/markdown`. `proxy.ts` serves both.
      types: {
        "text/markdown": `${paths[locale]}.md`,
      },
    },
    openGraph: {
      type: "website",
      siteName: "Vivace",
      locale: OPEN_GRAPH_LOCALES[locale],
      alternateLocale: LOCALES.filter((other) => other !== locale).map(
        (other) => OPEN_GRAPH_LOCALES[other],
      ),
      title: openGraphTitle,
      description: openGraphDescription,
      url: paths[locale],
      images: [
        {
          url: "/og-image.png",
          width: 1200,
          height: 630,
          alt: imageAlt,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: openGraphTitle,
      description: openGraphDescription,
      images: [
        {
          url: "/og-image.png",
          alt: imageAlt,
        },
      ],
    },
    icons: {
      icon: [{ url: "/favicon.svg", type: "image/svg+xml" }],
      apple: [
        {
          url: "/apple-touch-icon.png",
          sizes: "180x180",
          type: "image/png",
        },
      ],
    },
  };
}
