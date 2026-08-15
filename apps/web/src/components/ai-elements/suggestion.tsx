"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ComponentProps } from "react";
import { useCallback } from "react";

export type SuggestionsProps = ComponentProps<"div">;

/**
 * One row, scrolled sideways.
 *
 * These wrapped once, on the reasoning that a 760px column fits four openers
 * and clipping the last one says nothing. But the column is only that wide with
 * both coach rails open — on a phone, or with the transcript at its narrowest,
 * three chips wrap to three rows and take 150px off the thread they sit under.
 * Scrolling costs one row whatever the width, and a chip cut by the edge is the
 * affordance the wrapped version was missing.
 *
 * The bar itself is hidden — a system that draws classic scrollbars put a grey
 * rail across the composer, which reads as a broken layout rather than as one
 * more chip. The canvas fades back in over the right edge instead, and because
 * the row is packed from the left there is nothing under that fade until the
 * chips actually overflow: the affordance appears exactly when it is true.
 *
 * `-m-1 p-1` is slack for the chips' focus ring, which sits outside the pill
 * and would otherwise be clipped — a scroll container clips both axes.
 */
export const Suggestions = ({
  className,
  children,
  ...props
}: SuggestionsProps) => (
  <div className={cn("relative", className)} {...props}>
    <div className="-m-1 flex items-center gap-2 overflow-x-auto p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {children}
    </div>
    <div
      aria-hidden
      className="from-background pointer-events-none absolute inset-y-0 right-0 w-10 bg-linear-to-l to-transparent"
    />
  </div>
);

export type SuggestionProps = Omit<ComponentProps<typeof Button>, "onClick"> & {
  suggestion: string;
  onClick?: (suggestion: string) => void;
};

export const Suggestion = ({
  suggestion,
  onClick,
  className,
  variant = "subtle",
  size = "sm",
  children,
  ...props
}: SuggestionProps) => {
  const handleClick = useCallback(() => {
    onClick?.(suggestion);
  }, [onClick, suggestion]);

  return (
    <Button
      className={cn("font-medium", className)}
      onClick={handleClick}
      size={size}
      type="button"
      variant={variant}
      {...props}
    >
      {children || suggestion}
    </Button>
  );
};
