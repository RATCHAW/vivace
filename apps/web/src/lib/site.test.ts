import { describe, expect, it } from "vitest";
import { CONTENT_PAGE_ROUTES } from "../../../landing/src/i18n/content-pages";
import { CONTENT_PAGES, contentPageUrl, marketingHomeUrl } from "./site";

describe("links out to the marketing site", () => {
  it("uses the slugs apps/landing actually publishes", () => {
    // The two apps share a design language, not a module graph — `site.ts`
    // holds a *copy* of the landing page's slug table, the same way
    // `vivace-mark.tsx` is a copy of its mark. This is what stops the copy from
    // rotting into a footer full of 404s: rename a slug over there and this
    // fails here. (The import reaches across workspaces for the test only;
    // nothing in `src/` does.)
    for (const page of CONTENT_PAGES) {
      expect(contentPageUrl("en", page)).toBe(
        `https://www.vivace.run/en/${CONTENT_PAGE_ROUTES.en[page]}`,
      );
      expect(contentPageUrl("fr", page)).toBe(
        `https://www.vivace.run/fr/${CONTENT_PAGE_ROUTES.fr[page]}`,
      );
    }
  });

  it("sends a French athlete to the French page", () => {
    expect(contentPageUrl("fr", "privacy")).toBe(
      "https://www.vivace.run/fr/confidentialite",
    );
    expect(marketingHomeUrl("fr")).toBe("https://www.vivace.run/fr");
  });
});
