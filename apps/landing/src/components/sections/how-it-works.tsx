import { MonoLabel } from "@/components/mono";
import type { Copy } from "@/i18n/dictionaries";

export function HowItWorks({ copy }: { copy: Copy }) {
  const t = copy.howItWorks;

  return (
    <section
      aria-labelledby="how-it-works-heading"
      className="px-6 pb-20 sm:px-8 sm:pb-30"
    >
      <h2 id="how-it-works-heading" className="sr-only">
        {t.label}
      </h2>
      {/* The 1px gutters are the border showing through, not three bordered
          cards — DESIGN.md: elevation is hairlines, never shadow. */}
      <div className="bg-border mx-auto grid w-full max-w-[1200px] gap-px overflow-hidden rounded-lg border sm:grid-cols-3">
        {t.steps.map((step) => (
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
