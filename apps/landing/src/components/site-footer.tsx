import { StravaIcon } from "@/components/icons";
import { Wordmark } from "@/components/wordmark";
import { signInUrl } from "@/lib/site";

const columns = [
  {
    heading: "Product",
    links: [
      { href: "#film", label: "The film" },
      { href: "#sports", label: "Sports" },
      { href: "#coach", label: "Coach" },
    ],
  },
  {
    heading: "Company",
    links: [
      { href: "#top", label: "About" },
      { href: "#questions", label: "Questions" },
      { href: "#top", label: "Contact" },
    ],
  },
  {
    heading: "Legal",
    links: [
      { href: "#top", label: "Privacy" },
      { href: "#top", label: "Terms" },
      { href: "#top", label: "Strava data use" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="border-t px-6 pt-20 pb-12 sm:px-8">
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-14">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div className="flex flex-col gap-3.5">
            <Wordmark />
            <p className="text-body-sm text-stone max-w-[260px]">
              Replays for the runs you already did.
            </p>
            <a
              href={signInUrl}
              className="text-body-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Log in
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
            © {new Date().getFullYear()} vivace. Not affiliated with Strava,
            Inc.
          </span>
          <span className="text-caption text-stone inline-flex items-center gap-2">
            <StravaIcon className="text-strava size-3.5" />
            Powered by Strava
          </span>
        </div>
      </div>
    </footer>
  );
}
