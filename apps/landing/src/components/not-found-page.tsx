import { MonoLabel } from "@/components/mono";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import type { Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { homePagePaths } from "@/lib/metadata";
import { pageName, pagePaths, pageSummary, SITE_PAGES } from "@/lib/pages";

/**
 * The 404, as a directory rather than an apology.
 *
 * A wrong URL is where an agent that guessed a path and a person who mistyped
 * one both arrive, and both need the same answer: what does exist, and where
 * the machine-readable index of it is. Next's built-in 404 gives neither — an
 * agent that has to go back and crawl to recover from a typo mostly does not.
 *
 * A component rather than a `not-found.tsx`, because that file is rendered
 * without `params` and would have to read the language from a header — and one
 * `headers()` call inside the `[locale]` boundary drags every page under it out
 * of the static build. `proxy.ts` rewrites an unknown URL to `/{locale}/404`
 * instead, which is a route with params, prerenders in both languages, and
 * carries its 404 status on the rewrite.
 */
export function NotFoundPage({ locale }: { locale: Locale }) {
  const copy = getDictionary(locale);
  const t = copy.notFound;

  const agentFiles = [
    { href: "/llms.txt", label: copy.directory.llms },
    { href: "/llms-full.txt", label: copy.directory.llmsFull },
    { href: "/sitemap.xml", label: copy.directory.sitemap },
  ];

  const linkClass =
    "text-foreground decoration-brand hover:text-brand font-semibold underline decoration-2 underline-offset-4 transition-colors";

  return (
    <>
      <SiteHeader copy={copy} locale={locale} languagePaths={homePagePaths()} />
      <main
        id="top"
        className="band-light bg-background text-foreground px-6 py-20 sm:px-8 sm:py-28"
      >
        <article className="mx-auto w-full max-w-[820px]">
          <header className="border-border flex flex-col gap-6 border-b pb-12 sm:pb-16">
            <MonoLabel className="text-brand">{t.eyebrow}</MonoLabel>
            <h1 className="font-heading text-display-xl text-balance">
              {t.heading}
            </h1>
            <p className="text-body-lg text-muted-foreground max-w-[720px]">
              {t.lead}
            </p>
          </header>

          <div className="flex flex-col gap-12 py-12 sm:gap-16 sm:py-16">
            <section className="flex flex-col gap-5">
              <h2 className="text-heading-lg text-balance">
                {copy.directory.pagesHeading}
              </h2>
              <ul className="text-body-md text-muted-foreground flex flex-col gap-4">
                {SITE_PAGES.map((page) => {
                  const href = pagePaths(page)[locale];
                  return (
                    <li key={href} className="flex flex-col gap-1">
                      <a href={href} className={linkClass}>
                        {pageName(locale, page)}
                      </a>
                      <span>{pageSummary(locale, page)}</span>
                    </li>
                  );
                })}
              </ul>
            </section>

            <section className="flex flex-col gap-5">
              <h2 className="text-heading-lg text-balance">
                {copy.directory.agentsHeading}
              </h2>
              <div className="text-body-md text-muted-foreground flex flex-col gap-4">
                <p>{copy.directory.agentsLead}</p>
                <ul className="list-disc space-y-2 pl-5">
                  {agentFiles.map((file) => (
                    <li key={file.href}>
                      <a href={file.href} className={linkClass}>
                        {file.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          </div>

          <a
            href={`/${locale}`}
            className="border-foreground text-body-md hover:bg-muted inline-flex min-h-12 items-center rounded-full border px-6 font-semibold transition-colors"
          >
            {t.backHome}
          </a>
        </article>
      </main>
      <SiteFooter copy={copy} locale={locale} languagePaths={homePagePaths()} />
    </>
  );
}
