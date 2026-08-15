/**
 * The JSON-LD graph, as data rather than as markup.
 *
 * Two builders, split by *scope* rather than by convenience. The site graph
 * describes Vivace and is true of every document, so the layout emits it once
 * around both the home page and the content pages. The home graph describes
 * what is actually on the home page — the product, and the questions the page
 * answers — and must not follow the layout onto `/en/privacy`, where an
 * `FAQPage` would claim six answers that document does not contain.
 *
 * Both are pure and read their words from the dictionary, so the French
 * document carries French answers and a reworded question can never drift from
 * the markup describing it.
 */
import { LOCALES, type Locale } from "@/i18n/config";
import type { Copy } from "@/i18n/dictionaries";
import { absoluteSiteUrl } from "@/lib/metadata";
import { siteUrl } from "@/lib/site";

const ORGANIZATION_ID = `${siteUrl}/#organization`;

/** True of every page: who publishes this, and what the site is. */
export function siteStructuredData(): unknown[] {
  return [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      "@id": ORGANIZATION_ID,
      name: "Vivace",
      url: siteUrl,
      logo: `${siteUrl}/apple-touch-icon.png`,
      email: "hello@vivace.run",
    },
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      "@id": `${siteUrl}/#website`,
      name: "Vivace",
      url: siteUrl,
      publisher: { "@id": ORGANIZATION_ID },
      inLanguage: LOCALES,
    },
  ];
}

/** True of the home page only: the product it sells and the FAQ it renders. */
export function homeStructuredData(locale: Locale, copy: Copy): unknown[] {
  const home = absoluteSiteUrl(`/${locale}`);

  return [
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      "@id": `${siteUrl}/#app`,
      name: "Vivace",
      // Two of schema.org's own category enums, because Vivace is both: an AI
      // coach that reads training, and a renderer that returns a video.
      applicationCategory: ["SportsApplication", "MultimediaApplication"],
      operatingSystem: "Web",
      url: home,
      description: copy.meta.description,
      inLanguage: locale,
      publisher: { "@id": ORGANIZATION_ID },
      // Free for as long as the page says it is free; the FAQ and the hero
      // footnote make the same promise, and all three change together.
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "EUR",
        availability: "https://schema.org/InStock",
      },
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      "@id": `${home}#faq`,
      inLanguage: locale,
      mainEntity: copy.questions.items.map((item) => ({
        "@type": "Question",
        name: item.q,
        acceptedAnswer: { "@type": "Answer", text: item.a },
      })),
    },
  ];
}
