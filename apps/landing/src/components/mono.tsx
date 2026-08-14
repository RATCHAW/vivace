import { cn } from "@/lib/utils";

/**
 * The wide-tracked mono eyebrow that sits above a number or a step — 01 · ROUTE,
 * PACE, 9:16 · READY FOR STORIES. Instrumentation, never copy: always uppercase
 * and always shorter than a sentence.
 */
export function MonoLabel({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      className={cn("text-mono-label text-stone font-mono uppercase", className)}
      {...props}
    />
  );
}

/**
 * The stamp on a sport we can replay, but not yet.
 *
 * The word is a child rather than baked in: this file has no access to the
 * dictionary — the page reads it once at the top and hands it down — so the
 * caller supplies `copy.soon`.
 */
export function SoonBadge({
  className,
  children,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      className={cn(
        "text-mono-label text-stone bg-foreground/8 self-start rounded-full px-3 py-1.5 font-mono uppercase",
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}

/** The cobalt counterpart: a sport, or a section, that is live now. */
export function BrandBadge({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      className={cn(
        "bg-brand text-brand-foreground text-caption self-start rounded-full px-3 py-1 font-semibold",
        className,
      )}
      {...props}
    />
  );
}
