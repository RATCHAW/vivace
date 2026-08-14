import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { Analytics } from "@/components/analytics";
import { getDictionary } from "@/i18n/dictionaries";
import { isLocale, LOCALES, type Locale } from "@/i18n/config";
import { siteUrl } from "@/lib/site";
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

  return {
    metadataBase: new URL(siteUrl),
    title: t.title,
    description: t.description,
    applicationName: "Vivace",
    alternates: {
      canonical: `/${locale}`,
      // Search engines pair the two versions off these, and `x-default` names
      // which one an unrecognised language gets — the same answer `proxy.ts`
      // gives a browser with no preference we speak.
      languages: {
        ...Object.fromEntries(LOCALES.map((other) => [other, `/${other}`])),
        "x-default": "/en",
      },
    },
    openGraph: {
      type: "website",
      siteName: "Vivace",
      locale,
      title: t.ogTitle,
      description: t.ogDescription,
      url: `/${locale}`,
    },
  };
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
        {children}
        <Analytics />
      </body>
    </html>
  );
}
