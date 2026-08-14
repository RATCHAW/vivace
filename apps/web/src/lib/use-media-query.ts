import { useCallback, useSyncExternalStore } from "react";

/**
 * A CSS media query as React state.
 *
 * `useSyncExternalStore` rather than `useEffect`, because the first paint has to
 * be right: the runs screen renders a *different tree* either side of the
 * breakpoint — three columns above it, a full-screen studio below — and a frame
 * of the wrong branch would mount the Remotion player twice.
 *
 * Express the query in `rem` so it lines up with a Tailwind breakpoint
 * (`lg` is `64rem`); a `px` copy drifts the moment the scale is retuned.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    [query],
  );

  return useSyncExternalStore(
    supported() ? subscribe : noop,
    () => (supported() ? window.matchMedia(query).matches : false),
    // Server snapshot: the narrow branch, which is the one that degrades into
    // a plain stacked page rather than a fixed overlay over nothing.
    () => false,
  );
}

function supported(): boolean {
  return (
    typeof window !== "undefined" && typeof window.matchMedia === "function"
  );
}

function noop(): () => void {
  return () => {};
}
