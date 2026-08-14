/**
 * Split Rush's maths: kilometre splits out of the streams, the bar encoding,
 * the verdict, and the beat plan the component reads.
 *
 * All of it pure and React-free — the catalogue's duration estimate calls into
 * here, and the tests assert the layout stays in the safe area without anything
 * having to render.
 */
import { averagePace, formatPace, formatSplitLabel } from "../../core/format";
import { LOGO_TOP } from "../../core/layout";
import { buildBeats, secondsToFrames, type Beat } from "../../core/timing";
import type { VideoActivity, VideoStreams } from "../../types";

/** One split is one kilometre. Metric only — see `core/format.ts`. */
export const SPLIT_METERS = 1000;

/** A tail shorter than this is a rounding error on the GPS, not a split. */
const MIN_PARTIAL_METERS = 60;

/** …and a tail this close to a full kilometre *is* one. A stream that ends five
 *  metres short would otherwise close the film on a partial split labelled
 *  "1.0", which is a rounding error wearing a costume. */
const FULL_TOLERANCE_METERS = 5;

/**
 * Below this, the athlete is standing still.
 *
 * Strava's `time` stream is elapsed, not moving, so a run with a coffee stop in
 * it has a kilometre that took eleven minutes. Any interval slower than a slow
 * walk has its clock stopped at this speed, which is how "use moving time only"
 * is implemented against a stream that doesn't carry it.
 */
const MIN_MOVING_SPEED = 0.5;

export interface Split {
  /** 0-based, so `index + 1` is the kilometre the athlete would call it. */
  index: number;
  /** Metres in this split — `SPLIT_METERS`, or the tail on the last one. */
  distanceMeters: number;
  /** Moving seconds. */
  seconds: number;
  paceSecondsPerKm: number;
  /** True for a final split short of a full kilometre. */
  partial: boolean;
  /** `7` for the seventh kilometre, `0.4` for a 400 m tail. */
  label: string;
}

const finite = (value: number | undefined): number =>
  value != null && Number.isFinite(value) ? value : 0;

/**
 * Kilometre splits from the distance and time streams.
 *
 * Boundaries are interpolated inside the sample they fall in, so a 1 Hz stream
 * doesn't quantise every split to the nearest second of the athlete's stride.
 * With no usable streams — a treadmill upload that carries only totals — the run
 * is split at its average pace, which is what it actually was.
 */
export function computeSplits(
  activity: VideoActivity,
  streams: VideoStreams,
): Split[] {
  const distance = streams.distance?.data;
  const time = streams.time?.data;
  const samples = Math.min(distance?.length ?? 0, time?.length ?? 0);

  const raw =
    samples >= 2 && distance && time
      ? splitsFromStreams(distance, time, samples)
      : evenSplits(activity);

  return scaleToMovingTime(raw, activity).map((split, index) => ({
    ...split,
    index,
    label: formatSplitLabel(split.distanceMeters, index, split.partial),
    paceSecondsPerKm:
      split.distanceMeters > 0
        ? (split.seconds * SPLIT_METERS) / split.distanceMeters
        : 0,
  }));
}

type RawSplit = Omit<Split, "index" | "label" | "paceSecondsPerKm">;

function splitsFromStreams(
  distance: readonly number[],
  time: readonly number[],
  samples: number,
): RawSplit[] {
  const splits: RawSplit[] = [];
  let splitMeters = 0;
  let splitSeconds = 0;

  for (let i = 1; i < samples; i += 1) {
    const dd = Math.max(0, finite(distance[i]) - finite(distance[i - 1]));
    const elapsed = Math.max(0, finite(time[i]) - finite(time[i - 1]));
    // Stopped time never reaches a split: an interval is worth at most what it
    // would have taken at a walk.
    const dt = Math.min(elapsed, dd / MIN_MOVING_SPEED);
    if (dd === 0) continue;

    let remaining = dd;
    let seconds = dt;
    while (splitMeters + remaining >= SPLIT_METERS) {
      const needed = SPLIT_METERS - splitMeters;
      const share = (needed / remaining) * seconds;
      splits.push({
        distanceMeters: SPLIT_METERS,
        seconds: splitSeconds + share,
        partial: false,
      });
      remaining -= needed;
      seconds -= share;
      splitMeters = 0;
      splitSeconds = 0;
    }
    splitMeters += remaining;
    splitSeconds += seconds;
  }

  if (splitMeters >= MIN_PARTIAL_METERS) {
    splits.push({
      distanceMeters: splitMeters,
      seconds: splitSeconds,
      partial: splitMeters < SPLIT_METERS - FULL_TOLERANCE_METERS,
    });
  }
  return splits;
}

/** The run at its own average pace — every split identical, which is exactly
 *  what a treadmill at a fixed speed was. */
function evenSplits(activity: VideoActivity): RawSplit[] {
  const total = Math.max(0, activity.distance);
  const pace = total > 0 ? activity.moving_time / total : 0;
  const splits: RawSplit[] = [];
  for (let covered = 0; covered < total; covered += SPLIT_METERS) {
    const meters = Math.min(SPLIT_METERS, total - covered);
    if (meters < MIN_PARTIAL_METERS && splits.length > 0) break;
    splits.push({
      distanceMeters: meters,
      seconds: meters * pace,
      partial: meters < SPLIT_METERS - FULL_TOLERANCE_METERS,
    });
  }
  return splits;
}

/**
 * Make the splits add up to the moving time on the activity card.
 *
 * The stopped-time clamp above is a heuristic against a stream that doesn't say
 * where the pauses were; Strava's own `moving_time` is the answer. Scaling to it
 * is what stops the video's splits disagreeing with the totals printed under
 * them. A ratio outside a factor of two means the streams are describing a
 * different activity, and then the streams win.
 */
function scaleToMovingTime(
  splits: RawSplit[],
  activity: VideoActivity,
): RawSplit[] {
  const total = splits.reduce((sum, split) => sum + split.seconds, 0);
  const moving = activity.moving_time;
  if (total <= 0 || moving <= 0) return splits;
  const ratio = moving / total;
  if (ratio < 0.5 || ratio > 2) return splits;
  return splits.map((split) => ({ ...split, seconds: split.seconds * ratio }));
}

/* ---- The bar encoding ---------------------------------------------------- */

/** The shortest a bar gets. Zero-length bars for the slowest kilometre would
 *  read as a missing one, and there is no such thing as a bad split here. */
const MIN_BAR = 0.4;

/** What every bar is when there is nothing to encode. Deliberately short of the
 *  full measure: a column of bars that all reach the edge reads as a stack of
 *  progress indicators, not as a chart of a run held at one pace. */
export const FLAT_BAR = 0.72;

/** Below this spread, every split was the same split. */
const FLAT_SPREAD = 0.01;

export interface SplitEncoding {
  /** 0–1 of the available measure, one per split, in split order. */
  widths: number[];
  /** Index of the fastest full split, or -1 when they are all the same. */
  fastestIndex: number;
  /** True when the spread is too small to encode — a treadmill at one speed. */
  flat: boolean;
}

/**
 * Bar length encodes **speed, not pace** — longer means faster. The inverse is
 * technically defensible and reads as wrong to every single person who sees it.
 *
 * The range is normalised onto [0.4, 1] rather than drawn proportionally:
 * a consistent run's paces differ by a few percent, and proportional bars would
 * make ten identical-looking rows out of a run that had a story in it.
 */
export function encodeSplits(splits: Split[]): SplitEncoding {
  // A run with no splits at all — a zero-distance activity — has nothing to
  // encode, and every downstream branch reads `flat` to mean "no comparison
  // here", which is exactly the truth.
  if (splits.length === 0) return { widths: [], fastestIndex: -1, flat: true };
  const full = splits.filter((split) => !split.partial);
  const pool = full.length > 0 ? full : splits;
  const speed = (split: Split) =>
    split.seconds > 0 ? split.distanceMeters / split.seconds : 0;
  const speeds = pool.map(speed);
  const fastest = Math.max(...speeds);
  const slowest = Math.min(...speeds);
  const mean =
    speeds.reduce((sum, value) => sum + value, 0) / Math.max(1, speeds.length);
  const flat = mean <= 0 || (fastest - slowest) / mean < FLAT_SPREAD;

  const widths = splits.map((split) => {
    const normalised = flat
      ? FLAT_BAR
      : MIN_BAR +
        ((speed(split) - slowest) / (fastest - slowest)) * (1 - MIN_BAR);
    // A partial split's bar is cut to the distance it covered: a 400 m tail that
    // drew a full-width bar would claim a kilometre that wasn't run.
    const fraction = split.partial ? split.distanceMeters / SPLIT_METERS : 1;
    return Math.min(1, Math.max(0, normalised)) * fraction;
  });

  const fastestIndex = flat
    ? -1
    : splits.reduce(
        (best, split, index) =>
          split.partial || (best >= 0 && speed(splits[best]) >= speed(split))
            ? best
            : index,
        -1,
      );

  return { widths, fastestIndex, flat };
}

/* ---- The verdict --------------------------------------------------------- */

export type VerdictId =
  | "negative-split"
  | "fastest-finish"
  | "metronome"
  | "fastest-split"
  | "average-pace";

export interface Verdict {
  id: VerdictId;
  /** The line in the middle of the closing card. */
  headline: string;
  /** The line under it. Never a comparison the athlete lost. */
  detail: string;
}

export interface SplitStats {
  meanPace: number;
  stdevPace: number;
  firstHalfPace: number;
  secondHalfPace: number;
  /** Index of the split furthest ahead of the running average before it. */
  breakawayIndex: number;
}

export function splitStats(splits: Split[]): SplitStats {
  const full = splits.filter((split) => !split.partial);
  const pool = full.length > 0 ? full : splits;
  const paces = pool.map((split) => split.paceSecondsPerKm);
  const mean =
    paces.reduce((sum, pace) => sum + pace, 0) / Math.max(1, paces.length);
  const variance =
    paces.reduce((sum, pace) => sum + (pace - mean) ** 2, 0) /
    Math.max(1, paces.length);

  const half = Math.floor(pool.length / 2);
  const average = (from: number, to: number) => {
    const slice = pool.slice(from, to);
    const meters = slice.reduce((sum, split) => sum + split.distanceMeters, 0);
    const seconds = slice.reduce((sum, split) => sum + split.seconds, 0);
    return meters > 0 ? (seconds * SPLIT_METERS) / meters : mean;
  };

  // The biggest step down from the pace the run had been holding — the moment
  // the athlete decided to go, which is the one worth zooming to on a long run.
  let breakawayIndex = -1;
  let best = 0;
  let running = 0;
  for (let i = 0; i < pool.length; i += 1) {
    if (i > 0) {
      const improvement = running / i - pool[i].paceSecondsPerKm;
      if (improvement > best) {
        best = improvement;
        breakawayIndex = pool[i].index;
      }
    }
    running += pool[i].paceSecondsPerKm;
  }

  return {
    meanPace: mean,
    stdevPace: Math.sqrt(variance),
    firstHalfPace: average(0, half),
    secondHalfPace: average(half, pool.length),
    breakawayIndex,
  };
}

/**
 * Exactly one verdict, chosen in priority order.
 *
 * Every branch is neutral or positive, by rule: nothing in this template ever
 * tells an athlete they slowed down, and there is no such thing here as a
 * slowest kilometre. A run that has no story gets its average pace, which is a
 * fact rather than a judgement.
 *
 * The consistency branch says "Metronome pacing" and not "most consistent run
 * yet" — that claim needs the athlete's last ten runs, and this template is
 * handed exactly one.
 */
export function chooseVerdict(
  splits: Split[],
  activity: VideoActivity,
): Verdict {
  const fallback: Verdict = {
    id: "average-pace",
    headline: `Average pace — ${formatPace(averagePace(activity))}`,
    detail: "PER KILOMETRE",
  };

  const full = splits.filter((split) => !split.partial);
  if (full.length < 2) return fallback;

  const stats = splitStats(splits);
  const encoding = encodeSplits(splits);
  // A treadmill at one speed has no fastest kilometre and did not negative
  // split; it ran the pace it was set to, and saying so is the whole verdict.
  if (encoding.flat) return fallback;

  if (
    stats.firstHalfPace > 0 &&
    stats.secondHalfPace <= stats.firstHalfPace * 0.99
  ) {
    const gain = Math.round(
      (1 - stats.secondHalfPace / stats.firstHalfPace) * 100,
    );
    return {
      id: "negative-split",
      headline: "Negative split",
      detail: `SECOND HALF ${Math.max(1, gain)}% FASTER`,
    };
  }

  const last = full[full.length - 1];
  if (encoding.fastestIndex === last.index) {
    return {
      id: "fastest-finish",
      headline: "Fastest finish",
      detail: `LAST KM — ${formatPace(last.paceSecondsPerKm)}`,
    };
  }

  if (stats.meanPace > 0 && stats.stdevPace / stats.meanPace < 0.03) {
    return {
      id: "metronome",
      headline: "Metronome pacing",
      detail: `EVERY KM WITHIN ${Math.max(1, Math.round(stats.stdevPace * 2))}S`,
    };
  }

  const fastest = splits[encoding.fastestIndex];
  if (
    fastest &&
    stats.meanPace > 0 &&
    fastest.paceSecondsPerKm <= stats.meanPace * 0.9
  ) {
    return {
      id: "fastest-split",
      headline: `Fastest km — ${formatPace(fastest.paceSecondsPerKm)}`,
      detail: `KILOMETRE ${fastest.index + 1}`,
    };
  }

  return fallback;
}

/* ---- The plan ------------------------------------------------------------ */

/** Above ten, cascading one card per split is a slideshow. */
export const CASCADE_LIMIT = 10;

export type SplitRushMode = "cascade" | "strip";

/** Where a split's row sits, in composition pixels. */
export interface SplitRow {
  top: number;
  height: number;
  /** The bar's own height inside the row. */
  barHeight: number;
}

export interface SplitRushPlan {
  splits: Split[];
  encoding: SplitEncoding;
  verdict: Verdict;
  mode: SplitRushMode;
  /** The three splits a long run zooms to: fastest, final, breakaway. */
  heroes: Split[];
  rows: SplitRow[];
  beats: Beat[];
}

/** The band the rows live in: under the header, above the lockup. */
const ROWS_TOP = 470;
const ROWS_BOTTOM = LOGO_TOP - 80;

const SPAN = {
  title: 1.2,
  isolate: 1.5,
  verdict: 3,
  strip: 2.6,
  hero: 1.3,
  /** One split card. The spec's 0.5–0.7s window, at its middle. */
  cascadeStep: 0.6,
};

/** Seconds of film for a given run — variable by design. A five-kilometre run
 *  has less to say than a marathon and shouldn't be padded to the same length. */
export function splitRushSeconds(
  activity: VideoActivity,
  streams: VideoStreams,
): number {
  const splits = computeSplits(activity, streams);
  const encoding = encodeSplits(splits);
  // Nothing to isolate and nothing to compare: the film is the totals, so it
  // ends as soon as it has shown them.
  if (encoding.flat) return 8;
  if (splits.length > CASCADE_LIMIT) {
    return SPAN.title + SPAN.strip + SPAN.hero * 3 + SPAN.verdict;
  }
  return Math.min(
    14,
    SPAN.title + splits.length * SPAN.cascadeStep + SPAN.isolate + SPAN.verdict,
  );
}

/**
 * Everything the component draws, worked out once.
 *
 * `durationInFrames` is what the composition was actually given — the calculated
 * duration on Lambda and in the player, the catalogue's default anywhere else —
 * and the closing card stretches to fill it, so the film never ends on black.
 */
export function splitRushPlan(
  activity: VideoActivity,
  streams: VideoStreams,
  fps: number,
  durationInFrames: number,
): SplitRushPlan {
  const splits = computeSplits(activity, streams);
  const encoding = encodeSplits(splits);
  const verdict = chooseVerdict(splits, activity);
  const stats = splitStats(splits);
  const mode: SplitRushMode =
    splits.length > CASCADE_LIMIT ? "strip" : "cascade";

  const byIndex = (index: number) =>
    splits.find((split) => split.index === index) ?? null;
  const full = splits.filter((split) => !split.partial);
  const heroes =
    mode === "strip"
      ? ([
          byIndex(encoding.fastestIndex),
          full[full.length - 1] ?? null,
          byIndex(stats.breakawayIndex),
        ].filter(
          (split, index, list) =>
            Boolean(split) &&
            list.findIndex((other) => other?.index === split?.index) === index,
        ) as Split[])
      : [];

  const count = Math.max(1, splits.length);
  const band = ROWS_BOTTOM - ROWS_TOP;
  const height = Math.min(mode === "cascade" ? 118 : 34, band / count);
  // Centred in the band, not hung from the top of it: five kilometres would
  // otherwise fill half the frame and leave the other half wondering.
  const top = ROWS_TOP + (band - height * splits.length) / 2;
  const rows: SplitRow[] = splits.map((_, index) => ({
    top: top + index * height,
    height,
    barHeight: Math.max(
      6,
      Math.round(height * (mode === "cascade" ? 0.42 : 0.5)),
    ),
  }));

  const spans = encoding.flat
    ? [
        { id: "title", seconds: SPAN.title },
        { id: "splits", seconds: 3.5 },
        { id: "verdict", seconds: SPAN.verdict },
      ]
    : mode === "strip"
      ? [
          { id: "title", seconds: SPAN.title },
          { id: "splits", seconds: SPAN.strip },
          { id: "heroes", seconds: SPAN.hero * Math.max(1, heroes.length) },
          { id: "verdict", seconds: SPAN.verdict },
        ]
      : [
          { id: "title", seconds: SPAN.title },
          { id: "splits", seconds: splits.length * SPAN.cascadeStep },
          { id: "isolate", seconds: SPAN.isolate },
          { id: "verdict", seconds: SPAN.verdict },
        ];

  return {
    splits,
    encoding,
    verdict,
    mode,
    heroes,
    rows,
    beats: buildBeats(spans, fps, durationInFrames),
  };
}

/** The frame a given split's row enters on. */
export function splitEntryFrame(
  plan: SplitRushPlan,
  index: number,
  fps: number,
): number {
  const beat = plan.beats.find((entry) => entry.id === "splits");
  if (!beat) return 0;
  const step =
    plan.mode === "strip"
      ? secondsToFrames(0.04, fps)
      : Math.max(
          1,
          Math.floor((beat.to - beat.from) / Math.max(1, plan.splits.length)),
        );
  return beat.from + index * step;
}

export { ROWS_TOP, ROWS_BOTTOM };
