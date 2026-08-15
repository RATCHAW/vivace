/**
 * Where the athlete was going before they were asked who they are.
 *
 * A shared replay is how most people meet Vivace for the first time:
 * `use-share-run.ts` hands out `/replays?run=123` and the toast promises that
 * anyone signed in can open it. Signing in used to land every one of them on
 * the Overview with the run they were sent gone, because the redirect to
 * `/login` carried no memory of the destination and the OAuth callback was
 * hardcoded to `/`. The landing page's "try the coach" button had the same
 * hole. This module is that memory, and it is deliberately pure so the rules
 * below can be tested without a router.
 */

/** The query parameter the destination travels in. */
export const NEXT_PARAM = "next";

/** Where an athlete goes when they were not going anywhere in particular. */
export const DEFAULT_NEXT = "/";

/**
 * A destination is only ever a path on this origin.
 *
 * "Starts with a slash" is not the test: browsers read `//evil.example` and
 * `/\evil.example` as protocol-relative URLs, so an unchecked `next` is an
 * open redirect — and an open redirect on the *sign-in* route is the one that
 * matters, because the athlete has just been asked to trust the page.
 * `/login` is refused too: honouring it would send somebody who just signed in
 * back to the sign-in screen.
 */
export function safeNextPath(value: string | null | undefined): string {
  if (!value || !value.startsWith("/")) return DEFAULT_NEXT;
  if (value.startsWith("//") || value.startsWith("/\\")) return DEFAULT_NEXT;
  // Compare the path alone — `/login?lang=fr` is still the sign-in screen.
  if (value.split(/[?#]/)[0] === "/login") return DEFAULT_NEXT;
  return value;
}

/**
 * The sign-in URL that remembers where this athlete was headed.
 *
 * A destination that resolves to the default is left off entirely, so the
 * common case — someone opening the app at `/` — still gets a clean `/login`.
 */
export function signInPath(location: {
  pathname: string;
  search: string;
}): string {
  const target = `${location.pathname}${location.search}`;
  if (safeNextPath(target) === DEFAULT_NEXT) return "/login";
  return `/login?${NEXT_PARAM}=${encodeURIComponent(target)}`;
}
