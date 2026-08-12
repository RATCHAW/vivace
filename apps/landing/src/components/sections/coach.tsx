import { BrandBadge } from "@/components/mono";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { waitlistEmail } from "@/lib/site";

const conversation = [
  {
    from: "runner" as const,
    text: "Half marathon in October. I'm at 40 km a week — where do I start?",
  },
  {
    from: "coach" as const,
    text: "Your last four weeks sit at 5:33 /km and barely wobble — that's a base, so we add volume before speed. Twelve weeks: three easy, one long, tempo from week three.",
  },
  {
    from: "coach" as const,
    text: "Week 1 · long run Sunday, 14 km at 6:05 /km.",
  },
];

export function Coach() {
  return (
    <section
      id="coach"
      className="band-light bg-background text-foreground scroll-mt-16 px-6 py-20 sm:px-8 sm:py-30"
    >
      <div className="mx-auto grid w-full max-w-[1200px] items-center gap-16 lg:grid-cols-[minmax(0,1fr)_440px] lg:gap-18">
        <div className="flex flex-col gap-7">
          <BrandBadge>Coming soon</BrandBadge>
          <h2 className="font-heading text-display-xl text-balance">
            A coach that has read every run you&rsquo;ve done.
          </h2>
          <p className="text-body-lg text-muted-foreground max-w-[520px]">
            Ask for a plan, a taper, or an honest read on last week. It sees the
            same history the replays are built from — and answers with something
            you can run tomorrow.
          </p>

          {/* No waitlist backend yet, so the form opens a mail draft rather
              than swallowing the address. See lib/site.ts. */}
          <form
            action={`mailto:${waitlistEmail}`}
            method="post"
            encType="text/plain"
            className="flex max-w-[480px] items-center gap-3.5"
          >
            <label htmlFor="waitlist-email" className="sr-only">
              Email address
            </label>
            <Input
              id="waitlist-email"
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="you@email.com"
              // `color-scheme: dark` is set for the black canvas, so the field
              // inside a white band has to name its own ink.
              className="text-foreground placeholder:text-stone flex-1"
            />
            <Button type="submit">Join waitlist</Button>
          </form>
        </div>

        <div className="bg-muted flex flex-col gap-4 rounded-lg border p-7">
          {conversation.map((message, i) => (
            <div
              key={i}
              className={
                message.from === "runner"
                  ? "bg-primary text-primary-foreground text-body-sm max-w-[78%] self-end rounded-[20px_20px_8px_20px] px-4.5 py-3.5"
                  : "bg-card text-card-foreground text-body-sm max-w-[88%] self-start rounded-[20px_20px_20px_8px] border px-4.5 py-3.5"
              }
            >
              {message.text}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
