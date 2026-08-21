import { useCallback, useLayoutEffect, useRef } from "react";

/**
 * How long a row takes to travel to its new place in the list.
 *
 * At the short end of what a *movement* is allowed to be: a reorder is the
 * answer to a click, so it has to read as a consequence rather than as a
 * playback. Anything past ~300ms and the list stops feeling like it obeyed.
 */
const DURATION_MS = 260;

/**
 * `--ease-drawer`, written out because a Web Animations keyframe takes a
 * string and not a custom property. Same curve as the sheets: it commits
 * immediately — which is what makes the click feel answered — and decelerates
 * into the new slot instead of coasting to a stop.
 */
const EASING = "cubic-bezier(0.32, 0.72, 0, 1)";

/** Under a pixel of travel is a re-measure, not a move. */
const MIN_TRAVEL_PX = 1;

/** How far the element is currently drawn from where the layout puts it. */
function currentShift(node: HTMLElement): number {
  if (typeof DOMMatrixReadOnly === "undefined") return 0;
  const { transform } = getComputedStyle(node);
  if (!transform || transform === "none") return 0;
  return new DOMMatrixReadOnly(transform).m42;
}

function prefersReducedMotion(): boolean {
  return (
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * Makes a list that reorders itself do it by moving rather than by cutting.
 *
 * FLIP: every registered row's position is remembered after each render, and
 * when the next one puts it somewhere else the row is drawn back where it was
 * and animated to where it now is. Only `transform` moves, so the layout is
 * already final — nothing below reflows while the row travels, and a row that
 * didn't move costs nothing.
 *
 * Positions are read as `offsetTop` rather than from `getBoundingClientRect`,
 * because the list lives in a scroll container: a viewport-relative reading
 * goes stale the moment the athlete scrolls without re-rendering, and the next
 * reorder would then animate the scroll distance as if it were travel.
 *
 * A row interrupted mid-flight resumes from where it is on screen instead of
 * snapping to its new slot and starting again — the running animation's own
 * offset is folded into the next one's starting point. That is the difference
 * between pinning two conversations in a row and pinning one twice.
 *
 * Reduced motion gets the reorder without the journey, which is the whole point
 * of the setting: the list still tells the truth, it just doesn't travel.
 *
 * ```tsx
 * const registerRow = useReorderAnimation();
 * …
 * <li ref={registerRow(thread.id)} />
 * ```
 */
export function useReorderAnimation() {
  const nodes = useRef(new Map<string, HTMLElement>());
  const tops = useRef(new Map<string, number>());
  // One ref callback per key, kept, so a re-render doesn't detach and re-attach
  // every row — which would drop the position it is measured against.
  const refs = useRef(new Map<string, (node: HTMLElement | null) => void>());

  const register = useCallback((key: string) => {
    const existing = refs.current.get(key);
    if (existing) return existing;

    const ref = (node: HTMLElement | null) => {
      if (node) nodes.current.set(key, node);
      else nodes.current.delete(key);
    };
    refs.current.set(key, ref);
    return ref;
  }, []);

  // Deliberately every render, and deliberately *layout*: the measurement has
  // to happen after the DOM has the new order and before the browser has
  // painted it, or the row is seen in its new slot for a frame first.
  useLayoutEffect(() => {
    const previous = tops.current;
    const next = new Map<string, number>();

    for (const [key, node] of nodes.current) {
      const top = node.offsetTop;
      next.set(key, top);

      const was = previous.get(key);
      // No previous reading is a row that has just arrived. It enters where it
      // belongs; only the rows it displaced have somewhere to travel from.
      if (was === undefined) continue;

      // jsdom has neither, and a list that can't animate still has to render.
      if (typeof node.animate !== "function") continue;
      if (typeof node.getAnimations !== "function") continue;
      if (prefersReducedMotion()) continue;

      const from = was - top + currentShift(node);
      if (Math.abs(from) < MIN_TRAVEL_PX) continue;

      // Read the shift first, then clear the flight it came from — two
      // animations racing on one transform is how a row ends up somewhere
      // neither of them meant.
      for (const animation of node.getAnimations()) animation.cancel();
      node.animate(
        [
          { transform: `translateY(${from}px)` },
          { transform: "translateY(0px)" },
        ],
        { duration: DURATION_MS, easing: EASING },
      );
    }

    // Built from what is mounted, so a row that has left the list drops out of
    // both maps here rather than being forgotten when its ref was detached.
    // That distinction is the whole reason the ref callback only touches
    // `nodes`: a key evicted from `refs` while its row is still on screen gets
    // a *different* callback on the next render, which React reads as a new
    // ref — it detaches the old one, and the position the row was about to
    // travel from goes with it. StrictMode's mount/unmount/mount is exactly
    // that sequence, so the bug would only ever have shown up in development.
    tops.current = next;
    for (const key of refs.current.keys()) {
      if (!nodes.current.has(key)) refs.current.delete(key);
    }
  });

  return register;
}
