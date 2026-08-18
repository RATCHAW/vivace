/**
 * The key plate: the same film, cut so its background can be removed.
 *
 * A greenscreen video is not a fourth look — it is a *delivery format*. The
 * athlete takes the file into whatever they edit stories in, keys the green
 * away and drops their own footage behind the numbers, so every template
 * honours the option and the theme stays whatever they chose.
 *
 * Three rules make a file keyable, and they are the whole of this module:
 *
 * 1. **The canvas is one flat, saturated colour** nothing else in the palette
 *    comes near. A keyer works on chroma distance, so the further the plate is
 *    from every ink in the frame, the cleaner the cut.
 * 2. **No grain.** The noise that stops a flat canvas banding on an OLED is the
 *    one thing a chroma key cannot forgive: every speckle is a pixel of another
 *    colour, and the matte comes out crawling.
 * 3. **Nothing informational is translucent.** A 72%-white label over the plate
 *    composites to pale green, and the key eats it along with the background.
 *    Every ink is flattened over the canvas it was designed against first, so it
 *    keeps the weight it had and comes out opaque.
 *
 * React-free, like the rest of `core/` that apps/api can reach.
 */
import { getTheme, THEMES, type Theme, type ThemeName } from "./theme";

/**
 * The plate itself — Rosco's chroma key green, the one every editor's "green
 * screen" preset is centred on.
 *
 * Not pure `#00ff00`: h264 stores colour at a quarter of the luma resolution,
 * and a primary that sits on the edge of the gamut fringes along every letter
 * when it is subsampled. This one has headroom on both sides and still leaves
 * the whole palette — white, black, cobalt, cream — nowhere near it.
 */
export const KEY_COLOR = "#00b140";

interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

/** `#rgb`, `#rrggbb`, `rgb(…)` and `rgba(…)`; null for anything else, which is
 *  returned unchanged rather than guessed at. */
function parseColor(color: string): Rgba | null {
  const value = color.trim();

  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value);
  if (hex) {
    const digits =
      hex[1].length === 3
        ? hex[1]
            .split("")
            .map((digit) => digit + digit)
            .join("")
        : hex[1];
    return {
      r: parseInt(digits.slice(0, 2), 16),
      g: parseInt(digits.slice(2, 4), 16),
      b: parseInt(digits.slice(4, 6), 16),
      a: 1,
    };
  }

  const rgb =
    /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(
      value,
    );
  if (!rgb) return null;
  return {
    r: Number(rgb[1]),
    g: Number(rgb[2]),
    b: Number(rgb[3]),
    a: rgb[4] === undefined ? 1 : Number(rgb[4]),
  };
}

const hex = (channel: number) =>
  Math.max(0, Math.min(255, Math.round(channel)))
    .toString(16)
    .padStart(2, "0");

/**
 * One colour as it *looked* over another, as an opaque hex.
 *
 * This is what keeps a flattened palette recognisable: the muted label on the
 * key plate is the exact grey it was over black, so the greenscreen cut is the
 * charcoal cut with the background taken out — not a second design.
 */
export function flattenOver(color: string, backdrop: string): string {
  const front = parseColor(color);
  const back = parseColor(backdrop);
  // A gradient, a named colour, `currentColor`: not ours to rewrite. The
  // templates only paint with the palette, so this is unreachable through the
  // themes — it is here so a future literal degrades to unchanged, not to black.
  if (!front || !back) return color;
  if (front.a >= 1) return `#${hex(front.r)}${hex(front.g)}${hex(front.b)}`;

  const mix = (over: number, under: number) =>
    over * front.a + under * (1 - front.a);
  return `#${hex(mix(front.r, back.r))}${hex(mix(front.g, back.g))}${hex(mix(front.b, back.b))}`;
}

/** The same look, cut for keying — see the three rules at the top. */
export function greenscreenTheme(theme: Theme): Theme {
  const opaque = (color: string) => flattenOver(color, theme.canvas);
  return {
    ...theme,
    canvas: KEY_COLOR,
    // The canvas is about to be cut away; anything drawn *as* it keeps the real
    // one, so a punched-out marker stays a disc instead of becoming a hole.
    plate: theme.canvas,
    grain: 0,
    surface: opaque(theme.surface),
    ink: opaque(theme.ink),
    inkMuted: opaque(theme.inkMuted),
    inkFaint: opaque(theme.inkFaint),
    hairline: opaque(theme.hairline),
    accent: opaque(theme.accent),
    accentStrong: opaque(theme.accentStrong),
    hero: opaque(theme.hero),
    markInk: opaque(theme.markInk),
  };
}

/** Built once: the flattening is pure, and a template asks for its theme on
 *  every frame of every render. */
const GREENSCREEN_THEMES = Object.fromEntries(
  Object.entries(THEMES).map(([name, theme]) => [
    name,
    greenscreenTheme(theme),
  ]),
) as Record<ThemeName, Theme>;

/**
 * What a template paints with: the athlete's look, on the plate they asked for.
 *
 * Every template calls this rather than `getTheme` — the greenscreen option is
 * catalogue-wide, and a template that forgot it would render a film the athlete
 * cannot key.
 */
export function videoTheme(
  name: string | null | undefined,
  greenscreen: boolean | undefined,
): Theme {
  const theme = getTheme(name);
  return greenscreen ? GREENSCREEN_THEMES[theme.name] : theme;
}
