import { notFound } from "next/navigation";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { ClosingCta } from "@/components/sections/closing-cta";
import { Coach } from "@/components/sections/coach";
import { Film } from "@/components/sections/film";
import { Hero } from "@/components/sections/hero";
import { HowItWorks } from "@/components/sections/how-it-works";
import { Questions } from "@/components/sections/questions";
import { Sports } from "@/components/sections/sports";
import { getDictionary } from "@/i18n/dictionaries";
import { isLocale } from "@/i18n/config";

// DESIGN.md's two-mode rhythm: dark storytelling bands (hero, sports,
// questions) slam against white catalogue bands (the film, the coach) with no
// transition between them.
//
// The dictionary is read once here and handed down. Prop-drilling rather than
// context on purpose: context needs a client boundary, and every section below
// is a Server Component that must stay one.
export default async function LandingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const copy = getDictionary(locale);

  return (
    <>
      <SiteHeader copy={copy} locale={locale} />
      <main>
        <Hero copy={copy} locale={locale} />
        <HowItWorks copy={copy} />
        <Film copy={copy} locale={locale} />
        <Sports copy={copy} />
        <Coach copy={copy} />
        <Questions copy={copy} />
        <ClosingCta copy={copy} locale={locale} />
      </main>
      <SiteFooter copy={copy} locale={locale} />
    </>
  );
}
