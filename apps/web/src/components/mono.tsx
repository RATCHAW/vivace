import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

/**
 * The wide-tracked mono eyebrow that sits above a number — DISTANCE · 2026,
 * SPLITS, 8 ACTIVITIES · SYNCED FROM STRAVA. Instrumentation, never copy: it is
 * always uppercase and always shorter than a sentence.
 */
export function MonoLabel({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      className={cn(
        "text-mono-label text-stone font-mono uppercase",
        className,
      )}
      {...props}
    />
  );
}

/** The stamp on a surface that exists but does not work yet. */
export function SoonBadge({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <Badge
      variant="ghost"
      className={cn(
        "text-mono-badge text-stone px-0 font-mono uppercase",
        className,
      )}
      {...props}
    >
      Soon
    </Badge>
  );
}
