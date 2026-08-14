/**
 * The story canvas every template is cut for, and the type ramp that sits on it.
 *
 * React-free on purpose: the eligibility rules and the duration estimates read
 * from here, and both of those are imported by apps/api. Nothing in this module
 * may reach for a component or for Remotion.
 */

export const CANVAS_WIDTH = 1080;
export const CANVAS_HEIGHT = 1920;
export const FPS = 30;

/**
 * The band a story's own UI leaves alone.
 *
 * Instagram covers the top with the poster's name and the bottom with the reply
 * bar, and TikTok is worse — so nothing that has to be read lives outside
 * `SAFE_TOP`…`SAFE_BOTTOM`. Illustration (the route, a bar that runs off the
 * frame, the grain) may cross it; a number may not.
 */
export const SAFE_TOP = 250;
export const SAFE_BOTTOM = 1600;

/** The side gutter, shared by every template so they read as one family. */
export const PAGE_INSET = 80;

export const SAFE_WIDTH = CANVAS_WIDTH - PAGE_INSET * 2;
export const SAFE_HEIGHT = SAFE_BOTTOM - SAFE_TOP;

/** Where the logo lockup sits, in every template, always. Low enough to read as
 *  a signature, high enough to clear the reply bar. */
export const LOGO_TOP = 1520;

/** Is this box inside the safe band? The templates' layout maths is pure, which
 *  is what lets the tests assert this instead of a human squinting at a frame. */
export function withinSafeArea(box: { top: number; height: number }): boolean {
  return box.top >= SAFE_TOP && box.top + box.height <= SAFE_BOTTOM;
}

export const FONT_SANS = "'Inter Variable', Inter, system-ui, sans-serif";
export const FONT_MONO =
  "'JetBrains Mono Variable', ui-monospace, SFMono-Regular, monospace";

/**
 * The type ramp for a 1080×1920 story, sized for a phone at arm's length.
 * Nothing informational goes below `caption`.
 *
 * `display` is a ceiling, not a size: a numeral that owns the screen is fitted
 * to the measure with `fitFontSize` and only reaches this when it is short
 * enough to.
 */
export const TYPE = {
  display: 520,
  hero: 176,
  title: 84,
  subtitle: 52,
  body: 40,
  /** Mono, tracked out — the eyebrow above every number. */
  label: 30,
  caption: 26,
} as const;

/** Tight optical tracking on the big numerals; anything smaller sits at 0. */
export const NUMERAL_TRACKING = -0.03;
/** Wide tracking on the small-caps unit labels. */
export const LABEL_TRACKING = 0.16;

/*
 * Fitting type without a DOM
 * --------------------------
 * A composition is laid out by Chromium on Lambda and by jsdom in a test, and
 * only one of those can measure a glyph. So the width of a numeral is estimated
 * from Inter's advance widths instead — deliberately rounded *up*, because the
 * only failure that matters is the one where the number runs off the frame.
 */

/** Advance width, in em, of the characters a metric is spelled with. */
function advanceEm(char: string): number {
  if (char >= "0" && char <= "9") return 0.62; // tabular figures
  if (char === "." || char === ":" || char === ",") return 0.3;
  if (char === " ") return 0.28;
  if (char === "/") return 0.38;
  if (char === "-" || char === "–" || char === "+") return 0.42;
  if (char >= "A" && char <= "Z") return 0.7;
  return 0.58;
}

/** Roughly how wide `text` renders at `fontSize`, tracking included. */
export function estimateTextWidth(
  text: string,
  fontSize: number,
  tracking = 0,
): number {
  let em = 0;
  for (const char of text) em += advanceEm(char) + tracking;
  return em * fontSize;
}

/** The largest size at which `text` still fits `maxWidth`, capped at `maxSize`.
 *  Rounded down to a whole pixel so the same string always fits the same way. */
export function fitFontSize(
  text: string,
  maxWidth: number,
  maxSize: number,
  tracking = NUMERAL_TRACKING,
): number {
  const unit = estimateTextWidth(text, 1, tracking);
  if (unit <= 0) return maxSize;
  return Math.floor(Math.min(maxSize, maxWidth / unit));
}
