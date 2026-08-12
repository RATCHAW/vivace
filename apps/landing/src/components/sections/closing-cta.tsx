import { StravaIcon } from "@/components/icons";
import { ButtonLink } from "@/components/ui/button";
import { signInUrl } from "@/lib/site";

export function ClosingCta() {
  return (
    <section aria-label="Get started" className="px-6 pb-20 sm:px-8 sm:pb-30">
      <div className="mx-auto flex w-full max-w-[1200px] flex-col items-center gap-7 rounded-xl border px-6 py-16 text-center sm:px-16 sm:py-22">
        <h2 className="font-heading text-display-xl max-w-[760px] text-balance">
          Your last run deserves better than a number.
        </h2>
        <p className="text-body-lg text-muted-foreground max-w-[520px]">
          Connect Strava and the first replay is ready before you&rsquo;ve
          finished stretching.
        </p>
        <ButtonLink size="lg" href={signInUrl}>
          <StravaIcon className="text-strava size-5" />
          Continue with Strava
        </ButtonLink>
      </div>
    </section>
  );
}
