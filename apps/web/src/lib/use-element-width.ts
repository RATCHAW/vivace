import { useCallback, useState } from "react";

/**
 * The rendered width of an element, in CSS pixels, kept up to date.
 *
 * For the one question CSS can't answer on its own: how wide is a box whose
 * width falls out of its *height*? A 9:16 film handed whatever vertical space is
 * left on a phone is exactly that, and the controls above and below it have to
 * line up with an edge no sibling can read. So it is measured and handed back.
 *
 * A callback ref rather than `useRef` and an effect, so the node is measured the
 * instant it exists — and measured *there*, synchronously, rather than waiting
 * for the observer's first delivery. The observer's job is only to keep the
 * reading true afterwards; a hook that had nothing to say until its first
 * callback would show every sibling at the wrong width for a frame, and would
 * have nothing at all to say wherever those callbacks don't arrive.
 *
 * `getBoundingClientRect` rather than the entry's `contentRect`, because
 * `contentRect` stops inside the border and what a sibling has to line up with
 * is the edge you can see — on the film box, a hairline outside it.
 *
 * Null only before the node exists, and callers read that as "no constraint yet"
 * rather than as a width of zero. A detached node deliberately leaves the last
 * measurement standing: the film box is remounted whenever the template changes,
 * and blanking the width between the two would flick every control beside it out
 * to full width for a frame.
 */
export function useElementWidth<T extends Element>() {
  const [width, setWidth] = useState<number | null>(null);

  const ref = useCallback((node: T | null) => {
    if (!node) return;

    const measure = () => setWidth(node.getBoundingClientRect().width);
    measure();

    // jsdom, where the tests run, has no ResizeObserver — and the measurement
    // above is what makes that a missing update rather than a missing answer.
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return [ref, width] as const;
}
