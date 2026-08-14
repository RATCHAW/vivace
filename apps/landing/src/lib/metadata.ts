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
}: {
  locale: Locale;
  title: string;
  description: string;
  openGraphTitle?: string;
  openGraphDescription?: string;
  imageAlt: string;
  paths: LocalePaths;
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
        ...Object.fromEntries(
          LOCALES.map((other) => [other, paths[other]]),
        ),
        "x-default": paths.en,
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
