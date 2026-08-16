import type { ReactNode } from "react";
import { AbsoluteFill } from "remotion";
import { VivaceMark } from "../../brand/vivace-mark";
import { flattenOver } from "../../core/greenscreen";
import type { VideoActivity } from "../../types";
import {
  formatClock,
  formatKm,
  formatPace,
  formatStartDate,
  type LiveMetrics,
} from "./data";

/* Everything that sits over the map: the run's HUD, the story progress bar and
 * the watermark that rides out with the export.
 *
 * All of it is inline-styled rather than tokenised: the composition is also
 * rendered headlessly, where no stylesheet is loaded. The literals trace back to
 * DESIGN.md the same way `styles.css` does — see the comments. */

// {colors.primary} — cobalt, the brand stamp on the mark.
const COBALT = "#494fdf";
// {colors.canvas-dark} / {colors.on-dark} / {colors.on-dark-mute}.
const ON_DARK = "#ffffff";
const ON_DARK_MUTE = "rgba(255,255,255,0.72)";
const ON_DARK_FAINT = "rgba(255,255,255,0.64)";
// {colors.hairline-dark}, one step up for rules that carry a layout.
const RULE = "rgba(255,255,255,0.16)";
const TRACK = "rgba(255,255,255,0.22)";

/**
 * The HUD's inks, over the map and over the key plate.
 *
 * Every translucent one was mixed against the black under the map, so on the
 * key plate it is flattened over that same black rather than restyled: a
 * 72%-white label over chroma green composites to pale green, and the key eats
 * it along with the background. Flattened, it is the grey it always looked like
 * — and it survives the cut.
 */
const OVER_MAP = {
  mute: ON_DARK_MUTE,
  faint: ON_DARK_FAINT,
  rule: RULE,
  track: TRACK,
};

const OVER_KEY: Ink = {
  mute: flattenOver(ON_DARK_MUTE, "#000000"),
  faint: flattenOver(ON_DARK_FAINT, "#000000"),
  rule: flattenOver(RULE, "#000000"),
  track: flattenOver(TRACK, "#000000"),
};

export type Ink = typeof OVER_MAP;

export const overlayInk = (greenscreen: boolean): Ink =>
  greenscreen ? OVER_KEY : OVER_MAP;

const SANS = "'Inter Variable', Inter, system-ui, sans-serif";
const MONO =
  "'JetBrains Mono Variable', ui-monospace, SFMono-Regular, monospace";

// Type ramp for the 1080×1920 story canvas. Sized for a phone held at arm's
// length: nothing informational below 30px.
export const TYPE = {
  mono: 32,
  title: 84,
  hero: 176,
  heroUnit: 44,
  tileLabel: 30,
  tileValue: 72,
  tileUnit: 30,
  watermark: 40,
  credit: 22,
} as const;

/** The frame's side gutter, shared by the HUD and the watermark so the two read
 *  as one layout rather than two things that happen to be near the edges. */
const PAGE_INSET = 80;
const PAGE_PADDING = `107px ${PAGE_INSET}px`;

/** The wide-tracked mono eyebrow that sits above every number in the replay. */
function MonoLabel({
  children,
  size = TYPE.mono,
  color,
}: {
  children: ReactNode;
  size?: number;
  color: string;
}) {
  return (
    <div
      style={{
        fontFamily: MONO,
        fontSize: size,
        letterSpacing: "0.16em",
        color,
      }}
    >
      {children}
    </div>
  );
}

function Rule({ ink, margin = 0 }: { ink: Ink; margin?: number | string }) {
  return <div style={{ height: 1, backgroundColor: ink.rule, margin }} />;
}

function MetricTile({
  label,
  value,
  unit,
  ink,
  size = TYPE.tileValue,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  ink: Ink;
  size?: number;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div
        style={{
          fontFamily: MONO,
          fontSize: TYPE.tileLabel,
          letterSpacing: "0.14em",
          color: ink.faint,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: size,
          fontWeight: 600,
          lineHeight: 1,
          letterSpacing: "-0.02em",
          fontVariantNumeric: "tabular-nums",
          color: ON_DARK,
        }}
      >
        {value}
        {unit && (
          <span
            style={{
              fontSize: TYPE.tileUnit,
              fontWeight: 500,
              marginLeft: 10,
              color: ink.faint,
            }}
          >
            {unit}
          </span>
        )}
      </div>
    </div>
  );
}

/* ---- The run's HUD ------------------------------------------------------ */

/** What sits over the drawing map: who and when at the top, what the numbers
 *  read at this instant along the bottom. `opacity` 0 keeps the layer mounted so
 *  the Mapbox plate underneath is never torn down and rebuilt mid-video. */
export function RouteOverlay({
  activity,
  live,
  opacity,
  ink,
}: {
  activity: VideoActivity;
  live: LiveMetrics;
  opacity: number;
  /** Which set of inks the plate underneath calls for — see `overlayInk`. */
  ink: Ink;
}) {
  return (
    <AbsoluteFill
      style={{
        opacity,
        fontFamily: SANS,
        color: ON_DARK,
        padding: PAGE_PADDING,
        justifyContent: "space-between",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
        <MonoLabel color={ink.mute}>{formatStartDate(activity)}</MonoLabel>
        <h1
          style={{
            margin: 0,
            fontSize: TYPE.title,
            fontWeight: 500,
            lineHeight: 1.05,
            letterSpacing: "-0.01em",
            textWrap: "balance",
          }}
        >
          {activity.name}
        </h1>
      </div>

      <div style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 20 }}>
          <span
            style={{
              fontSize: TYPE.hero,
              fontWeight: 600,
              lineHeight: 1,
              letterSpacing: "-0.02em",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {formatKm(live.distanceMeters)}
          </span>
          <span
            style={{
              fontSize: TYPE.heroUnit,
              fontWeight: 500,
              letterSpacing: "0.08em",
              color: ink.mute,
            }}
          >
            KM
          </span>
        </div>

        <Rule ink={ink} margin="44px 0" />

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: 32,
          }}
        >
          <MetricTile
            label="TIME"
            value={formatClock(live.elapsedSeconds)}
            ink={ink}
          />
          <MetricTile
            label="PACE"
            value={formatPace(live.paceSecondsPerKm)}
            unit="/KM"
            ink={ink}
          />
          {live.heartrate != null ? (
            <MetricTile
              label="HEART RATE"
              value={live.heartrate}
              unit="BPM"
              ink={ink}
            />
          ) : (
            <MetricTile
              label="ELEV GAIN"
              value={Math.round(live.elevationGainMeters)}
              unit="M"
              ink={ink}
            />
          )}
        </div>
      </div>
    </AbsoluteFill>
  );
}

/* ---- Watermark ---------------------------------------------------------- */

/** Our stamp on a file that leaves the app for somebody else's feed. It rides
 *  above the HUD's fade and stays up for every frame — a watermark that comes
 *  and goes is a title card.
 *
 *  The same lockup as `<Wordmark>` in the app: cobalt mark, on-dark name. The
 *  route trace is cobalt too, but as illustration ink — this is the one brand
 *  stamp in the frame. */
export function Watermark() {
  return (
    <div
      style={{
        position: "absolute",
        // On the date's line, against the same gutter as the HUD.
        top: 104,
        right: PAGE_INSET,
        display: "flex",
        alignItems: "center",
        gap: 14,
        fontFamily: SANS,
        color: ON_DARK,
      }}
    >
      <VivaceMark
        style={{ width: TYPE.watermark, height: TYPE.watermark, color: COBALT }}
      />
      <span
        style={{
          fontSize: TYPE.watermark,
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

/* ---- Story progress ----------------------------------------------------- */

/** The bar across the top that says how much of the story is left — the format's
 *  own furniture, filling once across the single shot. */
export function StoryProgress({
  progress,
  ink,
}: {
  progress: number;
  ink: Ink;
}) {
  return (
    <div
      style={{
        position: "absolute",
        top: 37,
        left: 53,
        right: 53,
        height: 8,
        borderRadius: 9999,
        backgroundColor: ink.track,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          height: 8,
          backgroundColor: ON_DARK,
          width: `${Math.min(1, Math.max(0, progress)) * 100}%`,
        }}
      />
    </div>
  );
}
