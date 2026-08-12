import { AppHeader } from "@/components/app-header";
import { MonoLabel } from "@/components/mono";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** The conversation shown behind the scrim. Copy, not data — nothing here is
 *  generated, and the surface says so. */
const PREVIEW_THREAD = [
  {
    from: "athlete",
    text: "I want to run a half in October and I'm at 40 km a week. Where do I start?",
  },
  {
    from: "coach",
    text: "40 km is a solid base — your last four weeks are steady at 5:33 /km, so we build volume, not speed, first. Twelve weeks: three easy runs, one long, one tempo from week three.",
  },
  {
    from: "coach",
    text: "Week 1 · long run Sunday, 14 km at 6:05 /km. Want it on your calendar?",
  },
] as const;

const CAPABILITIES = [
  "Build a plan around the races you enter",
  "Adjust the week when you miss a session",
  "Flag when your easy runs are too fast",
  "Read a replay with you, split by split",
];

function Bubble({ from, text }: { from: "athlete" | "coach"; text: string }) {
  return (
    <div
      className={cn(
        "text-body-sm max-w-[80%] px-4.5 py-3.5 leading-relaxed",
        from === "athlete"
          ? "bg-primary text-primary-foreground self-end rounded-lg rounded-br-sm"
          : "bg-background self-start rounded-lg rounded-bl-sm border",
      )}
    >
      {text}
    </div>
  );
}

export function Coach() {
  return (
    <>
      <AppHeader />

      <main className="mx-auto grid w-full max-w-[1200px] items-start gap-12 px-6 pt-14 pb-24 sm:px-8 lg:grid-cols-[minmax(0,1fr)_420px]">
        <section className="flex flex-col gap-7">
          <div className="flex flex-col gap-4">
            {/* {component.badge-feature} — the single cobalt stamp */}
            <Badge className="bg-brand text-brand-foreground self-start">
              Coming soon
            </Badge>
            <h1 className="font-heading text-display-lg text-balance">
              A coach who has read every run you&rsquo;ve done
            </h1>
            <p className="text-body-lg text-muted-foreground max-w-[560px]">
              Ask for a plan, a taper, or an honest read on last week. The coach
              sees your Strava history — pace, heart rate, volume — and answers
              with something you can actually run tomorrow.
            </p>
          </div>

          <Card className="relative gap-0 py-0" aria-label="Coach preview">
            <div
              className="flex flex-col gap-4.5 px-7 pt-7"
              aria-hidden
              inert
            >
              {PREVIEW_THREAD.map((message) => (
                <Bubble key={message.text} from={message.from} text={message.text} />
              ))}
              <div className="bg-background flex gap-1.5 self-start rounded-lg border px-4.5 py-4">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="size-1.5 animate-pulse rounded-full bg-foreground"
                    style={{ animationDelay: `${i * 0.2}s` }}
                  />
                ))}
              </div>
            </div>

            {/* Extra room below the composer is the band the PREVIEW stamp
                sits in, so the two never overlap. */}
            <div
              className="mt-6 flex items-center gap-3.5 border-t px-7 pt-5 pb-14"
              aria-hidden
              inert
            >
              <Input placeholder="Ask your coach anything…" className="flex-1" />
              <Button disabled>Send</Button>
            </div>

            {/* The scrim is the honesty: the flow is designed, not running. */}
            <div className="absolute inset-0 bg-gradient-to-b from-background/35 to-background/75" />
            <MonoLabel className="text-muted-foreground absolute bottom-7 left-7">
              Preview · not yet live
            </MonoLabel>
          </Card>
        </section>

        <aside className="flex flex-col gap-8">
          <Card className="bg-background">
            <CardContent className="flex flex-col gap-5">
              <CardTitle className="text-heading-sm">Be first in line</CardTitle>
              <p className="text-body-sm text-stone">
                We&rsquo;ll open the coach to a small group of runners already
                syncing with Strava.
              </p>
              <div className="flex flex-col gap-3">
                <Input type="email" placeholder="you@email.com" disabled />
                <Button disabled>Join the waitlist</Button>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-background">
            <CardContent className="flex flex-col gap-4">
              <CardTitle className="text-heading-sm">What it will do</CardTitle>
              <ul className="divide-y divide-border border-t">
                {CAPABILITIES.map((item) => (
                  <li
                    key={item}
                    className="text-body-sm text-muted-foreground py-3.5"
                  >
                    {item}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </aside>
      </main>
    </>
  );
}
