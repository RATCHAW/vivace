import { StravaIcon } from "@/components/icons";
import { LanguageSwitcher } from "@/components/language-switcher";
import { Wordmark } from "@/components/wordmark";
import { ButtonLink } from "@/components/ui/button";
import type { Locale } from "@/i18n/config";
import type { Copy } from "@/i18n/dictionaries";
import { signInUrl } from "@/lib/site";

export function SiteHeader({ copy, locale }: { copy: Copy; locale: Locale }) {
  const nav = [
    { href: "#film", label: copy.header.film },
    { href: "#sports", label: copy.header.sports },
    { href: "#coach", label: copy.header.coach },
    { href: "#questions", label: copy.header.questions },
  ];

  return (
    <header className="bg-background sticky top-0 z-20 flex h-16 items-center gap-4 border-b px-6 sm:gap-6 sm:px-8 lg:gap-10">
      <a href="#top" className="shrink-0" aria-label={copy.header.backToTop}>
        <Wordmark />
      </a>

      <nav className="text-body-md hidden items-center gap-7 font-semibold md:flex">
        {nav.map((item) => (
          <a
            key={item.href}
            href={item.href}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            {item.label}
          </a>
        ))}
      </nav>

      <div className="ml-auto flex items-center gap-2 sm:gap-4">
        {/* Not on a phone: the wordmark and the pill already fill a 320px row,
            and neither may shrink. `proxy.ts` has usually chosen the right
            language from `Accept-Language` by then, and the footer carries the
            same switcher for when it hasn't. */}
        <LanguageSwitcher
          active={locale}
          copy={copy}
          className="hidden sm:flex"
        />
        <a
          href={signInUrl(locale)}
          className="text-body-md text-muted-foreground hover:text-foreground hidden font-semibold transition-colors sm:block"
        >
          {copy.header.logIn}
        </a>
        {/* Stays a 48px pill on every screen (DESIGN.md); only the padding and
            the label size give way so it fits beside the wordmark at 320px. */}
        <ButtonLink
          href={signInUrl(locale)}
          className="text-body-sm px-4 sm:px-7 sm:text-body-md"
        >
          <StravaIcon className="text-strava size-4" />
          {copy.header.connectStrava}
        </ButtonLink>
      </div>
    </header>
  );
}
