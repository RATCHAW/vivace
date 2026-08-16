import { describe, expect, it } from "vitest";
import { flattenOver, KEY_COLOR, videoTheme } from "./greenscreen";
import { THEME_NAMES, THEMES, type Theme } from "./theme";

/** Every colour a template can paint with, minus the plate itself. */
const inks = (theme: Theme): Array<[string, string]> =>
  (
    [
      "plate",
      "surface",
      "ink",
      "inkMuted",
      "inkFaint",
      "hairline",
      "accent",
      "accentStrong",
      "hero",
      "markInk",
    ] as const
  ).map((key) => [key, theme[key]]);

describe("flattenOver", () => {
  it("composites a translucent colour over its backdrop", () => {
    // 72% white over black is the grey it always looked like.
    expect(flattenOver("rgba(255,255,255,0.72)", "#000000")).toBe("#b8b8b8");
    expect(flattenOver("rgba(0,0,0,0.5)", "#ffffff")).toBe("#808080");
  });

  it("leaves an opaque colour alone, in whatever spelling", () => {
    expect(flattenOver("#494fdf", "#000000")).toBe("#494fdf");
    expect(flattenOver("#fff", "#000000")).toBe("#ffffff");
    expect(flattenOver("rgb(73, 79, 223)", "#ffffff")).toBe("#494fdf");
  });

  it("returns a colour it cannot read rather than guessing", () => {
    // A gradient or a keyword is not ours to rewrite; unchanged beats black.
    expect(flattenOver("currentColor", "#000000")).toBe("currentColor");
    expect(flattenOver("#494fdf", "linear-gradient(black, white)")).toBe(
      "#494fdf",
    );
  });
});

describe("the key plate", () => {
  it("leaves the look alone when the option is off", () => {
    for (const name of THEME_NAMES) {
      expect(videoTheme(name, false)).toEqual(THEMES[name]);
      expect(videoTheme(name, undefined)).toEqual(THEMES[name]);
    }
  });

  it("puts every look on the same plate, with no grain to crawl", () => {
    for (const name of THEME_NAMES) {
      const keyed = videoTheme(name, true);
      expect(keyed.canvas, name).toBe(KEY_COLOR);
      // Noise is a pixel of another colour per grain: the matte comes out
      // crawling, and the flat canvas is the whole point of the format.
      expect(keyed.grain, name).toBe(0);
      // Anything drawn *as* the canvas keeps the real one, or a punched-out
      // marker comes out as a hole rather than a disc.
      expect(keyed.plate, name).toBe(THEMES[name].canvas);
      // The look itself survives — this is a plate, not a fourth theme.
      expect(keyed.name, name).toBe(name);
    }
  });

  it("leaves nothing translucent for the key to eat", () => {
    for (const name of THEME_NAMES) {
      for (const [key, color] of inks(videoTheme(name, true))) {
        expect(color, `${name}.${key}`).toMatch(/^#[0-9a-f]{6}$/);
      }
    }
  });

  it("keeps every ink far enough from the plate to survive the cut", () => {
    for (const name of THEME_NAMES) {
      for (const [key, color] of inks(videoTheme(name, true))) {
        // Same spelling as the plate is the obvious failure; the palette is
        // white, black, greys, cobalt and cream, and none of them is green.
        expect(color, `${name}.${key}`).not.toBe(KEY_COLOR);
        const green = parseInt(color.slice(3, 5), 16);
        const red = parseInt(color.slice(1, 3), 16);
        const blue = parseInt(color.slice(5, 7), 16);
        // Neutral or blue-ish: a colour whose green channel dominates both
        // others is one a keyer would take a bite out of.
        expect(green - Math.max(red, blue), `${name}.${key}`).toBeLessThan(40);
      }
    }
  });

  it("keeps the muted inks at the weight they had over their own canvas", () => {
    const keyed = videoTheme("charcoal", true);
    expect(keyed.inkMuted).toBe(
      flattenOver(THEMES.charcoal.inkMuted, "#000000"),
    );
    expect(keyed.ink).toBe("#ffffff");
  });
});
