import type { ReactNode } from "react";
import { AbsoluteFill } from "remotion";
import { VivaceMark } from "../brand/vivace-mark";
import {
  FONT_MONO,
  FONT_SANS,
  LABEL_TRACKING,
  LOGO_TOP,
  PAGE_INSET,
  TYPE,
} from "./layout";
import type { Theme } from "./theme";

/**
 * The plate every template that isn't the map replay is built on: the theme's
 * canvas, a layer of grain over it, and the logo lockup in its one place.
 *
 * Inline styles, like the replay's overlay — a composition is rendered
 * headlessly, where no stylesheet is loaded, so the tokens arrive as a `Theme`
 * object instead of as CSS variables.
 */
export function Stage({
  theme,
  seed,
  children,
}: {
  theme: Theme;
  /** Seeds the grain, so the same run always renders the same noise. */
  seed: number;
  children: ReactNode;
}) {
  return (
    <AbsoluteFill
      style={{
        backgroundColor: theme.canvas,
        color: theme.ink,
        fontFamily: FONT_SANS,
      }}
    >
      <Grain theme={theme} seed={seed} />
      {children}
      <Lockup theme={theme} />
    </AbsoluteFill>
  );
}

/**
 * Film grain.
 *
 * A 1080×1920 field of one flat colour bands visibly on a phone — the gradient
 * between two near-identical greys is wider than the screen, so the eye finds
 * the step. A few percent of fixed noise breaks it up, and it is what stops a
 * flat canvas reading as a placeholder.
 *
 * `feTurbulence` is deterministic given a seed, so this costs no randomness
 * budget: same run, same grain, byte for byte.
 */
function Grain({ theme, seed }: { theme: Theme; seed: number }) {
  if (theme.grain <= 0) return null;
  return (
    <AbsoluteFill style={{ opacity: theme.grain, pointerEvents: "none" }}>
      <svg width="100%" height="100%">
        <filter id={`grain-${seed}`} x="0" y="0" width="100%" height="100%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.8"
            numOctaves={3}
            seed={seed}
            stitchTiles="stitch"
          />
          {/* Monochrome: coloured noise on a black canvas reads as a broken
              codec, not as stock. */}
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter={`url(#grain-${seed})`} />
      </svg>
    </AbsoluteFill>
  );
}

/**
 * Our stamp on a file that leaves the app for somebody else's feed — identical
 * placement and size in every template, which is the whole point of it being
 * here rather than in each one.
 *
 * The same lockup as `<Wordmark>` in the app: the mark in the theme's brand ink,
 * the name in the theme's ink.
 */
export function Lockup({
  theme,
  opacity = 1,
}: {
  theme: Theme;
  opacity?: number;
}) {
  return (
    <div
      style={{
        position: "absolute",
        top: LOGO_TOP,
        left: PAGE_INSET,
        display: "flex",
        alignItems: "center",
        gap: 14,
        opacity,
        fontFamily: FONT_SANS,
        color: theme.ink,
      }}
    >
      <VivaceMark style={{ width: 40, height: 40, color: theme.markInk }} />
      <span
        style={{
          fontSize: 40,
          fontWeight: 600,
          lineHeight: 1,
          letterSpacing: "-0.01em",
        }}
      >
        vivace
      </span>
    </div>
  );
}

/** The wide-tracked mono eyebrow that sits above every number. Small caps by
 *  way of upper-casing: JetBrains Mono has no `small-caps` axis. */
export function MetricLabel({
  children,
  theme,
  size = TYPE.label,
  color,
  align = "left",
}: {
  children: ReactNode;
  theme: Theme;
  size?: number;
  color?: string;
  align?: "left" | "center" | "right";
}) {
  return (
    <div
      style={{
        fontFamily: FONT_MONO,
        fontSize: size,
        letterSpacing: `${LABEL_TRACKING}em`,
        color: color ?? theme.inkFaint,
        textAlign: align,
        textTransform: "uppercase",
      }}
    >
      {children}
    </div>
  );
}

/** A hairline rule. Elevation is canvas luminance and rules — never a shadow. */
export function Rule({
  theme,
  margin = 0,
}: {
  theme: Theme;
  margin?: number | string;
}) {
  return <div style={{ height: 1, backgroundColor: theme.hairline, margin }} />;
}
