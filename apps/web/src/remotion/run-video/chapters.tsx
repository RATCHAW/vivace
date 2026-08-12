import { useMemo, type ReactNode } from "react";
import { AbsoluteFill } from "remotion";
import type { Run, RunStreams } from "@/api";
import {
  buildSparkline,
  buildSplits,
  CHAPTERS,
  chapterProgress,
  formatClock,
  formatKm,
  formatPace,
  formatStartDate,
  type LiveMetrics,
  type Sparkline,
} from "./data";

/* The replay's four acts. Each is a full-bleed layer the composition
 * cross-fades between; none of them knows about the others' timing.
 *
 * Everything here is inline-styled rather than tokenised: the composition is
 * also rendered headlessly, where no stylesheet is loaded. The literals trace
 * back to DESIGN.md the same way `styles.css` does — see the comments. */

// {colors.primary} — cobalt as illustration ink, never a surface.
const COBALT = "#494fdf";
// {colors.canvas-dark} / {colors.on-dark} / {colors.on-dark-mute}.
const CANVAS = "#000000";
const ON_DARK = "#ffffff";
const ON_DARK_MUTE = "rgba(255,255,255,0.72)";
const ON_DARK_FAINT = "rgba(255,255,255,0.64)";
// {colors.hairline-dark}, one step up for rules that carry a layout.
const RULE = "rgba(255,255,255,0.16)";

const SANS = "'Inter Variable', Inter, system-ui, sans-serif";
const MONO = "'JetBrains Mono Variable', ui-monospace, SFMono-Regular, monospace";

// Type ramp for the 1080×1920 story canvas. Sized for a phone held at arm's
// length: nothing informational below 30px.
export const TYPE = {
  mono: 32,
  monoSmall: 27,
  caption: 34,
  title: 84,
  titleCard: 122,
  hero: 176,
  heroUnit: 44,
  effortValue: 139,
  effortUnit: 40,
  tileLabel: 30,
  tileValue: 72,
  tileUnit: 30,
  summaryValue: 107,
  splitPace: 37,
  credit: 22,
} as const;

const PAGE_PADDING = "107px 80px";

/** The wide-tracked mono eyebrow that sits above every number in the replay. */
function MonoLabel({
  children,
  size = TYPE.mono,
  color = ON_DARK_MUTE,
}: {
  children: ReactNode;
  size?: number;
  color?: string;
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

function Rule({ margin = 0 }: { margin?: number | string }) {
  return <div style={{ height: 1, backgroundColor: RULE, margin }} />;
}

function MetricTile({
  label,
  value,
  unit,
  size = TYPE.tileValue,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  size?: number;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div
        style={{
          fontFamily: MONO,
          fontSize: TYPE.tileLabel,
          letterSpacing: "0.14em",
          color: ON_DARK_FAINT,
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

/** The layer every chapter sits on: opaque or not, it fills the frame and
 *  carries the story typeface. `opacity` 0 layers stay mounted so a Mapbox
 *  plate underneath is never torn down and rebuilt mid-video. */
function Layer({
  opacity,
  opaque = false,
  children,
  style,
}: {
  opacity: number;
  opaque?: boolean;
  children: ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <AbsoluteFill
      style={{
        opacity,
        fontFamily: SANS,
        color: ON_DARK,
        padding: PAGE_PADDING,
        ...(opaque ? { backgroundColor: CANVAS } : null),
        ...style,
      }}
    >
      {children}
    </AbsoluteFill>
  );
}

/* ---- 01 · Title --------------------------------------------------------- */

export function TitleChapter({
  activity,
  opacity,
}: {
  activity: Run;
  opacity: number;
}) {
  return (
    <Layer
      opacity={opacity}
      opaque
      style={{ justifyContent: "center", gap: 48 }}
    >
      <MonoLabel>{formatStartDate(activity)}</MonoLabel>
      <h1
        style={{
          margin: 0,
          fontSize: TYPE.titleCard,
          fontWeight: 500,
          lineHeight: 1.05,
          letterSpacing: "-0.02em",
          textWrap: "balance",
        }}
      >
        {activity.name}
      </h1>
      <Rule />
      <div style={{ fontSize: TYPE.caption, color: ON_DARK_MUTE }}>
        {activity.sport_type.toUpperCase()} · {formatKm(activity.distance)} KM ·{" "}
        {formatClock(activity.moving_time)}
      </div>
    </Layer>
  );
}

/* ---- 02 · Route --------------------------------------------------------- */

/** The HUD over the drawing map: who and when at the top, what the numbers read
 *  at this instant along the bottom. */
export function RouteChapter({
  activity,
  live,
  opacity,
}: {
  activity: Run;
  live: LiveMetrics;
  opacity: number;
}) {
  return (
    <Layer opacity={opacity} style={{ justifyContent: "space-between" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
        <MonoLabel>{formatStartDate(activity)}</MonoLabel>
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
              color: ON_DARK_MUTE,
            }}
          >
            KM
          </span>
        </div>

        <Rule margin="44px 0" />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 32 }}>
          <MetricTile label="TIME" value={formatClock(live.elapsedSeconds)} />
          <MetricTile
            label="PACE"
            value={formatPace(live.paceSecondsPerKm)}
            unit="/KM"
          />
          {live.heartrate != null ? (
            <MetricTile label="HEART RATE" value={live.heartrate} unit="BPM" />
          ) : (
            <MetricTile
              label="ELEV GAIN"
              value={Math.round(live.elevationGainMeters)}
              unit="M"
            />
          )}
        </div>
      </div>
    </Layer>
  );
}

/* ---- 03 · Effort -------------------------------------------------------- */

const CHART_WIDTH = 920;
const CHART_HEIGHT = 256;

interface EffortChannel {
  eyebrow: string;
  value: string;
  unit: string;
  /** Right-hand label under the chart, e.g. "MAX 167". Absent when unplotted. */
  peak: string | null;
  sparkline: Sparkline | null;
}

/** What the effort chapter charts. Heart rate is the story when it was
 *  recorded; without a strap the run's shape still shows in its elevation, and
 *  without either there is always the pace it was run at. */
function effortChannel(activity: Run, streams: RunStreams): EffortChannel {
  const heartrate = streams.heartrate?.data;
  if (heartrate && heartrate.length >= 2) {
    const line = buildSparkline(heartrate, CHART_WIDTH, CHART_HEIGHT);
    const average =
      activity.average_heartrate ??
      heartrate.reduce((a, b) => a + b, 0) / heartrate.length;
    return {
      eyebrow: "EFFORT",
      value: String(Math.round(average)),
      unit: "AVG BPM",
      peak: line ? `MAX ${Math.round(line.max)}` : null,
      sparkline: line,
    };
  }

  const altitude = streams.altitude?.data;
  if (altitude && altitude.length >= 2) {
    const line = buildSparkline(altitude, CHART_WIDTH, CHART_HEIGHT);
    return {
      eyebrow: "ELEVATION",
      value: String(Math.round(activity.total_elevation_gain)),
      unit: "M GAINED",
      peak: line ? `PEAK ${Math.round(line.max)} M` : null,
      sparkline: line,
    };
  }

  return {
    eyebrow: "PACE",
    value: formatPace(activity.average_speed > 0 ? 1000 / activity.average_speed : null),
    unit: "AVG /KM",
    peak: null,
    sparkline: buildSparkline(streams.velocity_smooth?.data, CHART_WIDTH, CHART_HEIGHT),
  };
}

/** The fastest split fills the bar; the slowest still reads as a bar rather
 *  than a stub, so the row stays a comparison and not a ranking. */
const SPLIT_BAR_FLOOR = 0.72;

export function EffortChapter({
  activity,
  streams,
  opacity,
  drawProgress,
}: {
  activity: Run;
  streams: RunStreams;
  opacity: number;
  /** 0–1 draw-on for the sparkline, independent of the layer's fade. */
  drawProgress: number;
}) {
  const channel = useMemo(() => effortChannel(activity, streams), [activity, streams]);
  const splits = useMemo(() => buildSplits(activity, streams), [activity, streams]);

  return (
    <Layer opacity={opacity} style={{ gap: 60 }}>
      <MonoLabel>{channel.eyebrow}</MonoLabel>

      <div style={{ display: "flex", alignItems: "baseline", gap: 24 }}>
        <span
          style={{
            fontSize: TYPE.effortValue,
            fontWeight: 600,
            lineHeight: 1,
            letterSpacing: "-0.02em",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {channel.value}
        </span>
        <span
          style={{
            fontSize: TYPE.effortUnit,
            fontWeight: 500,
            letterSpacing: "0.08em",
            color: ON_DARK_MUTE,
          }}
        >
          {channel.unit}
        </span>
      </div>

      {channel.sparkline && (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <svg
            width={CHART_WIDTH}
            height={CHART_HEIGHT}
            viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
            style={{ display: "block", overflow: "visible" }}
          >
            <path
              d={channel.sparkline.d}
              fill="none"
              stroke="rgba(255,255,255,0.14)"
              strokeWidth={5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d={channel.sparkline.d}
              fill="none"
              stroke={COBALT}
              strokeWidth={8}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray={channel.sparkline.length}
              strokeDashoffset={channel.sparkline.length * (1 - drawProgress)}
            />
          </svg>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontFamily: MONO,
              fontSize: TYPE.monoSmall,
              letterSpacing: "0.12em",
              color: "rgba(255,255,255,0.5)",
            }}
          >
            <span>START</span>
            {channel.peak && <span>{channel.peak}</span>}
            <span>FINISH</span>
          </div>
        </div>
      )}

      {splits.length > 0 && (
        <>
          <Rule />
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            <MonoLabel size={TYPE.tileLabel} color={ON_DARK_FAINT}>
              SPLITS
            </MonoLabel>
            {splits.map((split) => (
              <div
                key={split.label}
                style={{ display: "flex", alignItems: "center", gap: 32 }}
              >
                <span
                  style={{
                    width: 76,
                    fontFamily: MONO,
                    fontSize: TYPE.mono,
                    color: "rgba(255,255,255,0.5)",
                  }}
                >
                  {split.label}
                </span>
                <span
                  style={{
                    flex: "1 1 auto",
                    height: 21,
                    borderRadius: 9999,
                    backgroundColor: "rgba(255,255,255,0.10)",
                    overflow: "hidden",
                  }}
                >
                  <span
                    style={{
                      display: "block",
                      height: 21,
                      borderRadius: 9999,
                      backgroundColor: COBALT,
                      width: `${(SPLIT_BAR_FLOOR + (1 - SPLIT_BAR_FLOOR) * split.weight) * 100}%`,
                    }}
                  />
                </span>
                <span
                  style={{
                    width: 150,
                    textAlign: "right",
                    fontSize: TYPE.splitPace,
                    fontWeight: 600,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {formatPace(split.paceSecondsPerKm)}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </Layer>
  );
}

/* ---- 04 · Summary ------------------------------------------------------- */

export function SummaryChapter({
  activity,
  opacity,
}: {
  activity: Run;
  opacity: number;
}) {
  const pace = activity.average_speed > 0 ? 1000 / activity.average_speed : null;

  return (
    <Layer opacity={opacity} opaque>
      <MonoLabel>{formatStartDate(activity)}</MonoLabel>
      <h1
        style={{
          margin: "26px 0 0",
          fontSize: TYPE.title,
          fontWeight: 500,
          lineHeight: 1.05,
          letterSpacing: "-0.01em",
          textWrap: "balance",
        }}
      >
        {activity.name}
      </h1>

      <div
        style={{
          marginTop: "auto",
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "75px 53px",
        }}
      >
        <MetricTile
          label="DISTANCE"
          value={formatKm(activity.distance)}
          unit="KM"
          size={TYPE.summaryValue}
        />
        <MetricTile
          label="TIME"
          value={formatClock(activity.moving_time)}
          size={TYPE.summaryValue}
        />
        <MetricTile
          label="PACE"
          value={formatPace(pace)}
          size={TYPE.summaryValue}
        />
        <MetricTile
          label="ELEV GAIN"
          value={Math.round(activity.total_elevation_gain)}
          unit="M"
          size={TYPE.summaryValue}
        />
      </div>

      {/* The one cobalt stamp per frame DESIGN.md allows — the wordmark. */}
      <div style={{ marginTop: 85, paddingTop: 53, borderTop: `1px solid ${RULE}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 21 }}>
          <span
            style={{
              width: 21,
              height: 21,
              borderRadius: 9999,
              backgroundColor: COBALT,
            }}
          />
          <span style={{ fontSize: 35, fontWeight: 600 }}>vivace</span>
        </div>
      </div>
    </Layer>
  );
}

/* ---- Chapter bar -------------------------------------------------------- */

/** The story-format segment bar across the top: one track per chapter, filling
 *  as its chapter plays. The same `CHAPTERS` table drives the web player's
 *  scrubber, so the two never disagree about where a chapter starts. */
export function ChapterBar({ progress }: { progress: number }) {
  return (
    <div
      style={{
        position: "absolute",
        top: 37,
        left: 53,
        right: 53,
        display: "flex",
        gap: 13,
      }}
    >
      {CHAPTERS.map((chapter) => (
        <span
          key={chapter.id}
          style={{
            flex: "1 1 0",
            height: 8,
            borderRadius: 9999,
            backgroundColor: "rgba(255,255,255,0.22)",
            overflow: "hidden",
          }}
        >
          <span
            style={{
              display: "block",
              height: 8,
              backgroundColor: ON_DARK,
              width: `${chapterProgress(chapter, progress) * 100}%`,
            }}
          />
        </span>
      ))}
    </div>
  );
}
