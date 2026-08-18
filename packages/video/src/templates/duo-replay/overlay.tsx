import { AbsoluteFill } from "remotion";
import { VivaceMark } from "../../brand/vivace-mark";
import {
  formatClock,
  formatKm,
  formatPace,
  formatStartDate,
} from "../../core/format";
import {
  FONT_MONO,
  FONT_SANS,
  LABEL_TRACKING,
  PAGE_INSET,
} from "../../core/layout";
import type { VideoActivity } from "../../types";
import {
  duoBarFill,
  DUO_ROW_HEIGHT,
  DUO_ROW_TOPS,
  DUO_TITLE_TOP,
  type RunnerFrame,
} from "./duo";

/* Everything that sits over the two drawing routes.
 *
 * Inline-styled rather than tokenised, like every other composition: this is
 * also rendered headlessly, where no stylesheet is loaded. The literals trace
 * back to DESIGN.md the same way `styles.css` does — see the comments. */

// {colors.primary} — cobalt, the brand stamp on the mark.
const COBALT = "#494fdf";
// {colors.on-dark} and its two mutes.
const ON_DARK = "#ffffff";
const ON_DARK_MUTE = "rgba(255,255,255,0.72)";
const ON_DARK_FAINT = "rgba(255,255,255,0.64)";
/** The unfilled part of a runner's bar. {colors.hairline-dark}, one step up. */
const TRACK = "rgba(255,255,255,0.18)";

/** Type ramp for this template. Smaller than the replay's hero, because there
 *  are two of everything and both have to be read at a glance. */
const TYPE = {
  label: 30,
  title: 72,
  value: 58,
  unit: 26,
  name: 34,
  watermark: 40,
  credit: 22,
} as const;

/** The colour chip that ties a bar to a trace. The only thing on screen saying
 *  which line on the map is whose, so it is drawn at name size, not as a dot in
 *  a legend. */
function InkChip({ color }: { color: string }) {
  return (
    <span
      style={{
        width: 22,
        height: 22,
        borderRadius: "50%",
        backgroundColor: color,
        flexShrink: 0,
      }}
    />
  );
}

function Metric({
  label,
  value,
  unit,
}: {
  label: string;
  value: string | number;
  unit?: string;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div
        style={{
          fontFamily: FONT_MONO,
          fontSize: 24,
          letterSpacing: `${LABEL_TRACKING}em`,
          color: ON_DARK_FAINT,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: TYPE.value,
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
              fontSize: TYPE.unit,
              fontWeight: 500,
              marginLeft: 8,
              color: ON_DARK_FAINT,
            }}
          >
            {unit}
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * One runner's bar: who they are, what their numbers read this instant, and how
 * far along they are against the longer of the two runs.
 *
 * A runner who hasn't set off yet keeps their row — it dims rather than
 * appearing, because a bar that arrives two seconds in reads as a glitch, and
 * because "not started yet" is one of the things this film is showing.
 */
function RunnerBar({
  frame,
  fill,
  top,
}: {
  frame: RunnerFrame;
  fill: number;
  top: number;
}) {
  const { runner, live, started } = frame;
  return (
    <div
      style={{
        position: "absolute",
        top,
        left: PAGE_INSET,
        right: PAGE_INSET,
        height: DUO_ROW_HEIGHT,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        opacity: started ? 1 : 0.45,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 20,
        }}
      >
        <span
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            fontSize: TYPE.name,
            fontWeight: 600,
            letterSpacing: "-0.01em",
            color: ON_DARK,
            minWidth: 0,
            overflow: "hidden",
            whiteSpace: "nowrap",
            textOverflow: "ellipsis",
          }}
        >
          <InkChip color={runner.color} />
          {runner.name}
        </span>

        <div style={{ display: "flex", gap: 44 }}>
          <Metric label="KM" value={formatKm(live.distanceMeters)} />
          <Metric label="TIME" value={formatClock(live.elapsedSeconds)} />
          <Metric
            label="PACE"
            value={formatPace(live.paceSecondsPerKm)}
            unit="/KM"
          />
        </div>
      </div>

      {/* Both bars are on one scale — see `duoBarFill` — so the space between
          their two ends is the space between the two runners. */}
      <div
        style={{
          height: 8,
          borderRadius: 9999,
          backgroundColor: TRACK,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: 8,
            width: `${fill * 100}%`,
            backgroundColor: runner.color,
            borderRadius: 9999,
          }}
        />
      </div>
    </div>
  );
}

/** What sits over the two drawing routes: the run and its date at the top, a bar
 *  each along the bottom. `opacity` 0 keeps the layer mounted so the Mapbox
 *  plate underneath is never torn down and rebuilt mid-video. */
export function DuoOverlay({
  activity,
  frames,
  opacity,
}: {
  activity: VideoActivity;
  frames: RunnerFrame[];
  opacity: number;
}) {
  const fills = duoBarFill(frames);

  return (
    <AbsoluteFill style={{ opacity, fontFamily: FONT_SANS, color: ON_DARK }}>
      <div
        style={{
          position: "absolute",
          top: DUO_TITLE_TOP,
          left: PAGE_INSET,
          right: PAGE_INSET,
          display: "flex",
          flexDirection: "column",
          gap: 20,
        }}
      >
        <div
          style={{
            fontFamily: FONT_MONO,
            fontSize: TYPE.label,
            // The watermark sits on this line, outside the fade — matching the
            // line box is what keeps the two ends of the row level.
            lineHeight: `${TYPE.watermark}px`,
            letterSpacing: `${LABEL_TRACKING}em`,
            color: ON_DARK_MUTE,
          }}
        >
          {formatStartDate(activity)}
        </div>
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

      {frames.map((frame, index) => (
        <RunnerBar
          key={frame.runner.key}
          frame={frame}
          fill={fills[index]}
          top={DUO_ROW_TOPS[index]}
        />
      ))}
    </AbsoluteFill>
  );
}

/* ---- Furniture ---------------------------------------------------------- */

/** Our stamp on a file that leaves the app for somebody else's feed. Rides above
 *  the overlay's fade and stays up for every frame — a watermark that comes and
 *  goes is a title card. On the date's line, against the same gutter, and inside
 *  the safe area: a story's own UI covers the strip the replay puts it in. */
export function Watermark() {
  return (
    <div
      style={{
        position: "absolute",
        top: DUO_TITLE_TOP,
        right: PAGE_INSET,
        height: TYPE.watermark,
        display: "flex",
        alignItems: "center",
        gap: 14,
        fontFamily: FONT_SANS,
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

/** The bar across the top that says how much of the story is left — the format's
 *  own furniture, filling once across the single shot. */
export function StoryProgress({ progress }: { progress: number }) {
  return (
    <div
      style={{
        position: "absolute",
        top: 37,
        left: 53,
        right: 53,
        height: 8,
        borderRadius: 9999,
        backgroundColor: "rgba(255,255,255,0.22)",
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

export const CREDIT_SIZE = TYPE.credit;
