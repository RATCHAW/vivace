/**
 * Heartbeat's maths: the run's heart rate as a curve, the tempo the film keeps
 * time to, the layout, and the beat plan the component reads.
 *
 * All of it pure and React-free — the catalogue's eligibility rule and duration
 * estimate call into here, and both of those are imported by apps/api. The
 * tests assert the layout stays in the safe area and that the tempo matches the
 * printed number without anything having to render, let alone play.
 */
import { formatClock, formatKm } from "../../core/format";
import { LOGO_TOP, PAGE_INSET, SAFE_TOP, SAFE_WIDTH } from "../../core/layout";
import { windowMean } from "../../core/metrics";
import { buildBeats, clamp01, sampleIndex, type Beat } from "../../core/timing";
import type { VideoActivity, VideoStreams } from "../../types";

/* ---- The option ---------------------------------------------------------- */

/**
 * What the heartbeat keeps time to — the one thing this template asks the
 * athlete, and the reason it exists as more than a chart.
 *
 * Both answers are a *constant* tempo, and that is the point. There was a third,
 * `live`, which followed the curve so the film accelerated out of the warm-up —
 * and it was subtly dishonest. Each interval it played was real, but a film is
 * ten seconds and a run is twenty-five minutes, so the athlete's heart rate
 * climbed two hundred times faster than it ever did. What you heard was a
 * time-lapse wearing the costume of a recording. These two are neither: a heart
 * held at 152 really is what 152 sounds like, for as long as you care to listen.
 *
 * Non-empty by construction, which is what `z.enum` wants on the API side.
 */
export const PULSE_MODES = ["average", "peak"] as const;

export type PulseMode = (typeof PULSE_MODES)[number];

/** The run as a whole, which is the number an athlete would quote about it. */
export const DEFAULT_PULSE: PulseMode = "average";

export function isPulseMode(value: string): value is PulseMode {
  return (PULSE_MODES as readonly string[]).includes(value);
}

/** The mode for a name, falling back to the default rather than throwing — this
 *  is read from stored rows and from `inputProps` the browser sent. */
export function getPulseMode(value: string | null | undefined): PulseMode {
  return value != null && isPulseMode(value) ? value : DEFAULT_PULSE;
}

/* ---- The heart rate ------------------------------------------------------ */

/**
 * The band a beat has to fall in to be one.
 *
 * Not squeamishness about outliers: the tempo is *audio*, and a stream that
 * hands back a 4 or a 900 — a chest strap losing contact does both — would
 * either stop the film's heartbeat dead or turn it into a buzz.
 */
const MIN_BPM = 40;
const MAX_BPM = 220;

/**
 * A heart rate as the film uses it: a whole number inside the plausible band.
 *
 * Whole on purpose, and it is load-bearing rather than cosmetic — the tempo is
 * derived from exactly the number that is printed on screen, so what the
 * athlete reads is what they hear. `beatSeconds` is the other half of that
 * promise.
 */
export function clampBpm(bpm: number): number {
  if (!Number.isFinite(bpm)) return MIN_BPM;
  return Math.min(MAX_BPM, Math.max(MIN_BPM, Math.round(bpm)));
}

/** Seconds between two beats at a given rate. */
export function beatSeconds(bpm: number): number {
  return 60 / clampBpm(bpm);
}

/** Can this run be cut this way at all? One number is enough — a run that
 *  carries an average but no stream still has a heart rate to beat at. */
export function hasHeartRate(
  activity: VideoActivity,
  streams: VideoStreams,
): boolean {
  if ((activity.average_heartrate ?? 0) > 0) return true;
  return usableHeartrate(streams).length >= 2;
}

/** The heart rate stream with the dropouts taken out. A strap that lost contact
 *  writes zeroes, and a zero is not a slow heart. */
function usableHeartrate(streams: VideoStreams): number[] {
  const data = streams.heartrate?.data;
  if (!data) return [];
  return data.filter((value) => Number.isFinite(value) && value > 0);
}

/** How many points the curve is drawn from. Enough that a 900-pixel trace is
 *  smooth to the eye at five pixels a segment, few enough that rebuilding the
 *  path on every frame costs nothing. */
export const TRACE_POINTS = 180;

export interface HeartSeries {
  /** Beats per minute, resampled onto `TRACE_POINTS` across the whole run. */
  samples: number[];
  average: number;
  max: number;
  min: number;
  /** Index into `samples` of the peak — where the marker goes. */
  peakIndex: number;
  /**
   * True when the watch handed over a curve worth drawing.
   *
   * False is a real state, not a failure: a manual upload can carry an average
   * heart rate and nothing else. There is no trace to draw then, and the film
   * says so by not drawing one rather than by drawing a flat line, which reads
   * as a bug.
   */
  charted: boolean;
}

/**
 * The run's heart rate, ready to be both drawn and heard.
 *
 * Lightly smoothed — a 1 Hz stream over an hour is noisy at this scale, and a
 * curve that buzzes reads as interference rather than as effort — but the peak
 * and the trough are then *pinned* back to their true values. Without that, the
 * marker would sit above the line it belongs to and the number beside it would
 * disagree with the one Strava shows on the same run.
 */
export function heartSeries(
  activity: VideoActivity,
  streams: VideoStreams,
): HeartSeries {
  const raw = usableHeartrate(streams);
  const stated = activity.average_heartrate ?? 0;

  if (raw.length < 2) {
    const flat = clampBpm(stated > 0 ? stated : MIN_BPM);
    const peak = clampBpm(activity.max_heartrate ?? flat);
    return {
      samples: [flat],
      average: flat,
      max: Math.max(flat, peak),
      min: flat,
      peakIndex: 0,
      charted: false,
    };
  }

  // One resampled point covers this many stream samples; averaging over half of
  // that is what turns a jittery 1 Hz trace into a line.
  const halfWidth = Math.max(1, Math.round(raw.length / TRACE_POINTS / 2));
  const samples: number[] = [];
  for (let i = 0; i < TRACE_POINTS; i += 1) {
    const centre = sampleIndex(raw.length, i / (TRACE_POINTS - 1));
    samples.push(clampBpm(windowMean(raw, centre, halfWidth) ?? stated));
  }

  // The peak needs its position as well as its value — it is the one point the
  // film puts a marker and a number on. The trough only sets the bottom of the
  // vertical range, so where it happened is nobody's business.
  let rawPeak = raw[0];
  let rawPeakAt = 0;
  let rawTrough = raw[0];
  for (let i = 1; i < raw.length; i += 1) {
    if (raw[i] > rawPeak) {
      rawPeak = raw[i];
      rawPeakAt = i;
    }
    if (raw[i] < rawTrough) rawTrough = raw[i];
  }

  // The stream wins while there is one, and `activity.max_heartrate` is only
  // consulted when there is no curve at all.
  //
  // The tempting alternative — take whichever is higher, so the film never
  // undersells the run — is what the first cut of this did, and it renders a
  // one-sample needle straight through the trace whenever the two disagree.
  // They *do* disagree: Strava's max comes off the unsmoothed stream, an edited
  // activity keeps its old one, and a manual upload can carry a number no
  // stream supports. Pinning to the higher of them also stretches the vertical
  // range to a rate nothing in the curve ever reaches, which leaves the whole
  // trace squashed into the bottom of its band. The curve is the run.
  const max = clampBpm(rawPeak);
  const min = clampBpm(rawTrough);
  const resampled = (index: number) =>
    Math.min(
      TRACE_POINTS - 1,
      Math.round((index / Math.max(1, raw.length - 1)) * (TRACE_POINTS - 1)),
    );
  // Undo the smoothing at the one point that is named on screen, and only
  // there: the marker has to sit *on* the line it labels, and the number beside
  // it has to be the one the watch recorded rather than a local average of it.
  //
  // The trough is deliberately left smoothed. Nothing labels it — it only sets
  // the bottom of the vertical range and the quiet end of the volume ramp — so
  // pinning it bought nothing and cost a visible notch in the bottom of every
  // dip, which is the needle above in miniature.
  const peakIndex = resampled(rawPeakAt);
  samples[peakIndex] = max;

  const mean = raw.reduce((sum, value) => sum + value, 0) / raw.length;
  return {
    samples,
    average: clampBpm(stated > 0 ? stated : mean),
    max,
    min,
    peakIndex,
    charted: true,
  };
}

/**
 * The one heart rate the film shows and beats at — the whole answer to the
 * option, in one place.
 *
 * There is deliberately no per-instant reading beside this. The tempo is
 * constant, so a numeral that tracked the curve underneath it would print a
 * number the athlete is not hearing, and this template's whole claim is that
 * those two are the same. The curve does the job of showing the variation; the
 * numeral does the job of naming the beat.
 */
export function pulseReading(
  series: HeartSeries,
  mode: PulseMode,
): { bpm: number; label: string } {
  return mode === "peak"
    ? { bpm: series.max, label: "Peak heart rate" }
    : { bpm: series.average, label: "Average heart rate" };
}

/* ---- The length ---------------------------------------------------------- */

/** What a film with nothing much to show is worth. */
const BASE_SECONDS = 9.5;
/** …and how much more a run whose heart rate went everywhere earns. */
const RANGE_SECONDS = 2.5;
/** The spread that earns all of it — roughly easy jog to flat out. */
const WIDE_RANGE_BPM = 45;

const OPEN_SECONDS = 1.4;
const HOLD_SECONDS = 2.8;
/** The trace never gets less than this, whatever duration the film is handed. */
const MIN_TRACE_SECONDS = 1.5;

/**
 * Seconds of film for a given run.
 *
 * Two things move it, and both are facts about the run. A heart rate that
 * travelled has more curve worth watching than one that sat still. And the
 * result is then rounded to a whole number of the athlete's own average beats,
 * so the film is literally twenty-eight heartbeats long — which means that in
 * the steady modes the last thud lands within a frame of the last frame rather
 * than being cut off halfway through. (Within a frame, not on it: the caller
 * quantises these seconds to whole frames afterwards.)
 */
export function heartbeatSeconds(
  activity: VideoActivity,
  streams: VideoStreams,
): number {
  const series = heartSeries(activity, streams);
  const spread = clamp01((series.max - series.min) / WIDE_RANGE_BPM);
  const wanted = BASE_SECONDS + RANGE_SECONDS * spread;
  const beat = beatSeconds(series.average);
  return Math.max(beat, Math.round(wanted / beat) * beat);
}

/* ---- The layout ---------------------------------------------------------- */

export interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface HeartbeatBoxes {
  header: Box;
  numeral: Box;
  /** Null on a run that carries an average and no curve — there is nothing to
   *  draw, and an empty band is worse than no band. */
  trace: Box | null;
  stats: Box;
}

const CONTENT: Pick<Box, "left" | "width"> = {
  left: PAGE_INSET,
  width: SAFE_WIDTH,
};

/** Everything sits between `SAFE_TOP` and the lockup — asserted by the tests
 *  rather than eyeballed, which is why the boxes are a value and not CSS. */
export function heartbeatBoxes(charted: boolean): HeartbeatBoxes {
  const header = { ...CONTENT, top: SAFE_TOP, height: 120 };
  const stats = { ...CONTENT, top: 1320, height: 140 };
  if (!charted) {
    // No curve: the numeral takes the band the trace would have had, so the
    // frame is a title card rather than a chart with a hole in it.
    return {
      header,
      numeral: { ...CONTENT, top: 640, height: 480 },
      trace: null,
      stats,
    };
  }
  return {
    header,
    numeral: { ...CONTENT, top: 460, height: 320 },
    trace: { ...CONTENT, top: 900, height: 320 },
    stats,
  };
}

/** The lowest a box may reach before it is under the lockup. */
export const CONTENT_BOTTOM = LOGO_TOP - 60;

/* ---- The trace ----------------------------------------------------------- */

export interface TracePoint {
  x: number;
  y: number;
}

/** Breathing room above and below the curve, so a steady run's line doesn't
 *  ride the edges of its own band and read as clipped. */
const RANGE_PAD_FRACTION = 0.14;
const MIN_RANGE_PAD_BPM = 4;

/** The curve in composition pixels. Pure, so the tests can check it stays in
 *  its box without a DOM to measure. */
export function tracePoints(series: HeartSeries, box: Box): TracePoint[] {
  const pad = Math.max(
    MIN_RANGE_PAD_BPM,
    (series.max - series.min) * RANGE_PAD_FRACTION,
  );
  const low = series.min - pad;
  const span = Math.max(1, series.max + pad - low);
  const count = series.samples.length;
  return series.samples.map((bpm, index) => ({
    x: box.left + (count <= 1 ? 0 : (index / (count - 1)) * box.width),
    y: box.top + box.height * (1 - (bpm - low) / span),
  }));
}

/** Where the curve has got to, `progress` of the way along it — the leading
 *  point, interpolated inside the segment it falls in rather than snapped to a
 *  vertex, so the dot travels smoothly at any frame rate. */
export function traceHead(
  points: readonly TracePoint[],
  progress: number,
): TracePoint {
  if (points.length === 0) return { x: 0, y: 0 };
  if (points.length === 1) return points[0];
  const span = (points.length - 1) * clamp01(progress);
  const index = Math.min(points.length - 2, Math.floor(span));
  const fraction = span - index;
  const from = points[index];
  const to = points[index + 1];
  return {
    x: from.x + (to.x - from.x) * fraction,
    y: from.y + (to.y - from.y) * fraction,
  };
}

/** The drawn part of the curve, as an SVG path. Rebuilt per frame on purpose:
 *  a dash offset would need the path's length, and nothing can measure that
 *  without a DOM — which Lambda has and a test does not. */
export function tracePath(
  points: readonly TracePoint[],
  progress: number,
): string {
  if (points.length < 2) return "";
  const head = traceHead(points, progress);
  const upTo = Math.floor((points.length - 1) * clamp01(progress));
  const drawn = points.slice(0, upTo + 1);
  const body = drawn
    .map(
      (point, index) =>
        `${index === 0 ? "M" : "L"}${point.x.toFixed(2)} ${point.y.toFixed(2)}`,
    )
    .join(" ");
  return `${body} L${head.x.toFixed(2)} ${head.y.toFixed(2)}`;
}

/* ---- The beat plan ------------------------------------------------------- */

export interface PulseBeat {
  /** The frame the thud lands on. */
  frame: number;
  /** What the heart was doing at it — the volume rides this in `live` mode. */
  bpm: number;
}

/**
 * A ceiling on how many beats one film may hold.
 *
 * Fifteen seconds at the top of the plausible band is fifty-five, so this is
 * never reached in practice — it is here so a duration override or a corrupt
 * rate can't turn the loop below into one that never ends.
 */
const MAX_BEATS = 96;

export interface HeartbeatPlan {
  series: HeartSeries;
  mode: PulseMode;
  boxes: HeartbeatBoxes;
  points: TracePoint[];
  beats: Beat[];
  pulses: PulseBeat[];
  /** What the film settles on, and what to call it. */
  headline: { bpm: number; label: string };
  /** The three tiles under the trace — never repeating the headline. */
  stats: Array<{ label: string; value: string; unit?: string }>;
}

/**
 * How far through the *run* the curve has drawn at a given frame.
 *
 * The trace's business alone — its leading edge and the moment the peak marker
 * is allowed to appear. Neither the numeral nor the tempo reads it: those two
 * are one constant number for the length of the film, which is exactly what
 * makes the beat a heart rate rather than a time-lapse of one.
 */
export function runProgress(plan: HeartbeatPlan, frame: number): number {
  const trace = plan.beats.find((beat) => beat.id === "trace");
  if (!trace || trace.to <= trace.from) return 0;
  return clamp01((frame - trace.from) / (trace.to - trace.from));
}

/**
 * When every thud lands: one tempo, from frame zero to the end of the film.
 *
 * Laid out on a grid rather than walked forward through the run, because the
 * tempo does not change — 60/bpm seconds apart, which is the interval the
 * athlete's own heart kept. Real time, not compressed to fit the film: that is
 * the whole difference between hearing a heart rate and watching a time-lapse
 * of one.
 *
 * Beats are laid on `round(index * interval)`, so the *mean* interval is exact
 * — the error never accumulates — while any single gap is the difference of two
 * roundings and can therefore be up to a whole frame out, 33 ms at 30 fps. That
 * is the one place the film is not literally the athlete's heart, and it is
 * inaudible: the drift is bounded rather than compounding, so the thousandth
 * beat is as much in time as the first.
 */
export function pulseBeats(
  series: HeartSeries,
  mode: PulseMode,
  fps: number,
  durationInFrames: number,
): PulseBeat[] {
  const bpm = clampBpm(pulseReading(series, mode).bpm);
  const interval = beatSeconds(bpm) * fps;
  const pulses: PulseBeat[] = [];
  for (let index = 0; index < MAX_BEATS; index += 1) {
    const frame = Math.round(index * interval);
    if (frame >= durationInFrames) break;
    pulses.push({ frame, bpm });
  }
  return pulses;
}

/**
 * Everything the component draws, worked out once.
 *
 * `durationInFrames` is what the composition was actually handed — the
 * calculated duration on Lambda and in the player, the catalogue's default
 * anywhere `calculateMetadata` didn't run — and the closing hold stretches to
 * fill it, so the film never ends on black.
 */
export function heartbeatPlan(
  activity: VideoActivity,
  streams: VideoStreams,
  fps: number,
  durationInFrames: number,
  mode: PulseMode,
): HeartbeatPlan {
  const series = heartSeries(activity, streams);
  const boxes = heartbeatBoxes(series.charted);
  const total = durationInFrames / fps;
  const beats = buildBeats(
    [
      { id: "open", seconds: OPEN_SECONDS },
      {
        id: "trace",
        seconds: Math.max(
          MIN_TRACE_SECONDS,
          total - OPEN_SECONDS - HOLD_SECONDS,
        ),
      },
      { id: "hold", seconds: HOLD_SECONDS },
    ],
    fps,
    durationInFrames,
  );

  return {
    series,
    mode,
    boxes,
    points: boxes.trace ? tracePoints(series, boxes.trace) : [],
    beats,
    pulses: pulseBeats(series, mode, fps, durationInFrames),
    headline: pulseReading(series, mode),
    // The tile the headline already owns is left out rather than printed
    // twice — a row that repeats the number above it is the template admitting
    // it wanted three cells.
    stats: [
      mode === "peak"
        ? { label: "Average", value: String(series.average), unit: "bpm" }
        : { label: "Max", value: String(series.max), unit: "bpm" },
      { label: "Time", value: formatClock(activity.moving_time) },
      { label: "Distance", value: formatKm(activity.distance), unit: "km" },
    ],
  };
}
