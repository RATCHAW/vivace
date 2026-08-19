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
import { formatClock, formatKm, formatPace } from "../../core/format";
import type { LatLng, RoutePadding } from "../../core/geo";
import {
  estimateTextWidth,
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  PAGE_INSET,
  SAFE_BOTTOM,
  SAFE_TOP,
} from "../../core/layout";
import { liveMetrics, type LiveMetrics } from "../../core/metrics";
import {
  clamp01,
  easeOutBack,
  easeOutCubic,
  mix,
  ramp,
  sampleIndex,
} from "../../core/timing";
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

/**
 * One of the three numbers on a running row.
 *
 * Out here with the rest of the layout maths, and with an explicit line height
 * on the label, because the name beside it and the fill under it both leave the
 * row during the closing move and have to be positioned on their own. A height
 * that came out of the browser could not be: `line-height: normal` is a font
 * metric, so the row would be one height on Lambda and another in a test.
 */
export const DUO_ROW_METRIC = {
  label: 24,
  labelLine: 30,
  gap: 6,
  value: 58,
  unit: 26,
  /** Between the unit and the value it belongs to. */
  unitGap: 8,
  /** Between one metric and the next. */
  between: 44,
} as const;

/** The top line of a row — the name on the left, the three numbers on the
 *  right. */
export const DUO_ROW_HEAD_HEIGHT =
  DUO_ROW_METRIC.labelLine + DUO_ROW_METRIC.gap + DUO_ROW_METRIC.value;

/** The fill under one runner's numbers. */
export const DUO_BAR_HEIGHT = 8;

/**
 * Roughly how wide a runner's three numbers are, this frame.
 *
 * Estimated rather than measured — nothing in this package may measure, or a
 * headless Chromium and a jsdom test would disagree about it — and estimated in
 * the direction `layout.ts` rounds, which is up. Too wide clips a long name a
 * character early; too narrow runs it under a number.
 */
export function duoNumbersWidth(live: LiveMetrics): number {
  const { value, unit, unitGap, between } = DUO_ROW_METRIC;
  const number = (text: string) => estimateTextWidth(text, value, -0.02);
  return (
    number(formatKm(live.distanceMeters)) +
    number(formatClock(live.elapsedSeconds)) +
    number(formatPace(live.paceSecondsPerKm)) +
    unitGap +
    estimateTextWidth("/KM", unit) +
    2 * between
  );
}

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

/* ---- The closing card ---------------------------------------------------- */

/*
 * The film has two movements now: the replay, and then the same film taking
 * itself apart and standing back up as a card.
 *
 * The card is carved out of the draw rather than added after it. A story
 * segment is cut at fifteen seconds (`MAX_STORY_SECONDS`) and this template was
 * already sitting on that ceiling, so the draw ends earlier instead — it loses
 * about two and a half seconds, and the film gains an ending that is worth
 * pausing on. Fractions of the duration, not frames, for the same reason the
 * draw window is: the length is handed over at runtime.
 */

/** The draw opens holding on the start line for a beat… */
export const DUO_DRAW_FROM = 0.06;
/** …and both routes are complete here, with the running layout still up. */
export const DUO_DRAW_TO = 0.74;
/** A held beat on the finished replay, and then the move begins. */
export const DUO_OUTRO_FROM = 0.76;
/** How much of the film the move itself takes — a second and a half of fifteen,
 *  which leaves the card a good two seconds to be held on. */
export const DUO_OUTRO_TRAVEL = 0.1;

/**
 * Where every moving part of the closing move is, 0–1.
 *
 * One raw progress with a stagger read off it, rather than each component
 * inventing its own window: the map has to be behind its blur before the card
 * lands on it, and the two columns have to arrive one after the other or they
 * read as a slide rather than as two athletes.
 */
export interface DuoOutroPlan {
  /** The raw, unsmoothed progress through the move. What a part with a stagger
   *  of its own measures itself against — see `duoOutroStep`. */
  progress: number;
  /** The travel: what the title, the mark, the names and the fills ride. */
  move: number;
  /** How far the map has receded — its blur and the veil over it. */
  veil: number;
  /** The running layout's three numbers per row, on their way out. */
  rowsOut: number;
  /** Each runner's face arriving over their column. Overshoots 1 by design. */
  avatarIn: [number, number];
  /** Each runner's card plate — empty, and early: it rises with the fill that
   *  is travelling to its foot, so the bar is never a line floating on a map. */
  cardIn: [number, number];
}

/** A part's own window inside the move, eased. `from` and `length` are
 *  fractions of the move, not of the film. */
export function duoOutroStep(
  plan: DuoOutroPlan,
  from: number,
  length: number,
): number {
  return easeOutCubic(ramp(plan.progress, from, length));
}

/**
 * When the `order`-th number of a card arrives, counting down the column.
 *
 * After `rowsOut` has taken the running row's numbers away, always: the same
 * three readings are in both layouts, and the one way this move could read as a
 * mistake is two sets of them dissolving through each other at two sizes.
 */
export function duoOutroMetric(
  plan: DuoOutroPlan,
  card: number,
  order: number,
): number {
  return duoOutroStep(plan, 0.36 + card * 0.06 + order * 0.06, 0.44);
}

/** The closing move at `t`, a 0–1 progress through the whole film. Every field
 *  is 0 until `DUO_OUTRO_FROM`, so the replay is untouched by it. */
export function duoOutro(t: number): DuoOutroPlan {
  const progress = ramp(t, DUO_OUTRO_FROM, DUO_OUTRO_TRAVEL);
  const step = (from: number, length: number) =>
    easeOutCubic(ramp(progress, from, length));

  return {
    progress,
    move: easeOutCubic(progress),
    veil: step(0, 0.75),
    rowsOut: step(0, 0.32),
    // Overshoot, once, on the one beat of the film that is allowed a flourish.
    avatarIn: [
      easeOutBack(ramp(progress, 0.34, 0.55)),
      easeOutBack(ramp(progress, 0.41, 0.55)),
    ],
    cardIn: [step(0.1, 0.55), step(0.16, 0.55)],
  };
}

/* The card's own geometry. Two columns in the same gutter the rows used, so the
 * film keeps one measure from end to end. Pure numbers, like the rows above:
 * `duo.test.ts` asserts the whole card sits inside the story's safe area. */

/** Between the two columns. */
export const DUO_OUTRO_GAP = 40;

export const DUO_OUTRO_COLUMN_WIDTH =
  (CANVAS_WIDTH - 2 * PAGE_INSET - DUO_OUTRO_GAP) / 2;

/** The left edge of each runner's column, in the order the runners are given —
 *  the athlete on the left, the way their bar was the upper of the two. */
export const DUO_OUTRO_COLUMN_LEFT: [number, number] = [
  PAGE_INSET,
  PAGE_INSET + DUO_OUTRO_COLUMN_WIDTH + DUO_OUTRO_GAP,
];

/** The title band drops under the mark, which has come back to the middle. */
export const DUO_OUTRO_TITLE_TOP = 344;

/** The faces, over their own columns. Bigger than the puck that rode the trace
 *  — on the map it only had to be spotted, here it is the subject. */
export const DUO_OUTRO_AVATAR_TOP = 686;
export const DUO_OUTRO_AVATAR_SIZE = 220;
export const DUO_OUTRO_AVATAR_RING = 10;

/** Where a runner's name lands, in a box the height of the row line it left. */
export const DUO_OUTRO_NAME_TOP = 916;

/* The card sits on the same floor the two rows did — `SAFE_BOTTOM` less a
 * gutter — rather than wherever stacking three numbers happened to end. A
 * closing frame with a third of the story empty under it reads as a film that
 * lost its bottom half, and the band above is where the blurred run shows
 * through. */
export const DUO_OUTRO_CARD_TOP = 1024;
export const DUO_OUTRO_CARD_HEIGHT = 528;
export const DUO_OUTRO_CARD_PADDING = 36;
export const DUO_OUTRO_CARD_RADIUS = 28;

/** The box the closing card occupies, for the safe-area assertion. */
export const DUO_OUTRO_BOX = {
  top: SAFE_TOP,
  height: DUO_OUTRO_CARD_TOP + DUO_OUTRO_CARD_HEIGHT - SAFE_TOP,
};

/** The centre of a runner's column — where their face sits. */
export function duoOutroColumnCentre(index: number): number {
  return DUO_OUTRO_COLUMN_LEFT[index] + DUO_OUTRO_COLUMN_WIDTH / 2;
}

/** A box spanning the frame, given as insets — the shape a travelling part is
 *  positioned with, so it can be laid out against both edges at once. */
export interface DuoInsetBox {
  left: number;
  right: number;
  top: number;
}

/** Between a runner's name and the first of their numbers. */
export const DUO_NAME_GUTTER = 20;

/**
 * Where a runner's name is, `move` through the closing move: on the left of a
 * full-width row at 0, centred over its own column at 1.
 *
 * It travels rather than cross-fading because it is the one thing on screen
 * that is the same in both layouts — the name is what ties the bar the film was
 * playing to the card it ends on.
 *
 * `numbers` is how much room the three numbers to its right take up while the
 * replay is running. The name used to share a flex row with them and be pushed
 * out of their way; on its own layer nothing pushes it, so the room has to be
 * handed over — see `duoNumbersWidth`, which estimates it.
 */
export function duoHeadlineBox(
  index: number,
  move: number,
  numbers = 0,
): DuoInsetBox {
  const left = DUO_OUTRO_COLUMN_LEFT[index];
  return {
    left: mix(move, PAGE_INSET, left),
    right: mix(
      move,
      PAGE_INSET + numbers + DUO_NAME_GUTTER,
      CANVAS_WIDTH - left - DUO_OUTRO_COLUMN_WIDTH,
    ),
    top: mix(move, DUO_ROW_TOPS[index], DUO_OUTRO_NAME_TOP),
  };
}

/** Where a runner's fill is over the same move: the full measure at the foot of
 *  their row at 0, the foot of their own column at 1. The two of them coming
 *  apart is the move — one bar leaves left, the other right. */
export function duoFillBox(index: number, move: number): DuoInsetBox {
  const inner = DUO_OUTRO_COLUMN_LEFT[index] + DUO_OUTRO_CARD_PADDING;
  const innerWidth = DUO_OUTRO_COLUMN_WIDTH - 2 * DUO_OUTRO_CARD_PADDING;
  return {
    left: mix(move, PAGE_INSET, inner),
    right: mix(move, PAGE_INSET, CANVAS_WIDTH - inner - innerWidth),
    top: mix(
      move,
      DUO_ROW_TOPS[index] + DUO_ROW_HEIGHT - DUO_BAR_HEIGHT,
      DUO_OUTRO_CARD_TOP +
        DUO_OUTRO_CARD_HEIGHT -
        DUO_OUTRO_CARD_PADDING -
        DUO_BAR_HEIGHT,
    ),
  };
}
