import { cn } from "@/lib/utils";
import { VivaceMark } from "@/components/vivace-mark";

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
      <VivaceMark
        className={cn("text-brand", size === "lg" ? "size-6" : "size-5")}
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
