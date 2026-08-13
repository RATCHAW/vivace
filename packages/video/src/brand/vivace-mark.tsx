import type { SVGProps } from "react";

/**
 * The Vivace mark — "Continuous chevron · 1a".
 *
 * Copied from `apps/web/src/components/vivace-mark.tsx`, on the same terms
 * apps/landing copies its primitives: this package is bundled by Remotion and
 * rendered headlessly on Lambda, where nothing from apps/web exists. A change to
 * the path belongs in both files — `vivace-mark.test.tsx` in apps/web fails if
 * they drift.
 *
 * Single colour only — it inherits `currentColor`.
 */
export function VivaceMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M6.208 2.077 22 14.415 3.419 21.923 2 18.412 20.611 14.22 3.876 5.061Z" />
    </svg>
  );
}
