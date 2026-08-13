// The numbers the coach reasons with.
//
// Everything here is a pure function of runs, streams or Strava best efforts —
// no network, no clock of its own (today always arrives as an argument). That
// is deliberate: a wrong split or a wrong ratio is a wrong answer in the
// athlete's face, so all of it is unit-tested in coach.test.ts.
import type { BestEffort } from "./strava.js";
import type { Run, RunStreams } from "./schemas.js";

// --- formatting ---------------------------------------------------------------

/** Seconds per kilometre as `m:ss`, the unit every runner thinks in. */
export function pace(secondsPerKm: number | null): string | null {
  if (!secondsPerKm || !Number.isFinite(secondsPerKm)) return null;
  const minutes = Math.floor(secondsPerKm / 60);
  const seconds = Math.round(secondsPerKm % 60);
  return seconds === 60
    ? `${minutes + 1}:00`
    : `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/** `1:24:13` / `41:22` — the clock a run is read off. */
export function clock(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.round(totalSeconds % 60);
  const mm = String(minutes).padStart(hours ? 2 : 1, "0");
  return `${hours ? `${hours}:` : ""}${mm}:${String(seconds).padStart(2, "0")}`;
}

/** start_date_local carries the athlete's wall clock with a Z suffix. */
export function localDate(run: Run): string {
  return run.start_date_local.slice(0, 10);
}

/** Monday of the ISO week a date falls in, as `YYYY-MM-DD`. */
export function weekStart(date: string): string {
  const day = new Date(`${date}T00:00:00Z`);
  // getUTCDay(): 0 = Sunday, so Sunday belongs to the week that began 6 days ago.
  const offset = (day.getUTCDay() + 6) % 7;
  day.setUTCDate(day.getUTCDate() - offset);
  return day.toISOString().slice(0, 10);
}

/** `2026-08-13` plus n days, staying on the calendar. */
export function addDays(date: string, days: number): string {
  const day = new Date(`${date}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() + days);
  return day.toISOString().slice(0, 10);
}

/** Whole days from `from` to `to`; negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  const ms =
    new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime();
  return Math.round(ms / 86_400_000);
}

// --- splits -------------------------------------------------------------------

export interface Split {
  km: number;
  pace_per_km: string | null;
  /** The same number the label is formatted from — the bar chart needs to scale. */
  seconds_per_km: number;
  avg_heartrate: number | null;
  partial_km?: number;
}

/**
 * Per-kilometre splits from the distance/time streams, plus the trailing part
 * kilometre. This is what turns "how did Sunday go?" into an answer about the
 * second half fading rather than an average.
 */
export function toSplits(streams: RunStreams): Split[] {
  const distance = streams.distance?.data;
  const time = streams.time?.data;
  if (!distance?.length || !time?.length) return [];

  const heartrate = streams.heartrate?.data;
  const splits: Split[] = [];

  let startIndex = 0;
  let boundary = 1000;

  const push = (endIndex: number, metres: number, partial: boolean) => {
    const seconds = time[endIndex] - time[startIndex];
    if (seconds <= 0 || metres <= 0) return;
    // The sample the kilometre ticked over on closes this split, so the next
    // one starts after it — counting it twice drags both averages together.
    const from = splits.length === 0 ? startIndex : startIndex + 1;
    const beats: number[] = heartrate?.slice(from, endIndex + 1) ?? [];
    const secondsPerKm = (seconds / metres) * 1000;
    splits.push({
      km: splits.length + 1,
      pace_per_km: pace(secondsPerKm),
      seconds_per_km: Math.round(secondsPerKm),
      avg_heartrate: beats.length
        ? Math.round(beats.reduce((sum, bpm) => sum + bpm, 0) / beats.length)
        : null,
      ...(partial ? { partial_km: Number((metres / 1000).toFixed(2)) } : {}),
    });
    startIndex = endIndex;
  };

  for (let i = 0; i < distance.length; i++) {
    if (distance[i] < boundary) continue;
    push(i, distance[i] - distance[startIndex], false);
    boundary += 1000;
  }

  const last = distance.length - 1;
  const trailing = distance[last] - distance[startIndex];
  // Ignore a sliver — a 40 m tail is GPS noise, not a split.
  if (trailing > 100) push(last, trailing, true);

  return splits;
}

// --- route thumbnails ---------------------------------------------------------

/**
 * Google's encoded-polyline algorithm, precision 5 — the format Strava hands
 * back a route's shape in on `map.summary_polyline`.
 */
export function decodePolyline(encoded: string): [number, number][] {
  const points: [number, number][] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    // Each coordinate is a zig-zag-encoded delta in 5-bit chunks, low chunk
    // first, with bit 6 set on every chunk except the last.
    const read = (): number | null => {
      let result = 0;
      let shift = 0;
      let byte: number;
      do {
        if (index >= encoded.length) return null;
        byte = encoded.charCodeAt(index++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20);
      return result & 1 ? ~(result >> 1) : result >> 1;
    };

    const dLat = read();
    const dLng = read();
    if (dLat === null || dLng === null) break;
    lat += dLat;
    lng += dLng;
    points.push([lat / 1e5, lng / 1e5]);
  }

  return points;
}

/** Never draw more than this many points — a thumbnail can't show them. */
const ROUTE_MAX_POINTS = 140;

/**
 * An encoded route as an SVG path inside a `size`-square viewBox.
 *
 * Longitude is scaled by cos(latitude) so the shape isn't stretched sideways
 * away from the equator, and the route is fitted to the box on its longer axis
 * so a there-and-back doesn't come out as a line across the middle.
 */
export function routePath(
  encoded: string | null | undefined,
  size = 100,
  padding = 6,
): string | null {
  if (!encoded) return null;
  const points = decodePolyline(encoded);
  if (points.length < 2) return null;

  const step = Math.ceil(points.length / ROUTE_MAX_POINTS);
  const sampled = points.filter((_, i) => i % step === 0 || i === points.length - 1);

  const meanLat =
    sampled.reduce((sum, [lat]) => sum + lat, 0) / sampled.length;
  const scale = Math.cos((meanLat * Math.PI) / 180);
  const flat = sampled.map(([lat, lng]) => [lng * scale, lat] as const);

  const xs = flat.map(([x]) => x);
  const ys = flat.map(([, y]) => y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const spanX = Math.max(...xs) - minX;
  const spanY = Math.max(...ys) - minY;
  const span = Math.max(spanX, spanY);
  if (span <= 0) return null;

  const box = size - padding * 2;
  const factor = box / span;
  // Centre the shorter axis in the box rather than pinning it to the corner.
  const offsetX = padding + (box - spanX * factor) / 2;
  const offsetY = padding + (box - spanY * factor) / 2;

  return flat
    .map(([x, y], i) => {
      const px = offsetX + (x - minX) * factor;
      // SVG y grows downwards; north should be up.
      const py = size - (offsetY + (y - minY) * factor);
      return `${i ? "L" : "M"}${px.toFixed(1)} ${py.toFixed(1)}`;
    })
    .join(" ");
}

// --- weekly volume ------------------------------------------------------------

export interface TrainingWeek {
  /** Monday, `YYYY-MM-DD`. */
  week_starting: string;
  runs: number;
  km: number;
  seconds: number;
  avg_pace_per_km: string | null;
  /** Change in kilometres against the week before, as a whole percent. */
  ramp_pct: number | null;
}

/**
 * The last `weeks` Monday-start weeks, newest first.
 *
 * Weeks the athlete didn't run are emitted as zeroes rather than skipped: a
 * gap is training information, and a chart that closes over it lies about the
 * ramp on either side of it.
 */
export function weeklyVolume(
  runs: Run[],
  weeks: number,
  today: string,
): TrainingWeek[] {
  const totals = new Map<string, { runs: number; metres: number; seconds: number }>();
  for (const run of runs) {
    const key = weekStart(localDate(run));
    const week = totals.get(key) ?? { runs: 0, metres: 0, seconds: 0 };
    week.runs += 1;
    week.metres += run.distance;
    week.seconds += run.moving_time;
    totals.set(key, week);
  }

  const thisWeek = weekStart(today);
  // Oldest first while the ramp is computed, then reversed for the caller.
  const ordered: TrainingWeek[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const week_starting = addDays(thisWeek, -7 * i);
    const week = totals.get(week_starting) ?? { runs: 0, metres: 0, seconds: 0 };
    const previous = ordered.at(-1);
    const km = Number((week.metres / 1000).toFixed(1));
    ordered.push({
      week_starting,
      runs: week.runs,
      km,
      seconds: week.seconds,
      avg_pace_per_km: pace(
        week.metres > 0 ? (week.seconds / week.metres) * 1000 : null,
      ),
      ramp_pct:
        previous && previous.km > 0
          ? Math.round(((km - previous.km) / previous.km) * 100)
          : null,
    });
  }

  return ordered.reverse();
}

// --- acute:chronic workload ---------------------------------------------------

export interface LoadRatio {
  /** Kilometres in the last 7 days. */
  acute_km: number;
  /** Average kilometres per week over the last 28. */
  chronic_km: number;
  ratio: number;
}

/**
 * The 7:28 day workload ratio — this week's kilometres against the four-week
 * average of a week.
 *
 * The commonly cited safe band is 0.8–1.3; above it is the classic "ramped too
 * fast" pattern. Null until there are four weeks to average, because a ratio
 * computed against a fortnight of history says more about when the athlete
 * joined Strava than about their training.
 */
export function loadRatio(runs: Run[], today: string): LoadRatio | null {
  const acuteFrom = addDays(today, -6);
  const chronicFrom = addDays(today, -27);

  let acuteMetres = 0;
  let chronicMetres = 0;
  let earliest: string | null = null;

  for (const run of runs) {
    const date = localDate(run);
    if (date > today) continue;
    if (!earliest || date < earliest) earliest = date;
    if (date >= chronicFrom) chronicMetres += run.distance;
    if (date >= acuteFrom) acuteMetres += run.distance;
  }

  // Four weeks of *history*, not four weeks of running: an athlete who took a
  // fortnight off still has a meaningful chronic load behind them.
  if (!earliest || daysBetween(earliest, today) < 27) return null;
  const chronic_km = chronicMetres / 1000 / 4;
  if (chronic_km <= 0) return null;

  const acute_km = acuteMetres / 1000;
  return {
    acute_km: Number(acute_km.toFixed(1)),
    chronic_km: Number(chronic_km.toFixed(1)),
    ratio: Number((acute_km / chronic_km).toFixed(2)),
  };
}

// --- intensity distribution ---------------------------------------------------

/**
 * Zone floors as a share of maximum heart rate — the ordinary five-zone
 * %HRmax model. Z3 is where an easy run stops being easy.
 */
export const ZONE_FLOORS = [0, 0.68, 0.77, 0.84, 0.91] as const;

export interface EasyIntensity {
  /** Highest heart rate seen across the runs considered. */
  hr_max: number;
  /** Beats per minute at which an easy run has drifted into zone 3. */
  zone3_floor: number;
  easy_runs: number;
  /** Easy runs whose *average* heart rate sat in zone 3 or above. */
  hard_easy_runs: number;
  /** `hard_easy_runs / easy_runs`, 0–1. */
  share: number;
}

/**
 * How much of the athlete's easy running isn't easy.
 *
 * "Easy" is Strava's own `workout_type` — anything the athlete tagged as a race
 * or a workout is supposed to be hard and is excluded, which is what stops a
 * track session from being counted as evidence of running easy runs too fast.
 * Null when nothing was recorded with a heart-rate monitor.
 */
export function easyIntensity(runs: Run[]): EasyIntensity | null {
  const observed = runs
    .map((run) => run.max_heartrate ?? 0)
    .filter((bpm) => bpm > 0);
  if (observed.length === 0) return null;

  const hr_max = Math.max(...observed);
  const zone3_floor = Math.round(hr_max * ZONE_FLOORS[2]);

  const easy = runs.filter(
    (run) =>
      (run.workout_type === "default" || run.workout_type === "long_run") &&
      (run.average_heartrate ?? 0) > 0,
  );
  if (easy.length === 0) return null;

  const hard = easy.filter((run) => (run.average_heartrate ?? 0) >= zone3_floor);
  return {
    hr_max,
    zone3_floor,
    easy_runs: easy.length,
    hard_easy_runs: hard.length,
    share: Number((hard.length / easy.length).toFixed(3)),
  };
}

// --- aerobic decoupling -------------------------------------------------------

/**
 * Pa:HR decoupling across the halves of a run, as a percentage.
 *
 * Speed per heartbeat in the first half against the second: positive means the
 * athlete had to spend more heart rate to hold the same pace as the run went
 * on. Under ~5% is a well-supported aerobic effort, and it is the cleanest
 * fitness signal available from a watch without a lab.
 *
 * Null for anything under 20 minutes or recorded without heart rate — the
 * measure needs a run long enough to drift.
 */
export function decoupling(streams: RunStreams): number | null {
  // Annotated rather than inferred: the schema's `.openapi()` wrapper widens
  // the element type, and `toSplits` types its own heart-rate slice for the
  // same reason.
  const time: number[] | undefined = streams.time?.data;
  const distance: number[] | undefined = streams.distance?.data;
  const heartrate: number[] | undefined = streams.heartrate?.data;
  if (!time?.length || !distance?.length || !heartrate?.length) return null;

  const samples = Math.min(time.length, distance.length, heartrate.length);
  if (samples < 4) return null;

  const total = time[samples - 1] - time[0];
  if (total < 20 * 60) return null;

  const midpoint = time[0] + total / 2;
  let split = 1;
  while (split < samples - 1 && time[split] < midpoint) split++;

  const half = (from: number, to: number): number | null => {
    const seconds = time[to] - time[from];
    const metres = distance[to] - distance[from];
    if (seconds <= 0 || metres <= 0) return null;
    const beats = heartrate.slice(from, to + 1).filter((bpm) => bpm > 0);
    if (beats.length === 0) return null;
    const meanHr = beats.reduce((sum, bpm) => sum + bpm, 0) / beats.length;
    if (meanHr <= 0) return null;
    return metres / seconds / meanHr;
  };

  const first = half(0, split);
  const second = half(split, samples - 1);
  if (first === null || second === null) return null;

  return Number((((first - second) / first) * 100).toFixed(1));
}

// --- race prediction ----------------------------------------------------------

/** The distances a prediction is worth quoting, in metres. */
export const RACE_DISTANCES = [
  { name: "5K", metres: 5000 },
  { name: "10K", metres: 10000 },
  { name: "Half marathon", metres: 21097.5 },
  { name: "Marathon", metres: 42195 },
] as const;

/**
 * Riegel's endurance model: `t2 = t1 · (d2/d1)^1.06`.
 *
 * The exponent is the classic 1.06. It holds for a moderate extrapolation and
 * flatters the athlete beyond that, which is why `predictRaces` refuses to
 * stretch a result more than four times its own distance.
 */
export function riegel(seconds: number, from: number, to: number): number {
  return seconds * Math.pow(to / from, 1.06);
}

/** The furthest a result is stretched before the model stops being honest. */
const RIEGEL_MAX_STRETCH = 4;
/** Below 1500 m the effort is a sprint, and Riegel has nothing to say about it. */
const RIEGEL_MIN_DISTANCE = 1500;

export interface RacePrediction {
  name: string;
  metres: number;
  seconds: number;
  time: string;
  pace_per_km: string | null;
  /** The best effort the prediction was extrapolated from. */
  from: { name: string; time: string; date: string };
}

/** Fastest effort per distance, so a season of 5ks collapses to the best one. */
export function bestPerDistance(efforts: BestEffort[]): BestEffort[] {
  const best = new Map<number, BestEffort>();
  for (const effort of efforts) {
    if (effort.distance <= 0 || effort.elapsed_time <= 0) continue;
    const held = best.get(effort.distance);
    if (!held || effort.elapsed_time < held.elapsed_time) {
      best.set(effort.distance, effort);
    }
  }
  return [...best.values()].sort((a, b) => a.distance - b.distance);
}

/**
 * What the athlete could run today at each race distance, from what they have
 * already run.
 *
 * Every eligible effort is extrapolated to every target and the *fastest*
 * prediction wins — the athlete's best demonstrated equivalent, rather than an
 * average dragged down by a training run that happened to contain a 5k.
 */
export function predictRaces(efforts: BestEffort[]): RacePrediction[] {
  const best = bestPerDistance(efforts).filter(
    (effort) => effort.distance >= RIEGEL_MIN_DISTANCE,
  );
  if (best.length === 0) return [];

  const predictions: RacePrediction[] = [];
  for (const race of RACE_DISTANCES) {
    let winner: { seconds: number; from: BestEffort } | null = null;
    for (const effort of best) {
      const stretch = race.metres / effort.distance;
      if (stretch > RIEGEL_MAX_STRETCH || stretch < 1 / RIEGEL_MAX_STRETCH) continue;
      const seconds = riegel(effort.elapsed_time, effort.distance, race.metres);
      if (!winner || seconds < winner.seconds) winner = { seconds, from: effort };
    }
    if (!winner) continue;
    predictions.push({
      name: race.name,
      metres: race.metres,
      seconds: Math.round(winner.seconds),
      time: clock(winner.seconds),
      pace_per_km: pace((winner.seconds / race.metres) * 1000),
      from: {
        name: winner.from.name,
        time: clock(winner.from.elapsed_time),
        date: winner.from.date,
      },
    });
  }
  return predictions;
}

// --- the planned week against the run week ------------------------------------

/** One session of a coach-written week. */
export interface PlannedSession {
  /** 0 = Monday … 6 = Sunday, so a week is always seven entries in order. */
  day: number;
  /** "Easy", "8 × 400", "Long", "Rest". */
  type: string;
  /** Kilometres; 0 for a rest day. */
  km: number;
  /** "6:05 /km", or a note like "legs up" on a rest day. */
  pace: string;
  /** A session the week is built around — the two quality days and the long run. */
  key: boolean;
}

export interface PlanDayProgress {
  day: number;
  type: string;
  planned_km: number;
  actual_km: number;
  /** Runs logged on the day, for the tooltip and for "which run was that?". */
  run_ids: number[];
}

export interface PlanProgress {
  week_starting: string;
  planned_km: number;
  actual_km: number;
  days: PlanDayProgress[];
  /** Sessions still to come, counting today. */
  remaining: number;
}

/**
 * The accepted week against what the athlete actually ran.
 *
 * Matching is by day, not by session: a plan says "Tuesday, 9 km of intervals"
 * and the athlete either ran on Tuesday or didn't. Anything cleverer would be
 * guessing which run was meant to be which.
 */
export function planProgress(
  sessions: PlannedSession[],
  runs: Run[],
  week_starting: string,
  today: string,
): PlanProgress {
  const byDay = new Map<number, Run[]>();
  for (const run of runs) {
    const offset = daysBetween(week_starting, localDate(run));
    if (offset < 0 || offset > 6) continue;
    byDay.set(offset, [...(byDay.get(offset) ?? []), run]);
  }

  const days: PlanDayProgress[] = [];
  for (let day = 0; day < 7; day++) {
    const session = sessions.find((s) => s.day === day);
    const logged = byDay.get(day) ?? [];
    days.push({
      day,
      type: session?.type ?? "Rest",
      planned_km: session?.km ?? 0,
      actual_km: Number(
        (logged.reduce((sum, run) => sum + run.distance, 0) / 1000).toFixed(1),
      ),
      run_ids: logged.map((run) => run.id),
    });
  }

  const todayOffset = daysBetween(week_starting, today);
  return {
    week_starting,
    planned_km: Number(days.reduce((sum, d) => sum + d.planned_km, 0).toFixed(1)),
    actual_km: Number(days.reduce((sum, d) => sum + d.actual_km, 0).toFixed(1)),
    days,
    remaining: days.filter(
      (d) => d.planned_km > 0 && d.day >= todayOffset && d.actual_km === 0,
    ).length,
  };
}
