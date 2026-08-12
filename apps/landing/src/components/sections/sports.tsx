import { BrandBadge, SoonBadge } from "@/components/mono";
import { cn } from "@/lib/utils";

const sports = [
  {
    name: "Run",
    body: "Route, splits, heart rate, elevation.",
    live: true,
  },
  {
    name: "Ride",
    body: "Speed, climbs, power where you have it.",
    live: false,
  },
  {
    name: "Weights",
    body: "Sets, load moved, session volume.",
    live: false,
  },
  {
    name: "Swim & hike",
    body: "Laps, pace per 100m, trail profile.",
    live: false,
  },
];

export function Sports() {
  return (
    <section id="sports" className="scroll-mt-16 px-6 py-20 sm:px-8 sm:py-30">
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-12">
        <div className="flex max-w-[720px] flex-col gap-5">
          <h2 className="font-heading text-display-xl text-balance">
            Runs now. More next.
          </h2>
          <p className="text-body-lg text-muted-foreground">
            We built the replay for running first because it&rsquo;s the hardest
            to make beautiful. The same treatment lands for the rest of your
            Strava activities as we go.
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {sports.map((sport) => (
            <div
              key={sport.name}
              className="bg-card flex min-h-[200px] flex-col gap-3 rounded-lg p-8"
            >
              {sport.live ? <BrandBadge>Live</BrandBadge> : <SoonBadge />}
              <h3
                className={cn(
                  "text-heading-lg mt-2",
                  !sport.live && "text-foreground/40",
                )}
              >
                {sport.name}
              </h3>
              <p
                className={cn(
                  "text-body-md",
                  sport.live ? "text-muted-foreground" : "text-stone",
                )}
              >
                {sport.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
