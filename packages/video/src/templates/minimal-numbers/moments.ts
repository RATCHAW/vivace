/**
 * Minimal Numbers' plan: which metrics a run actually has, how long each one
 * owns the screen, and where on it.
 *
 * Pure and React-free. The whole template is built so that a run carrying
 * nothing but `distance` and `moving_time` still gets a film — that fixture is
 * the one this module is written against.
 */
import { averagePace } from "../../core/format";
import { LOGO_TOP, PAGE_INSET, SAFE_TOP, SAFE_WIDTH } from "../../core/layout";
import { buildBeats, type Beat } from "../../core/timing";
import type { VideoActivity } from "../../types";

/** How a moment's number is spelled — the component maps these to formatters,
 *  so the plan stays data and the tests can read it. */
export type MomentFormat = "km" | "clock" | "pace" | "meters" | "bpm";

/**
 * Where a moment sits.
 *
 * Alternating the anchor is the difference between this template and a slide
 * deck: centring every number is exactly what makes a sequence of numbers look
 * like a template rather than a film.
 */
export type MomentAnchor = "left" | "center" | "right";

export interface NumberMoment {
  id: "distance" | "time" | "pace" | "elevation" | "heartrate";
  /** The tracked-out label under the numeral. */
  label: string;
  /** What the count-up lands on, in the format's own units. */
  value: number;
  /** Where the count-up starts. A pace counting from zero reads as a stopwatch
   *  running backwards; it starts just short of the answer instead. */
  from: number;
  format: MomentFormat;
  unit: string;
  anchor: MomentAnchor;
}

/** Seconds one number owns the frame: 0.6 counting up, 0.7 held, 0.3 handing
 *  over to the next. */
export const MOMENT_SECONDS = 1.6;
export const COUNT_SECONDS = 0.6;
export const HANDOVER_SECONDS = 0.3;
/** The closing card is held, not passed through. */
export const FINAL_SECONDS = 2.4;

const ANCHORS: MomentAnchor[] = ["left", "center", "right", "center"];

/**
 * The metrics this run has, in the order they are shown.
 *
 * Distance and time are always there — an activity without them is not an
 * activity. Pace needs a speed. The fourth slot is whichever of elevation and
 * heart rate the run actually carries; a real climb wins it, because 312 metres
 * of ascent says more about a run than an average heart rate does.
 */
export function chooseMoments(activity: VideoActivity): NumberMoment[] {
  const moments: Omit<NumberMoment, "anchor">[] = [];

  if (activity.distance > 0) {
    moments.push({
      id: "distance",
      label: "Distance",
      value: activity.distance,
      from: 0,
      format: "km",
      unit: "km",
    });
  }
  if (activity.moving_time > 0) {
    moments.push({
      id: "time",
      label: "Moving time",
      value: activity.moving_time,
      from: 0,
      format: "clock",
      unit: "",
    });
  }

  const pace = averagePace(activity) ?? 0;
  if (pace > 0) {
    moments.push({
      id: "pace",
      label: "Average pace",
      value: pace,
      from: Math.max(0, pace - 45),
      format: "pace",
      unit: "/km",
    });
  }

  const climb = activity.total_elevation_gain;
  const heartrate = activity.average_heartrate;
  if (climb >= 50) {
    moments.push({
      id: "elevation",
      label: "Elevation gain",
      value: climb,
      from: 0,
      format: "meters",
      unit: "m",
    });
  } else if (heartrate != null && heartrate > 0) {
    moments.push({
      id: "heartrate",
      label: "Average heart rate",
      value: heartrate,
      from: 0,
      format: "bpm",
      unit: "bpm",
    });
  } else if (climb > 0) {
    moments.push({
      id: "elevation",
      label: "Elevation gain",
      value: climb,
      from: 0,
      format: "meters",
      unit: "m",
    });
  }

  return moments.map((moment, index) => ({
    ...moment,
    anchor: ANCHORS[index % ANCHORS.length],
  }));
}

/** Variable by design: a run with three numbers is a shorter film than a run
 *  with five, and padding it out is how a template starts to feel like one. */
export function minimalNumbersSeconds(activity: VideoActivity): number {
  const moments = chooseMoments(activity);
  return Math.max(1, moments.length) * MOMENT_SECONDS + FINAL_SECONDS;
}

export interface MinimalNumbersPlan {
  moments: NumberMoment[];
  beats: Beat[];
}

export function minimalNumbersPlan(
  activity: VideoActivity,
  fps: number,
  durationInFrames: number,
): MinimalNumbersPlan {
  const moments = chooseMoments(activity);
  const beats = buildBeats(
    [
      ...moments.map((moment) => ({ id: moment.id, seconds: MOMENT_SECONDS })),
      { id: "final", seconds: FINAL_SECONDS },
    ],
    fps,
    durationInFrames,
  );
  return { moments, beats };
}

/**
 * The box a moment's numeral is laid out in.
 *
 * Returned rather than hardcoded in the component so the safe area is something
 * a test can assert instead of something a person has to look at. The heights
 * are the tallest the numeral and its label can be; `fitFontSize` is what keeps
 * the width in.
 */
export function momentBox(anchor: MomentAnchor): {
  top: number;
  height: number;
  left: number;
  width: number;
  align: "flex-start" | "center" | "flex-end";
} {
  const width = SAFE_WIDTH;
  const height = 460;
  switch (anchor) {
    case "left":
      // Baseline-ish: low in the frame, hard against the gutter.
      return {
        top: LOGO_TOP - 80 - height,
        height,
        left: PAGE_INSET,
        width,
        align: "flex-start",
      };
    case "right":
      return {
        top: SAFE_TOP + 60,
        height,
        left: PAGE_INSET,
        width,
        align: "flex-end",
      };
    default:
      return {
        top: Math.round((SAFE_TOP + LOGO_TOP - height) / 2),
        height,
        left: PAGE_INSET,
        width,
        align: "center",
      };
  }
}
