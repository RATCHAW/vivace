import { StravaIcon } from "@/components/icons";
import { ReplayPhone } from "@/components/replay-phone";
import { ButtonLink } from "@/components/ui/button";
import type { Locale } from "@/i18n/config";
import type { Copy } from "@/i18n/dictionaries";
import { signInUrl } from "@/lib/site";

/**
 * DESIGN.md {component.hero-band-dark}: display type on the true-black canvas,
 * one {component.button-primary} pill as the loudest pixel, and the product
 * itself facing it.
 */
export function Hero({ copy, locale }: { copy: Copy; locale: Locale }) {
  const t = copy.hero;

  return (
    <section id="top" className="scroll-mt-16 px-6 pt-20 pb-16 sm:px-8 sm:pt-30 sm:pb-24">
      <div className="mx-auto grid w-full max-w-[1200px] items-center gap-16 lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-18">
        <div className="flex flex-col gap-8">
          <span className="bg-card text-body-sm text-muted-foreground inline-flex h-9 items-center gap-2.5 self-start rounded-full px-4 font-semibold">
            <span className="bg-brand size-1.5 rounded-full" />
            {t.badge}
          </span>

          <h1 className="font-heading text-display-xxl text-balance">
            {t.titleLine1}
            <br />
            {t.titleLine2}
          </h1>

          <p className="text-body-lg text-muted-foreground max-w-[480px]">
            {t.body}
          </p>

          <div className="flex flex-wrap items-center gap-5">
            <ButtonLink size="lg" href={signInUrl(locale)}>
              <StravaIcon className="text-strava size-5" />
              {t.primaryCta}
            </ButtonLink>
            <ButtonLink size="lg" variant="outline" href="#film">
              {t.secondaryCta}
            </ButtonLink>
          </div>

          <span className="text-caption text-stone">{t.footnote}</span>
        </div>

        {/* The one client component on the page — it runs a rAF loop. Its
            strings are handed over as props rather than read from the
            dictionary, so only the ten it uses cross the boundary. */}
        <ReplayPhone copy={t.replay} />
      </div>
    </section>
  );
}
