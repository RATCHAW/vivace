import { StravaIcon } from "@/components/icons";
import { ButtonLink } from "@/components/ui/button";
import type { Locale } from "@/i18n/config";
import type { Copy } from "@/i18n/dictionaries";
import { signInUrl } from "@/lib/site";

export function ClosingCta({ copy, locale }: { copy: Copy; locale: Locale }) {
  const t = copy.closingCta;

  return (
    <section aria-label={t.label} className="px-6 pb-20 sm:px-8 sm:pb-30">
      <div className="mx-auto flex w-full max-w-[1200px] flex-col items-center gap-7 rounded-xl border px-6 py-16 text-center sm:px-16 sm:py-22">
        <h2 className="font-heading text-display-xl max-w-[760px] text-balance">
          {t.heading}
        </h2>
        <p className="text-body-lg text-muted-foreground max-w-[520px]">
          {t.body}
        </p>
        <ButtonLink size="lg" href={signInUrl(locale)}>
          <StravaIcon className="text-strava size-5" />
          {t.cta}
        </ButtonLink>
      </div>
    </section>
  );
}
