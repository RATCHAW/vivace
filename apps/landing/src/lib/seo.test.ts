import { describe, expect, it } from "vitest";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import { LOCALES } from "@/i18n/config";
import { CONTENT_PAGE_KEYS } from "@/i18n/content-pages";
import { createPageMetadata, homePagePaths } from "./metadata";
import { resolveSiteUrl, signInUrl, siteUrl } from "./site";

describe("app handoff", () => {
  it("carries the language and starts Strava sign-in", () => {
    expect(signInUrl("fr")).toBe(
      "http://localhost:5173/login?lang=fr&provider=strava",
    );
  });
});

describe("SEO discovery", () => {
  it("defaults to the final production origin", () => {
    expect(resolveSiteUrl()).toBe("https://www.vivace.run");
    expect(resolveSiteUrl("https://preview.example/")).toBe(
      "https://preview.example",
    );
  });

  it("publishes a crawlable robots file with the sitemap", () => {
    expect(robots()).toMatchObject({
      rules: { userAgent: "*", allow: "/" },
      sitemap: `${siteUrl}/sitemap.xml`,
      host: siteUrl,
    });
  });

  it("lists every localized page exactly once", () => {
    const entries = sitemap();
    const expectedCount = LOCALES.length * (CONTENT_PAGE_KEYS.length + 1);
    const urls = entries.map((entry) => entry.url);

    expect(entries).toHaveLength(expectedCount);
    expect(new Set(urls).size).toBe(expectedCount);
    expect(urls).toContain(`${siteUrl}/en`);
    expect(urls).toContain(`${siteUrl}/fr`);

    for (const entry of entries) {
      expect(entry.alternates?.languages).toMatchObject({
        en: expect.stringContaining(`${siteUrl}/en`),
        fr: expect.stringContaining(`${siteUrl}/fr`),
        "x-default": expect.stringContaining(`${siteUrl}/en`),
      });
    }
  });
});

describe("page metadata", () => {
  it("keeps canonical, hreflang, social image and locale aligned", () => {
    const metadata = createPageMetadata({
      locale: "fr",
      title: "Titre",
      description: "Description",
      imageAlt: "Aperçu Vivace",
      paths: homePagePaths(),
    });

    expect(metadata).toMatchObject({
      alternates: {
        canonical: "/fr",
        languages: { en: "/en", fr: "/fr", "x-default": "/en" },
      },
      openGraph: {
        locale: "fr_FR",
        alternateLocale: ["en_US"],
        url: "/fr",
        images: [{ url: "/og-image.png", width: 1200, height: 630 }],
      },
      twitter: {
        card: "summary_large_image",
        images: [{ url: "/og-image.png" }],
      },
    });
  });
});
