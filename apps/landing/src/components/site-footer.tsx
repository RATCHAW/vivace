import { StravaIcon } from "@/components/icons";
import { LanguageSwitcher } from "@/components/language-switcher";
import { Wordmark } from "@/components/wordmark";
import type { Locale } from "@/i18n/config";
import { fill, type Copy } from "@/i18n/dictionaries";
import { signInUrl } from "@/lib/site";

export function SiteFooter({ copy, locale }: { copy: Copy; locale: Locale }) {
  const t = copy.footer;

  const columns = [
    {
      heading: t.product.heading,
      links: [
        { href: "#film", label: t.product.film },
        { href: "#sports", label: t.product.sports },
        { href: "#coach", label: t.product.coach },
      ],
    },
    {
      heading: t.company.heading,
      links: [
        { href: "#top", label: t.company.about },
        { href: "#questions", label: t.company.questions },
        { href: "#top", label: t.company.contact },
      ],
    },
    {
      heading: t.legal.heading,
      links: [
        { href: "#top", label: t.legal.privacy },
        { href: "#top", label: t.legal.terms },
        { href: "#top", label: t.legal.stravaData },
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
              <span className="text-body-sm font-semibold">
                {column.heading}
              </span>
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
            <LanguageSwitcher active={locale} copy={copy} className="-ml-2.5" />
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
