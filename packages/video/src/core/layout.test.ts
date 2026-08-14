import { describe, expect, it } from "vitest";
import {
  estimateTextWidth,
  fitFontSize,
  LOGO_TOP,
  NUMERAL_TRACKING,
  SAFE_BOTTOM,
  SAFE_TOP,
  SAFE_WIDTH,
  withinSafeArea,
} from "./layout";

describe("fitting type without a DOM", () => {
  it("never lets a numeral run off the frame", () => {
    for (const text of ["5.02", "42.20", "1:02:03", "4:32", "812", "154"]) {
      const size = fitFontSize(text, SAFE_WIDTH, 520);
      expect(estimateTextWidth(text, size, NUMERAL_TRACKING), text).toBeLessThanOrEqual(
        SAFE_WIDTH,
      );
    }
  });

  it("shrinks a longer number rather than clipping it", () => {
    expect(fitFontSize("42.20", SAFE_WIDTH, 520)).toBeLessThan(fitFontSize("5.0", SAFE_WIDTH, 520));
  });

  it("stops at the ceiling for a number short enough to reach it", () => {
    expect(fitFontSize("5", SAFE_WIDTH, 520)).toBe(520);
  });

  it("measures a wider string as wider", () => {
    expect(estimateTextWidth("1:02:03", 100)).toBeGreaterThan(estimateTextWidth("12:34", 100));
  });
});

describe("the safe area", () => {
  it("is the band a story's own UI leaves alone", () => {
    expect(SAFE_TOP).toBeLessThan(SAFE_BOTTOM);
    // The lockup sits inside it, low enough to read as a signature.
    expect(LOGO_TOP).toBeGreaterThan(SAFE_TOP);
    expect(LOGO_TOP).toBeLessThan(SAFE_BOTTOM);
  });

  it("catches a box that hangs out of the band", () => {
    expect(withinSafeArea({ top: SAFE_TOP, height: 100 })).toBe(true);
    expect(withinSafeArea({ top: SAFE_TOP - 1, height: 100 })).toBe(false);
    expect(withinSafeArea({ top: SAFE_BOTTOM - 50, height: 100 })).toBe(false);
  });
});
