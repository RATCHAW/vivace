import type { SVGProps } from "react";

/**
 * The Vivace mark — "Continuous chevron · 1a".
 *
 * This is the same single-colour glyph used by the signed-in app and Remotion
 * exports. It inherits `currentColor` so each surface supplies the right ink.
 */
export function VivaceMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M6.208 2.077 22 14.415 3.419 21.923 2 18.412 20.611 14.22 3.876 5.061Z" />
    </svg>
  );
}
