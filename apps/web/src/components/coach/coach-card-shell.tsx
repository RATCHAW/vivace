// The furniture every coach card shares — the shell, the heading, the callout.
//
// Extracted from coach-cards.tsx so the drawn card (coach-drawn-card.tsx) can
// stand on the same surface as the five prebuilt ones without importing the
// whole catalogue of cards — that would be a cycle, since the catalogue's
// switch is what renders the drawn card.
import { type ReactNode } from "react";
import { CardHelp, type CardHelpId } from "@/components/coach/card-help";
import { cn } from "@/lib/utils";

/** The frame every card shares: elevated surface, hairline, 20px radius. */
export function CardShell({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "bg-card border-border max-w-[660px] overflow-hidden rounded-lg border",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function CardHeading({
  title,
  aside,
  help,
}: {
  title: string;
  aside?: ReactNode;
  /** Which entry of `help` explains this card, if any explains it. */
  help?: CardHelpId;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-body-sm font-semibold">{title}</span>
      {aside || help ? (
        <span className="flex shrink-0 items-center gap-2.5">
          {aside}
          {help ? <CardHelp id={help} /> : null}
        </span>
      ) : null}
    </div>
  );
}

/**
 * The sentence under a chart, with a coloured rule beside it. DESIGN.md keeps
 * accents out of button surfaces; a 3px rule beside a reading is illustration.
 */
export function Callout({
  tone = "brand",
  children,
}: {
  tone?: "brand" | "warn" | "alert";
  children: ReactNode;
}) {
  return (
    <div className="border-border flex items-stretch gap-2.5 border-t pt-4">
      <span
        className={cn(
          "w-[3px] shrink-0 rounded-full",
          tone === "alert" && "bg-chart-3",
          tone === "warn" && "bg-chart-5",
          tone === "brand" && "bg-brand",
        )}
      />
      <span className="text-caption leading-relaxed">{children}</span>
    </div>
  );
}
