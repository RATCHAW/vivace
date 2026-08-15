import { describe, expect, it } from "vitest";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import { LOCALES } from "@/i18n/config";
import { CONTENT_PAGE_KEYS } from "@/i18n/content-pages";
import { getDictionary } from "@/i18n/dictionaries";
import { createPageMetadata, homePagePaths } from "./metadata";
import { coachUrl, resolveSiteUrl, signInUrl, siteUrl } from "./site";
import { homeStructuredData, siteStructuredData } from "./structured-data";

/** The `@type` of every node in a graph, for asserting what a page claims. */
function types(graph: unknown[]): string[] {
  return graph.map((node) => (node as { "@type": string })["@type"]);
}

describe("app handoff", () => {
  it("carries the language and starts Strava sign-in", () => {
    expect(signInUrl("fr")).toBe(
      "http://localhost:5173/login?lang=fr&provider=strava",
    );
  });

  it("carries a destination through sign-in when one is asked for", () => {
    expect(signInUrl("en", "/replays?run=123")).toBe(
      "http://localhost:5173/login?lang=en&provider=strava&next=%2Freplays%3Frun%3D123",
    );
  });

  it("opens the live coach in the selected language, through sign-in", () => {
    // Not `/coach` directly: the app's route guard would bounce a signed-out
    // visitor to sign-in and land them on the Overview, losing the button they
    // actually pressed.
    expect(coachUrl("fr")).toBe(
      "http://localhost:5173/login?lang=fr&provider=strava&next=%2Fcoach",
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

describe("structured data", () => {
  it("says only what is true of every page, site-wide", () => {
    // An FAQPage here would follow the layout onto /en/privacy and claim six
    // answers that page does not render.
    expect(types(siteStructuredData())).toEqual(["Organization", "WebSite"]);
  });

  it("describes the product and the questions on the home page", () => {
    expect(types(homeStructuredData("en", getDictionary("en")))).toEqual([
      "SoftwareApplication",
      "FAQPage",
    ]);
  });

  it.each(LOCALES)("%s quotes its own catalogue's answers", (locale) => {
    const copy = getDictionary(locale);
    const [app, faq] = homeStructuredData(locale, copy) as [
      { url: string; description: string; inLanguage: string },
      { mainEntity: { name: string; acceptedAnswer: { text: string } }[] },
    ];

    expect(app).toMatchObject({
      url: `${siteUrl}/${locale}`,
      description: copy.meta.description,
      inLanguage: locale,
    });
    // Every rendered question, so a reworded answer can never leave stale
    // markup behind — and never fewer, which is how an FAQPage starts lying.
    expect(faq.mainEntity).toEqual(
      copy.questions.items.map((item) => ({
        "@type": "Question",
        name: item.q,
        acceptedAnswer: { "@type": "Answer", text: item.a },
      })),
    );
  });
});
