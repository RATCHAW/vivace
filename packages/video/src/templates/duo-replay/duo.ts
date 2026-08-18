/**
 * Two runners on one clock.
 *
 * The replay draws one route under one set of numbers. This draws two, and
 * every hard question in the template is the same question: *when* is each of
 * them, right now? Answer that once, in seconds of real time, and the traces,
 * the camera, the bars and both sets of numbers all fall out of it and cannot
 * disagree with each other.
 *
 * Real time, not a shared 0–1 progress: two people who ran together did not
 * start on the same tick and did not finish on the same one either. Stretching
 * both runs to fill the film would hide exactly the thing the film is of — one
 * of them pulling away — and would have the slower runner cross their own
 * finish line at the same instant as the faster one.
 *
 * React-free: the eligibility rule and the layout tests read from here.
 */
import type { LatLng, RoutePadding } from "../../core/geo";
import { CANVAS_HEIGHT, SAFE_BOTTOM, SAFE_TOP } from "../../core/layout";
import { liveMetrics, type LiveMetrics } from "../../core/metrics";
import { clamp01, sampleIndex } from "../../core/timing";
import type { VideoActivity, VideoPartner, VideoStreams } from "../../types";

/* ---- Who is who --------------------------------------------------------- */

/** Which of the two a runner is. Also the key on their map layer, so the trace
 *  and the bar under it can never end up belonging to different people. */
export type DuoKey = "you" | "partner";

/**
 * The two inks.
 *
 * Cobalt is the athlete whose film this is — the same ink the single-runner
 * replay draws in, so their own line looks the same in both cuts. Teal is
 * DESIGN.md's `{colors.accent-teal}`, an illustration colour and never a button
 * surface, which is exactly what a route trace is. The pair is chosen to stay
 * two colours under red–green colour blindness, where a second cobalt at a
 * different lightness would not.
 */
export const DUO_INK: Record<DuoKey, string> = {
  // {colors.primary}
  you: "#494fdf",
  // {colors.accent-teal}
  partner: "#00a87e",
};

export interface DuoRunner {
  key: DuoKey;
  /** Shown on their bar. Empty falls back to the key's own word upstream. */
  name: string;
  activity: VideoActivity;
  streams: VideoStreams;
  /** Their picture when the avatar option is on, else "" for the plain dot. */
  avatarUrl: string;
  color: string;
  points: LatLng[];
}

/** The film's two runners, in drawing order: the athlete first, their partner
 *  second, so the partner's trace sits over theirs where the routes touch. */
export function duoRunners(
  activity: VideoActivity,
  streams: VideoStreams,
  avatarUrl: string,
  partner: VideoPartner,
  name = "You",
): [DuoRunner, DuoRunner] {
  return [
    {
      key: "you",
      name,
      activity,
      streams,
      avatarUrl,
      color: DUO_INK.you,
      points: streams.latlng?.data ?? [],
    },
    {
      key: "partner",
      name: partner.name,
      activity: partner.activity,
      streams: partner.streams,
      avatarUrl: partner.avatarUrl,
      color: DUO_INK.partner,
      points: partner.streams.latlng?.data ?? [],
    },
  ];
}

/* ---- The shared clock --------------------------------------------------- */

/**
 * How much later than the first of them a runner may set off before the wall
 * clock stops being worth believing.
 *
 * Watches are started by hand and catch GPS at their own pace, so a stagger of
 * a minute or two is the normal case and is a fact about the run worth drawing.
 * Past a fifth of the shorter run it is something else — a mis-set device, or
 * two sessions that were not really the same one — and a bar that sits empty
 * for a fifth of the film reads as a bug rather than as a late start. Then the
 * two are lined up at zero instead, which is the other honest reading.
 */
const MAX_STAGGER_SHARE = 0.2;

export interface DuoClock {
  /** Seconds after the film's origin at which each runner sets off, in the
   *  order the runners were given. One of them is always 0. */
  offsetSeconds: [number, number];
  /** How long the film's clock runs: the last of them crossing their own line. */
  totalSeconds: number;
  /** True when the stagger was read off the two start times. False when one was
   *  hidden or implausible, and both were lined up at zero. */
  fromWallClock: boolean;
}

/** How long a run actually took, preferring the watch's own last tick — the
 *  streams know about the three minutes it spent stopped at a crossing and
 *  `moving_time`, by definition, does not. */
export function runSeconds(
  activity: VideoActivity,
  streams: VideoStreams,
): number {
  const time = streams.time?.data;
  const last = time && time.length > 0 ? time[time.length - 1] : 0;
  return Math.max(
    1,
    Number.isFinite(last) && last > 0 ? last : activity.moving_time,
  );
}

/**
 * Strava obscures a hidden start time as midnight plus one second, local.
 *
 * Two runs hidden on the same day both read `00:00:01`, so the stagger between
 * them would come out as a flat zero that looks like a fact. apps/api drops
 * these when it ranks candidates for the same reason; here they fall back to
 * the aligned clock, which is what a zero stagger would have drawn anyway —
 * only now the template knows it is a fallback and can say so.
 *
 * https://developers.strava.com/docs/changelog/ (3 July 2024)
 */
export function hasObscuredStart(activity: VideoActivity): boolean {
  const at = new Date(activity.start_date_local);
  return (
    at.getUTCHours() === 0 &&
    at.getUTCMinutes() === 0 &&
    at.getUTCSeconds() === 1
  );
}

/**
 * The clock both runners are drawn against.
 *
 * Comparing two athletes' `start_date_local` is normally a bug — it is a wall
 * clock with a `Z` stapled to it, so two runners in different zones read as
 * hours apart. It is the right field *here*, and only here: two people who ran
 * the same run were in the same place, so their wall clocks agree by
 * construction.
 */
export function duoClock(runners: readonly DuoRunner[]): DuoClock {
  const lengths = runners.map((runner) =>
    runSeconds(runner.activity, runner.streams),
  );
  const starts = runners.map((runner) =>
    Date.parse(runner.activity.start_date_local),
  );

  const readable =
    starts.every((start) => Number.isFinite(start)) &&
    runners.every((runner) => !hasObscuredStart(runner.activity));
  const origin = Math.min(...starts);
  const stagger = readable
    ? starts.map((start) => (start - origin) / 1000)
    : starts.map(() => 0);
  const plausible =
    readable &&
    Math.max(...stagger) <= MAX_STAGGER_SHARE * Math.min(...lengths);

  const offsetSeconds = (plausible ? stagger : starts.map(() => 0)) as [
    number,
    number,
  ];
  return {
    offsetSeconds,
    totalSeconds: Math.max(
      ...lengths.map((length, index) => length + offsetSeconds[index]),
    ),
    fromWallClock: plausible,
  };
}

/* ---- Where each of them is, this frame ---------------------------------- */

export interface RunnerFrame {
  runner: DuoRunner;
  /** True once their own clock has started. */
  started: boolean;
  /** True once they have crossed their own finish line. */
  finished: boolean;
  /** 0–1 through their own run. */
  progress: number;
  /** How many of their route's points are on the plate; 0 before they set off,
   *  which is what `core/RouteMap` reads as "start marker only". */
  drawn: number;
  live: LiveMetrics;
}

/**
 * Where in their own run a runner is, `seconds` into the film's clock.
 *
 * Read off the time stream rather than divided out of the total, so a watch
 * that was paused at a level crossing puts the dot where the athlete actually
 * was rather than three minutes further down the road.
 */
export function progressAtSeconds(
  streams: VideoStreams,
  seconds: number,
  lengthSeconds: number,
): number {
  const time = streams.time?.data;
  if (!time || time.length < 2) {
    return lengthSeconds > 0 ? clamp01(seconds / lengthSeconds) : 0;
  }
  if (seconds <= time[0]) return 0;
  if (seconds >= time[time.length - 1]) return 1;

  // Binary search: a marathon's stream is 12,000 samples and this runs twice a
  // frame, on Lambda, where every millisecond is billed.
  let low = 0;
  let high = time.length - 1;
  while (high - low > 1) {
    const mid = (low + high) >> 1;
    if (time[mid] <= seconds) low = mid;
    else high = mid;
  }
  return low / (time.length - 1);
}

/** Where each runner is, `drawProgress` through the *draw* — which is the film's
 *  clock, not either athlete's. Everything but the numbers, which cost enough to
 *  be worth leaving to the caller that actually draws them. */
function duoPositions(
  runners: readonly DuoRunner[],
  clock: DuoClock,
  drawProgress: number,
): Array<Omit<RunnerFrame, "runner" | "live">> {
  const seconds = clamp01(drawProgress) * clock.totalSeconds;

  return runners.map((runner, index) => {
    const length = runSeconds(runner.activity, runner.streams);
    const own = seconds - clock.offsetSeconds[index];
    const started = own >= 0;
    const progress = started
      ? progressAtSeconds(runner.streams, Math.min(own, length), length)
      : 0;
    return {
      started,
      finished: own >= length,
      progress,
      drawn: started ? sampleIndex(runner.points.length, progress) + 1 : 0,
    };
  });
}

/** How many points of each route are on the plate — what the camera track is
 *  built from, and the reason the positions are separable from the numbers: the
 *  track samples this a few hundred times and needs none of them. */
export function duoDrawnAt(
  runners: readonly DuoRunner[],
  clock: DuoClock,
  drawProgress: number,
): number[] {
  return duoPositions(runners, clock, drawProgress).map(
    (position) => position.drawn,
  );
}

/** Both runners' state at a 0–1 progress through the draw, numbers included. */
export function duoFrame(
  runners: readonly DuoRunner[],
  clock: DuoClock,
  drawProgress: number,
  fps: number,
  drawFrames: number,
): RunnerFrame[] {
  return duoPositions(runners, clock, drawProgress).map((position, index) => ({
    runner: runners[index],
    ...position,
    live: liveMetrics(
      runners[index].activity,
      runners[index].streams,
      position.progress,
      fps,
      drawFrames,
    ),
  }));
}

/**
 * How full each runner's bar is, 0–1.
 *
 * Both are measured against the *longer* of the two runs, so the two bars share
 * one scale and the gap between them is the gap between the runners. Scaling
 * each to its own total would draw two full bars at the end of a film whose
 * whole subject is that one of them went further.
 */
export function duoBarFill(frames: readonly RunnerFrame[]): number[] {
  const furthest = Math.max(
    ...frames.map((frame) => frame.runner.activity.distance),
    0,
  );
  if (furthest <= 0) return frames.map(() => 0);
  return frames.map((frame) => clamp01(frame.live.distanceMeters / furthest));
}

/* ---- Layout ------------------------------------------------------------- */

/*
 * The bottom band carries two rows instead of one hero number, so it is taller
 * than the replay's and the map's safe box is shorter. Both are spelled out as
 * pure numbers rather than emerging from a flex column, because `duo.test.ts`
 * asserts they land inside the story's safe area — which is a thing you can
 * check without rendering a frame, and only if the maths is out here.
 */

/** One runner's bar: name, three numbers, and the fill under them. */
export const DUO_ROW_HEIGHT = 128;

/** Between the two rows. Wide enough that they read as two athletes rather than
 *  as one table with two lines. */
export const DUO_ROW_GAP = 40;

/** The band sits on the floor of the safe area, a gutter clear of it. */
const DUO_ROWS_BOTTOM = SAFE_BOTTOM - 40;

/** Where each runner's row starts, top down. */
export const DUO_ROW_TOPS: [number, number] = [
  DUO_ROWS_BOTTOM - 2 * DUO_ROW_HEIGHT - DUO_ROW_GAP,
  DUO_ROWS_BOTTOM - DUO_ROW_HEIGHT,
];

/** The title band: the run's name and its date, under the story's own furniture. */
export const DUO_TITLE_TOP = SAFE_TOP;

/** The box the two rows occupy, for the safe-area assertion. */
export const DUO_ROWS_BOX = {
  top: DUO_ROW_TOPS[0],
  height: DUO_ROWS_BOTTOM - DUO_ROW_TOPS[0],
};

/**
 * The map's safe box: the title band above, both runners' rows below.
 *
 * Wider gutters than the replay's, because two traces coming apart is the shot
 * — a camera framed to the pixel on a pair that has just split reads as a shot
 * about to lose one of them.
 */
export const DUO_ROUTE_PADDING: RoutePadding = {
  top: 460,
  right: 130,
  bottom: CANVAS_HEIGHT - DUO_ROW_TOPS[0] + 40,
  left: 130,
};
