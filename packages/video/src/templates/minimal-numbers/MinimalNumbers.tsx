import { useMemo } from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import {
  averagePace,
  formatClock,
  formatDay,
  formatElevation,
  formatKm,
  formatPace,
} from "../../core/format";
import { PAGE_INSET, SAFE_WIDTH, TYPE } from "../../core/layout";
import { countUpValue, MetricValue, Numeral, Unit } from "../../core/numerals";
import { hashSeed } from "../../core/seed";
import { MetricLabel, Rule, Stage } from "../../core/Stage";
import { getTheme, type Theme } from "../../core/theme";
import {
  beatProgress,
  easeOutCubic,
  findBeat,
  ramp,
  secondsToFrames,
} from "../../core/timing";
import type { VideoActivity } from "../../types";
import {
  COUNT_SECONDS,
  HANDOVER_SECONDS,
  minimalNumbersPlan,
  momentBox,
  type MomentFormat,
  type NumberMoment,
} from "./moments";

export type MinimalNumbersProps = {
  activity: VideoActivity;
  /** One of `THEME_NAMES`; anything else falls back to the default. */
  theme: string;
};

/**
 * Minimal Numbers — the one that never fails.
 *
 * One metric owns the whole screen at a time, counts up, holds, and hands over
 * to the next. No map, no illustration, no data dependency beyond what every
 * activity carries: this is what renders when a run has nothing, and it has to
 * look like the choice rather than the fallback.
 */
export function MinimalNumbers({ activity, theme: themeName }: MinimalNumbersProps) {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const theme = getTheme(themeName);
  const plan = useMemo(
    () => minimalNumbersPlan(activity, fps, durationInFrames),
    [activity, fps, durationInFrames],
  );

  const final = findBeat(plan.beats, "final");

  return (
    <Stage theme={theme} seed={hashSeed(activity.id, "minimal-numbers")}>
      {plan.moments.map((moment) => (
        <Moment
          key={moment.id}
          moment={moment}
          theme={theme}
          frame={frame}
          fps={fps}
          beat={findBeat(plan.beats, moment.id)}
        />
      ))}
      {final && frame >= final.from - secondsToFrames(HANDOVER_SECONDS, fps) && (
        <FinalCard activity={activity} theme={theme} frame={frame} fps={fps} from={final.from} />
      )}
    </Stage>
  );
}

function spell(value: number, format: MomentFormat): string {
  switch (format) {
    case "km":
      return formatKm(value);
    case "clock":
      return formatClock(value);
    case "pace":
      return formatPace(value);
    case "meters":
      return formatElevation(value);
    case "bpm":
      return String(Math.round(value));
  }
}

/**
 * One number owning the frame.
 *
 * It counts up eased-out, holds, then hands over — the outgoing numeral rises
 * and dissolves as the incoming one arrives from below, so the sequence reads as
 * one number becoming the next rather than as four cuts.
 */
function Moment({
  moment,
  theme,
  frame,
  fps,
  beat,
}: {
  moment: NumberMoment;
  theme: Theme;
  frame: number;
  fps: number;
  beat: ReturnType<typeof findBeat>;
}) {
  if (!beat) return null;
  const handover = secondsToFrames(HANDOVER_SECONDS, fps);
  if (frame < beat.from - handover || frame > beat.to) return null;

  const entering = easeOutCubic(ramp(frame, beat.from - handover, handover));
  const leaving = easeOutCubic(ramp(frame, beat.to - handover, handover));
  const opacity = entering * (1 - leaving);
  if (opacity <= 0) return null;

  const count = beatProgress(frame, { ...beat, to: beat.from + secondsToFrames(COUNT_SECONDS, fps) });
  const value = countUpValue(moment.value, count, moment.from);
  const box = momentBox(moment.anchor);

  return (
    <div
      style={{
        position: "absolute",
        top: box.top,
        left: box.left,
        width: box.width,
        height: box.height,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: box.align,
        gap: 28,
        opacity,
        // In from below, out to above: the numbers travel one way through the
        // film, which is what makes it feel like a sequence.
        transform: `translateY(${(1 - entering) * 70 - leaving * 70}px)`,
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 24 }}>
        {/* The unit rides beside the numeral, so the measure it is fitted to is
            the one it actually has. */}
        <Numeral theme={theme} maxWidth={SAFE_WIDTH - (moment.unit ? 150 : 0)} maxSize={TYPE.display}>
          {spell(value, moment.format)}
        </Numeral>
        {moment.unit && (
          <Unit theme={theme} size={72}>
            {moment.unit}
          </Unit>
        )}
      </div>
      <MetricLabel theme={theme} size={34} align={moment.anchor === "right" ? "right" : "left"}>
        {moment.label}
      </MetricLabel>
    </div>
  );
}

/** Everything at once, small, and held: the frame a story gets paused on. */
function FinalCard({
  activity,
  theme,
  frame,
  fps,
  from,
}: {
  activity: VideoActivity;
  theme: Theme;
  frame: number;
  fps: number;
  from: number;
}) {
  const enter = easeOutCubic(ramp(frame, from - secondsToFrames(HANDOVER_SECONDS, fps), secondsToFrames(0.5, fps)));
  const heartrate = activity.average_heartrate;
  // Only the tiles this run has. A grid that prints "0 m" of climb to fill its
  // fourth cell is the template admitting it wanted four.
  const tiles = [
    { label: "Distance", value: formatKm(activity.distance), unit: "km" },
    { label: "Moving time", value: formatClock(activity.moving_time) },
    { label: "Average pace", value: formatPace(averagePace(activity)), unit: "/km" },
    ...(heartrate != null && heartrate > 0
      ? [{ label: "Avg heart rate", value: String(Math.round(heartrate)), unit: "bpm" }]
      : activity.total_elevation_gain > 0
        ? [
            {
              label: "Elevation gain",
              value: formatElevation(activity.total_elevation_gain),
              unit: "m",
            },
          ]
        : []),
  ];

  return (
    <AbsoluteFill
      style={{
        padding: `0 ${PAGE_INSET}px`,
        justifyContent: "center",
        opacity: enter,
        transform: `translateY(${(1 - enter) * 30}px)`,
      }}
    >
      <MetricLabel theme={theme}>{formatDay(activity)}</MetricLabel>
      <h1
        style={{
          margin: "24px 0 0",
          fontSize: TYPE.title,
          fontWeight: 500,
          lineHeight: 1.05,
          letterSpacing: "-0.01em",
          textWrap: "balance",
        }}
      >
        {activity.name}
      </h1>

      <Rule theme={theme} margin="56px 0" />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", rowGap: 48, columnGap: 24 }}>
        {tiles.map((tile) => (
          <MetricValue
            key={tile.label}
            theme={theme}
            label={tile.label}
            value={tile.value}
            unit={tile.unit}
            size={64}
          />
        ))}
      </div>
    </AbsoluteFill>
  );
}
