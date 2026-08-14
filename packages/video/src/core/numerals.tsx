import type { CSSProperties, ReactNode } from "react";
import { fitFontSize, FONT_SANS, NUMERAL_TRACKING, TYPE } from "./layout";
import { clamp01, easeOutCubic } from "./timing";
import type { Theme } from "./theme";

/**
 * Every number that animates, and the one rule they all obey.
 *
 * **Tabular numerals are mandatory.** With proportional figures a counter's
 * digits are different widths, so the number twitches sideways as it climbs and
 * the whole thing reads as broken. It is the single most common way a template
 * like this fails, so it is set once, here, and no caller has to remember it.
 */
export const NUMERAL_STYLE: CSSProperties = {
  fontFamily: FONT_SANS,
  fontVariantNumeric: "tabular-nums",
  fontFeatureSettings: '"tnum" 1, "lnum" 1',
  letterSpacing: `${NUMERAL_TRACKING}em`,
  lineHeight: 1,
  fontWeight: 600,
};

/**
 * A value counting up to `to`, eased out — never linear.
 *
 * The count is a function of `progress` alone, so a frame rendered on Lambda and
 * the same frame scrubbed in the player show the same digits.
 */
export function countUpValue(to: number, progress: number, from = 0): number {
  return from + (to - from) * easeOutCubic(clamp01(progress));
}

/**
 * A numeral that owns its measure: fitted down until it fits `maxWidth`, so a
 * marathon's `42.20` and a parkrun's `5.02` are both as large as they can be
 * without either running off the frame.
 */
export function Numeral({
  children,
  theme,
  maxWidth,
  maxSize = TYPE.display,
  color,
  style,
}: {
  children: string;
  theme: Theme;
  maxWidth: number;
  maxSize?: number;
  color?: string;
  style?: CSSProperties;
}) {
  const fontSize = fitFontSize(children, maxWidth, maxSize);
  return (
    <span
      style={{
        ...NUMERAL_STYLE,
        fontSize,
        color: color ?? theme.hero,
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {children}
    </span>
  );
}

/** The small, tracked-out unit that rides beside a numeral. */
export function Unit({
  children,
  theme,
  size = TYPE.subtitle,
  color,
}: {
  children: ReactNode;
  theme: Theme;
  size?: number;
  color?: string;
}) {
  return (
    <span
      style={{
        fontFamily: FONT_SANS,
        fontSize: size,
        fontWeight: 500,
        letterSpacing: "0.1em",
        color: color ?? theme.inkMuted,
        textTransform: "uppercase",
      }}
    >
      {children}
    </span>
  );
}

/**
 * A metric as a label over its value — the tile the totals rows are built from.
 */
export function MetricValue({
  label,
  value,
  unit,
  theme,
  size = 72,
  labelSize = 28,
  align = "left",
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  theme: Theme;
  size?: number;
  labelSize?: number;
  align?: "left" | "center" | "right";
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 12,
        alignItems: align === "center" ? "center" : align === "right" ? "flex-end" : "flex-start",
      }}
    >
      <div
        style={{
          fontFamily: "'JetBrains Mono Variable', ui-monospace, monospace",
          fontSize: labelSize,
          letterSpacing: "0.14em",
          color: theme.inkFaint,
          textTransform: "uppercase",
          whiteSpace: "nowrap",
        }}
      >
        {label}
      </div>
      <div style={{ ...NUMERAL_STYLE, fontSize: size, color: theme.ink, whiteSpace: "nowrap" }}>
        {value}
        {unit && (
          <span
            style={{
              fontSize: Math.round(size * 0.42),
              fontWeight: 500,
              marginLeft: 10,
              letterSpacing: "0.06em",
              color: theme.inkFaint,
            }}
          >
            {unit}
          </span>
        )}
      </div>
    </div>
  );
}
