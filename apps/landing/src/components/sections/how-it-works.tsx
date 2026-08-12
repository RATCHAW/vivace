import { MonoLabel } from "@/components/mono";

const steps = [
  {
    step: "01",
    title: "Connect Strava",
    body: "One tap. It's the only sign-in — no second password to remember.",
  },
  {
    step: "02",
    title: "Pick a run",
    body: "Your whole history lands in a list — GPS, splits and heart rate included.",
  },
  {
    step: "03",
    title: "Watch it back",
    body: "The replay renders in seconds. Watch it, download the MP4, post it.",
  },
];

export function HowItWorks() {
  return (
    <section aria-label="How it works" className="px-6 pb-20 sm:px-8 sm:pb-30">
      {/* The 1px gutters are the border showing through, not three bordered
          cards — DESIGN.md: elevation is hairlines, never shadow. */}
      <div className="bg-border mx-auto grid w-full max-w-[1200px] gap-px overflow-hidden rounded-lg border sm:grid-cols-3">
        {steps.map((step) => (
          <div
            key={step.step}
            className="bg-background flex flex-col gap-3.5 px-9 py-10"
          >
            <MonoLabel>{step.step}</MonoLabel>
            <h3 className="text-heading-md">{step.title}</h3>
            <p className="text-body-md text-muted-foreground">{step.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
