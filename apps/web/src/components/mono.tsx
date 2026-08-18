import { useTranslation } from "react-i18next";
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
export function SoonBadge({
  className,
  ...props
}: React.ComponentProps<"span">) {
  const { t } = useTranslation();

  return (
    <Badge
      variant="ghost"
      className={cn(
        "text-mono-badge text-stone px-0 font-mono uppercase",
        className,
      )}
      {...props}
    >
      {t("soon")}
    </Badge>
  );
}

/**
 * The stamp on something that has just landed — `SoonBadge`'s opposite, and cut
 * from the same mono cloth so the two read as one family.
 *
 * Cobalt, filled: DESIGN.md keeps the accent for exactly this (`badge-feature`,
 * "New" / "Most popular"), which is a mark on one row of a list rather than a
 * colour the UI wears. Only one may be on screen at a time — the accent stops
 * meaning anything the moment there are two.
 */
export function NewBadge({
  className,
  ...props
}: React.ComponentProps<"span">) {
  const { t } = useTranslation();

  return (
    <Badge
      className={cn(
        "text-mono-badge bg-brand px-2.5 py-1 font-mono text-brand-foreground uppercase",
        className,
      )}
      {...props}
    >
      {t("new")}
    </Badge>
  );
}
