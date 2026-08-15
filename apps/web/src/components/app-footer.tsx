import { useTranslation } from "react-i18next";
import { currentLocale } from "@/i18n";
import { StravaIcon } from "@/components/icons";
import { CONTENT_PAGES, contentPageUrl } from "@/lib/site";

/**
 * The quiet end of every signed-in page.
 *
 * The app used to have no footer at all: three surfaces, each stopping at its
 * last card, with no route to the privacy policy, the terms, or what we do
 * with Strava's data. That is a strange thing to withhold from somebody who
 * has just connected their entire training history, and it left the Strava
 * attribution — which their API terms ask for — nowhere on the product.
 *
 * The destinations live on the marketing site, so these are absolute links off
 * this origin and deliberately plain `<a>` rather than router `<Link>`s.
 */
export function AppFooter() {
  const { t } = useTranslation();
  const locale = currentLocale();

  return (
    <footer className="border-border mt-auto border-t px-6 py-8 sm:px-8">
      <div className="text-caption text-stone mx-auto flex w-full max-w-[1200px] flex-wrap items-center gap-x-6 gap-y-3">
        {CONTENT_PAGES.map((page) => (
          <a
            className="hover:text-foreground transition-colors"
            href={contentPageUrl(locale, page)}
            key={page}
            rel="noreferrer"
            target="_blank"
          >
            {t(`footer.${page}`)}
          </a>
        ))}
        <span className="ml-auto inline-flex items-center gap-2">
          <StravaIcon className="text-strava size-3.5" />
          {t("footer.poweredByStrava")}
        </span>
      </div>
    </footer>
  );
}
