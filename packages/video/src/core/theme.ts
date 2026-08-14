/**
 * The three looks a video can be cut in — exactly three, shared by every
 * template, and no generated palettes.
 *
 * Every literal traces back to a DESIGN.md token, the same way the inline styles
 * in `overlay.tsx` do: a composition is also rendered headlessly, where no
 * stylesheet is loaded, so it cannot reach for a CSS variable.
 *
 * React-free — apps/api validates the athlete's choice against `THEME_NAMES`.
 */

export interface Theme {
  name: ThemeName;
  /** Shown in the picker. */
  label: string;
  /** The one-liner under the picker. */
  description: string;
  /** The plate everything sits on. */
  canvas: string;
  /** A panel or a bar's track, one step off the canvas. */
  surface: string;
  ink: string;
  inkMuted: string;
  inkFaint: string;
  hairline: string;
  /** Illustration ink: bars, the route trace, a cell's fill. */
  accent: string;
  /** The one thing that is louder than the accent — the fastest split, the
   *  finish marker. Never a second colour, only a second weight of the first. */
  accentStrong: string;
  /** What a numeral that owns the screen is painted in. */
  hero: string;
  /** The Vivace mark in the lockup. */
  markInk: string;
  /** Film grain over the flat canvas, 0–1. Flat colour at 1080×1920 bands on a
   *  phone's OLED; a few percent of noise is what stops it. */
  grain: number;
}

/** Non-empty by construction, which is what `z.enum` wants on the API side. */
export const THEME_NAMES = ["charcoal", "cream", "accent"] as const;

export type ThemeName = (typeof THEME_NAMES)[number];

export const DEFAULT_THEME: ThemeName = "charcoal";

export const THEMES: Record<ThemeName, Theme> = {
  /** The house look, and the one the replay has always been cut in. */
  charcoal: {
    name: "charcoal",
    label: "Charcoal",
    description: "White type on black, cobalt illustration. The house look.",
    // {colors.canvas-dark}
    canvas: "#000000",
    // {colors.surface-elevated}
    surface: "#16181a",
    // {colors.on-dark}
    ink: "#ffffff",
    inkMuted: "rgba(255,255,255,0.72)",
    inkFaint: "rgba(255,255,255,0.55)",
    // {colors.hairline-dark}
    hairline: "rgba(255,255,255,0.12)",
    // {colors.primary} / {colors.primary-bright}
    accent: "#494fdf",
    accentStrong: "#4f55f1",
    hero: "#ffffff",
    markInk: "#494fdf",
    grain: 0.045,
  },
  /** The framable one: paper, not screen. */
  cream: {
    name: "cream",
    label: "Cream",
    description: "Ink on paper. The one that looks like a print, not a screen.",
    // {colors.surface-soft} — off-white reads as stock; pure white reads as a page.
    canvas: "#f4f4f4",
    // {colors.canvas-light}
    surface: "#ffffff",
    // {colors.ink}
    ink: "#191c1f",
    // {colors.mute} / {colors.stone}
    inkMuted: "#505a63",
    inkFaint: "#8d969e",
    // {colors.hairline-light}
    hairline: "#e2e2e7",
    // {colors.primary} / {colors.primary-deep} — the deep step is what holds up
    // against paper, where the bright one glows.
    accent: "#494fdf",
    accentStrong: "#3a40c4",
    hero: "#191c1f",
    markInk: "#494fdf",
    grain: 0.03,
  },
  /** Cobalt doing the work: the numerals are the brand, the highlight is white. */
  accent: {
    name: "accent",
    label: "Cobalt",
    description: "The numbers in brand cobalt on black. The loud one.",
    canvas: "#000000",
    surface: "#16181a",
    ink: "#ffffff",
    inkMuted: "rgba(255,255,255,0.72)",
    inkFaint: "rgba(255,255,255,0.55)",
    hairline: "rgba(255,255,255,0.12)",
    // {colors.primary-bright}, and the highlight inverts to {colors.on-dark}:
    // on this theme the accent is the field, so the loudest thing can't also be it.
    accent: "#4f55f1",
    accentStrong: "#ffffff",
    hero: "#4f55f1",
    markInk: "#ffffff",
    grain: 0.05,
  },
};

export function isThemeName(value: string): value is ThemeName {
  return (THEME_NAMES as readonly string[]).includes(value);
}

/** The theme for a name, falling back to the default rather than throwing —
 *  this is read from stored rows and from `inputProps` the browser sent. */
export function getTheme(name: string | null | undefined): Theme {
  return THEMES[name && isThemeName(name) ? name : DEFAULT_THEME];
}
