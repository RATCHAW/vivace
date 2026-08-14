import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MonoLabel } from "@/components/mono";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { LOCALES, isLocale, type Locale } from "@/i18n/config";
import {
  CONTENT_PAGE_KEYS,
  contentPageKey,
  contentPagePaths,
  getContentPage,
} from "@/i18n/content-pages";
import { getDictionary } from "@/i18n/dictionaries";
import { createPageMetadata } from "@/lib/metadata";

export const dynamicParams = false;

export function generateStaticParams(): { locale: Locale; slug: string }[] {
  return LOCALES.flatMap((locale) =>
    CONTENT_PAGE_KEYS.map((key) => ({
      locale,
      slug: contentPagePaths(key)[locale].split("/").at(-1)!,
    })),
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!isLocale(locale)) notFound();
  const key = contentPageKey(locale, slug);
  if (!key) notFound();
  const page = getContentPage(locale, key);
  const copy = getDictionary(locale);

  return createPageMetadata({
    locale,
    title: page.title,
    description: page.description,
    imageAlt: copy.meta.imageAlt,
    paths: contentPagePaths(key),
  });
}

export default async function ContentPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  if (!isLocale(locale)) notFound();
  const key = contentPageKey(locale, slug);
  if (!key) notFound();

  const page = getContentPage(locale, key);
  const copy = getDictionary(locale);
  const languagePaths = contentPagePaths(key);

  return (
    <>
      <SiteHeader
        copy={copy}
        locale={locale}
        languagePaths={languagePaths}
      />
      <main id="top" className="band-light bg-background text-foreground px-6 py-20 sm:px-8 sm:py-28">
        <article className="mx-auto w-full max-w-[820px]">
          <header className="border-border flex flex-col gap-6 border-b pb-12 sm:pb-16">
            <MonoLabel className="text-brand">{page.eyebrow}</MonoLabel>
            <h1 className="font-heading text-display-xl text-balance">
              {page.heading}
            </h1>
            <p className="text-body-lg text-muted-foreground max-w-[720px]">
              {page.lead}
            </p>
            {page.updated ? (
              <p className="text-caption text-stone">{page.updated}</p>
            ) : null}
          </header>

          <div className="flex flex-col gap-12 py-12 sm:gap-16 sm:py-16">
            {page.sections.map((section) => (
              <section key={section.heading} className="flex flex-col gap-5">
                <h2 className="text-heading-lg text-balance">
                  {section.heading}
                </h2>
                <div className="text-body-md text-muted-foreground flex flex-col gap-4">
                  {section.paragraphs.map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
                  {section.bullets ? (
                    <ul className="list-disc space-y-2 pl-5">
                      {section.bullets.map((bullet) => (
                        <li key={bullet}>{bullet}</li>
                      ))}
                    </ul>
                  ) : null}
                  {section.links ? (
                    <div className="flex flex-wrap gap-x-6 gap-y-3 pt-1">
                      {section.links.map((link) => (
                        <a
                          key={link.href}
                          href={link.href}
                          className="text-foreground decoration-brand font-semibold underline decoration-2 underline-offset-4 transition-colors hover:text-brand"
                        >
                          {link.label}
                        </a>
                      ))}
                    </div>
                  ) : null}
                </div>
              </section>
            ))}
          </div>

          <a
            href={`/${locale}`}
            className="border-foreground text-body-md inline-flex min-h-12 items-center rounded-full border px-6 font-semibold transition-colors hover:bg-muted"
          >
            {page.backHome}
          </a>
        </article>
      </main>
      <SiteFooter
        copy={copy}
        locale={locale}
        languagePaths={languagePaths}
      />
    </>
  );
}
