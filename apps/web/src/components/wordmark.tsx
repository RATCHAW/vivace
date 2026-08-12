import { cn } from "@/lib/utils";

/**
 * The cobalt stamp and the name. DESIGN.md reserves `{colors.primary}` for the
 * wordmark and the featured card — at most one per viewport — so the dot here
 * is usually the only cobalt on screen.
 */
export function Wordmark({
  size = "sm",
  className,
}: {
  size?: "sm" | "lg";
  className?: string;
}) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <span
        className={cn(
          "bg-brand rounded-full",
          size === "lg" ? "size-3" : "size-2.5",
        )}
      />
      <span
        className={cn(
          "-tracking-[0.01em]",
          size === "lg" ? "text-heading-sm" : "text-body-md font-semibold",
        )}
      >
        vivace
      </span>
    </span>
  );
}
