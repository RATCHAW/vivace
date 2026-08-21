import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { Analytics } from "@/components/analytics";
import { StructuredData } from "@/components/structured-data";
import { getDictionary } from "@/i18n/dictionaries";
import { isLocale, LOCALES, type Locale } from "@/i18n/config";
import { createPageMetadata, homePagePaths } from "@/lib/metadata";
import { siteStructuredData } from "@/lib/structured-data";
import "../../styles.css";

/**
 * Both languages are prerendered at build time. Nothing on this page is
 * per-visitor, so there is no reason for either to be rendered on demand —
 * `proxy.ts` only chooses which of the two static documents to serve.
 */
export function generateStaticParams(): { locale: Locale }[] {
  return LOCALES.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = getDictionary(locale).meta;

  return createPageMetadata({
    locale,
    title: t.title,
    description: t.description,
    openGraphTitle: t.ogTitle,
    openGraphDescription: t.ogDescription,
    imageAlt: t.imageAlt,
    paths: homePagePaths(),
    // `/` is the auto-redirecting entry point, which is exactly what
    // `x-default` is for — and the one URL that shows the bare domain in a
    // result rather than a language folder.
    xDefault: "/",
  });
}

export const viewport: Viewport = {
  // The canvas is true black end to end; browser chrome should agree.
  colorScheme: "dark",
  themeColor: "#000000",
};

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  // `generateStaticParams` covers the two we have; anything else reaching here
  // is a hand-typed URL, and `/de` should be a 404 rather than English served
  // under a German tag.
  if (!isLocale(locale)) notFound();

  return (
    <html lang={locale}>
      <body>
        {/* Site-wide only. What is specific to a document — the product, the
            FAQ — is emitted by that document, not from here. */}
        <StructuredData data={siteStructuredData()} />
        {children}
        <Analytics />
      </body>
    </html>
  );
}
