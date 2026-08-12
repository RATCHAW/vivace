import type { SVGProps } from "react";

/**
 * The Vivace mark — "Continuous chevron · 1a".
 *
 * One unbroken stroke doubling back on itself: a chevron, a play triangle and
 * an accent mark at once. Drawn on the source 1024 grid with the arms at ±30°
 * from the horizontal and an 8° forward tilt, then baked into a 24-unit box so
 * it drops in beside lucide icons at the same optical weight (glyph spans 20 of
 * 24 units, same as theirs).
 *
 * Single colour only — it inherits `currentColor`. DESIGN.md's rule holds:
 * cobalt when it is the brand stamp, otherwise ink on canvas-light and white on
 * canvas-dark. Never two colours, never a gradient.
 */
export function VivaceMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M6.208 2.077 22 14.415 3.419 21.923 2 18.412 20.611 14.22 3.876 5.061Z" />
    </svg>
  );
}
