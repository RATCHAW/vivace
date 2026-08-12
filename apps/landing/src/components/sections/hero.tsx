import { StravaIcon } from "@/components/icons";
import { ReplayPhone } from "@/components/replay-phone";
import { ButtonLink } from "@/components/ui/button";
import { signInUrl } from "@/lib/site";

/**
 * DESIGN.md {component.hero-band-dark}: display type on the true-black canvas,
 * one {component.button-primary} pill as the loudest pixel, and the product
 * itself facing it.
 */
export function Hero() {
  return (
    <section id="top" className="scroll-mt-16 px-6 pt-20 pb-16 sm:px-8 sm:pt-30 sm:pb-24">
      <div className="mx-auto grid w-full max-w-[1200px] items-center gap-16 lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-18">
        <div className="flex flex-col gap-8">
          <span className="bg-card text-body-sm text-muted-foreground inline-flex h-9 items-center gap-2.5 self-start rounded-full px-4 font-semibold">
            <span className="bg-brand size-1.5 rounded-full" />
            Runs today · rides, lifts &amp; swims next
          </span>

          <h1 className="font-heading text-display-xxl text-balance">
            Every run,
            <br />
            a story.
          </h1>

          <p className="text-body-lg text-muted-foreground max-w-[480px]">
            Connect Strava once. Every activity comes back as a vertical film —
            your route drawing itself, your pace and heart rate as they
            happened, ready to share.
          </p>

          <div className="flex flex-wrap items-center gap-5">
            <ButtonLink size="lg" href={signInUrl}>
              <StravaIcon className="text-strava size-5" />
              Continue with Strava
            </ButtonLink>
            <ButtonLink size="lg" variant="outline" href="#film">
              See a replay
            </ButtonLink>
          </div>

          <span className="text-caption text-stone">
            Free while we&rsquo;re in alpha. We never post to Strava on your
            behalf.
          </span>
        </div>

        <ReplayPhone />
      </div>
    </section>
  );
}
