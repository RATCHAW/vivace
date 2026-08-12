import { StravaIcon } from "@/components/icons";
import { Wordmark } from "@/components/wordmark";
import { ButtonLink } from "@/components/ui/button";
import { signInUrl } from "@/lib/site";

const nav = [
  { href: "#film", label: "The film" },
  { href: "#sports", label: "Sports" },
  { href: "#coach", label: "Coach" },
  { href: "#questions", label: "Questions" },
];

export function SiteHeader() {
  return (
    <header className="bg-background sticky top-0 z-20 flex h-16 items-center gap-4 border-b px-6 sm:gap-6 sm:px-8 lg:gap-10">
      <a href="#top" className="shrink-0" aria-label="Vivace — back to top">
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

      <div className="ml-auto flex items-center gap-5">
        <a
          href={signInUrl}
          className="text-body-md text-muted-foreground hover:text-foreground hidden font-semibold transition-colors sm:block"
        >
          Log in
        </a>
        {/* Stays a 48px pill on every screen (DESIGN.md); only the padding and
            the label size give way so it fits beside the wordmark at 320px. */}
        <ButtonLink
          href={signInUrl}
          className="text-body-sm px-4 sm:px-7 sm:text-body-md"
        >
          <StravaIcon className="text-strava size-4" />
          Connect Strava
        </ButtonLink>
      </div>
    </header>
  );
}
