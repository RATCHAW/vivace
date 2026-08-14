import { StravaIcon } from "@/components/icons";
import { LanguageSwitcher } from "@/components/language-switcher";
import { Wordmark } from "@/components/wordmark";
import type { Locale } from "@/i18n/config";
import { contentPagePath } from "@/i18n/content-pages";
import { fill, type Copy } from "@/i18n/dictionaries";
import { signInUrl } from "@/lib/site";

export function SiteFooter({
  copy,
  locale,
  languagePaths,
}: {
  copy: Copy;
  locale: Locale;
  languagePaths?: Record<Locale, string>;
}) {
  const t = copy.footer;
  const homeHref = `/${locale}`;

  const columns = [
    {
      heading: t.product.heading,
      links: [
        { href: `${homeHref}#film`, label: t.product.film },
        { href: `${homeHref}#sports`, label: t.product.sports },
        { href: `${homeHref}#coach`, label: t.product.coach },
      ],
    },
    {
      heading: t.company.heading,
      links: [
        { href: contentPagePath(locale, "about"), label: t.company.about },
        { href: `${homeHref}#questions`, label: t.company.questions },
        { href: contentPagePath(locale, "contact"), label: t.company.contact },
      ],
    },
    {
      heading: t.legal.heading,
      links: [
        { href: contentPagePath(locale, "privacy"), label: t.legal.privacy },
        { href: contentPagePath(locale, "terms"), label: t.legal.terms },
        {
          href: contentPagePath(locale, "stravaData"),
          label: t.legal.stravaData,
        },
      ],
    },
  ];

  return (
    <footer className="border-t px-6 pt-20 pb-12 sm:px-8">
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-14">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div className="flex flex-col gap-3.5">
            <Wordmark />
            <p className="text-body-sm text-stone max-w-[260px]">{t.tagline}</p>
            <a
              href={signInUrl(locale)}
              className="text-body-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              {t.logIn}
            </a>
          </div>

          {columns.map((column) => (
            <div key={column.heading} className="flex flex-col gap-3">
              <h2 className="text-body-sm font-semibold">{column.heading}</h2>
              {column.links.map((link) => (
                <a
                  key={link.label}
                  href={link.href}
                  className="text-body-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  {link.label}
                </a>
              ))}
            </div>
          ))}
        </div>

        <div className="border-divider-soft flex flex-wrap items-center justify-between gap-6 border-t pt-7">
          <span className="text-caption text-stone">
            {fill(t.copyright, { year: new Date().getFullYear() })}
          </span>
          <div className="flex flex-wrap items-center gap-6">
            {/* Repeated from the header: somebody who reads to the bottom in the
                wrong language shouldn't have to scroll back up to say so. */}
            <LanguageSwitcher
              active={locale}
              copy={copy}
              paths={languagePaths}
              className="-ml-2.5"
            />
            <span className="text-caption text-stone inline-flex items-center gap-2">
              <StravaIcon className="text-strava size-3.5" />
              {t.poweredByStrava}
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
