// What the watches recorded, for the runs in `athletes.ts`.
//
// The fixture used to hand every run the same twenty-point diagonal, which was
// enough for "the studio has something to draw" and nothing else: both athletes
// got the *identical* line, so a film of the two of them showed one trace with
// another hidden underneath it. That is precisely the thing the duo replay is
// for, so the fake has to record two different runs.
//
// The shape they run is real — `recorded-run.ts`, ten kilometres round
// Casablanca off somebody's watch — and each fixture run walks it at its own
// pace, on its own side of the road. A generated circle was the other option and
// a worse one: a route that never turns, doubles back or crosses itself is
// exactly the route that cannot catch out a follow camera or a projection.
//
// Everything here is a pure function of the run — same fixture, same bytes, every
// time. A ranked list that reshuffles between runs is a flaky test, and a route
// that wanders between runs is a screenshot you cannot compare.

import type { FixtureRun } from "./athletes.js";
import { RECORDED_RUN } from "./recorded-run.js";

/** Strava samples at 1 Hz and so does this, because the API asks for whatever
 *  Strava has and the app's smoothing is written against that rate. */
const SAMPLE_SECONDS = 1;

/** Metres per degree of latitude — good to a tenth of a percent anywhere a
 *  person runs, and the alternative is a geodesy library in a fixture. */
const METERS_PER_DEGREE = 111_320;

/** East–west scale where the recorded run is. */
const LNG_SCALE = Math.cos((RECORDED_RUN.latlng.data[0][0] * Math.PI) / 180);

/**
 * How far along the recorded route each of its points is, in metres.
 *
 * Walking by *distance* rather than by sample index is what lets a fixture run
 * declare its own length and pace: the route is a shape, and how fast somebody
 * went round it is the run's business, not the shape's.
 */
const ROUTE = RECORDED_RUN.latlng.data as [number, number][];

const ALONG: number[] = (() => {
  const along = [0];
  for (let i = 1; i < ROUTE.length; i += 1) {
    along.push(along[i - 1] + metresBetween(ROUTE[i - 1], ROUTE[i]));
  }
  return along;
})();

const ROUTE_LENGTH = ALONG[ALONG.length - 1];

/** Flat-earth metres between two points, which at a run's scale is exact
 *  enough that the error is smaller than the receiver's. */
function metresBetween(a: [number, number], b: [number, number]): number {
  return Math.hypot(
    (b[0] - a[0]) * METERS_PER_DEGREE,
    (b[1] - a[1]) * METERS_PER_DEGREE * LNG_SCALE,
  );
}

/** The index of the last route point at or before `metres` along. */
function indexAt(metres: number): number {
  let low = 0;
  let high = ALONG.length - 1;
  while (high - low > 1) {
    const mid = (low + high) >> 1;
    if (ALONG[mid] <= metres) low = mid;
    else high = mid;
  }
  return low;
}

/** Where the route is `metres` along, interpolated between its two nearest
 *  samples so a runner moves smoothly rather than in one-second hops. */
function alongRoute(metres: number): [number, number] {
  const clamped = Math.min(Math.max(metres, 0), ROUTE_LENGTH);
  const i = indexAt(clamped);
  const j = Math.min(i + 1, ROUTE.length - 1);
  const span = ALONG[j] - ALONG[i];
  const t = span > 0 ? (clamped - ALONG[i]) / span : 0;
  return [
    ROUTE[i][0] + (ROUTE[j][0] - ROUTE[i][0]) * t,
    ROUTE[i][1] + (ROUTE[j][1] - ROUTE[i][1]) * t,
  ];
}

/**
 * How far to look either side when working out which way the route is heading.
 *
 * Consecutive fixes are three or four metres apart and each carries a metre or
 * two of noise, so the heading between two of them swings wildly — and a lane
 * offset built on that swings with it, drawing a runner who staggers across the
 * road. Twenty metres is far enough to be the road's direction and short enough
 * to still be this corner's.
 */
const HEADING_SPAN = 20;

export interface FixtureStreams {
  latlng: number[][];
  time: number[];
  distance: number[];
  altitude: number[];
  heartrate: number[];
  velocity_smooth: number[];
}

/** mulberry32, seeded on the run's id: receiver noise that is the same noise
 *  every time. */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const round = (value: number, places: number) => Number(value.toFixed(places));

/**
 * A point `fraction` of the way along the recorded route, `lane` metres to the
 * left of it.
 *
 * No synthetic receiver noise: the recording already carries a real watch's, and
 * a random metre or two per sample on top of it added a kilometre of jitter to a
 * ten-kilometre route — the drawn line disagreeing with the run's own distance
 * by twelve percent. A runner who does not hold a perfectly straight lane says
 * so through `lane` instead, which is smooth and costs no length.
 *
 * The lane is applied square to the direction of travel, so two runners keep the
 * same distance apart round a corner as they do on a straight — offsetting in a
 * fixed compass direction would have them cross over every time the road turned
 * back on itself, which on a real route is constantly.
 */
function routePoint(fraction: number, lane: number): [number, number] {
  const metres = fraction * ROUTE_LENGTH;
  const [lat, lng] = alongRoute(metres);
  if (lane === 0) return [round(lat, 6), round(lng, 6)];

  const behind = alongRoute(metres - HEADING_SPAN);
  const ahead = alongRoute(metres + HEADING_SPAN);
  const north = (ahead[0] - behind[0]) * METERS_PER_DEGREE;
  const east = (ahead[1] - behind[1]) * METERS_PER_DEGREE * LNG_SCALE;
  const length = Math.hypot(north, east) || 1;
  // Ninety degrees left of travel, in metres.
  const offsetNorth = (-east / length) * lane;
  const offsetEast = (north / length) * lane;

  return [
    round(lat + offsetNorth / METERS_PER_DEGREE, 6),
    round(lng + offsetEast / (METERS_PER_DEGREE * LNG_SCALE), 6),
  ];
}

/**
 * One run, sampled the way a watch would have sampled it.
 *
 * The speeds are normalised so the streams add up to the distance on the
 * activity — a fixture whose streams disagree with its own totals has the app
 * drawing one number while the list shows another, and you would spend the
 * afternoon looking for that bug in the app.
 */
export function recordRun(run: FixtureRun): FixtureStreams {
  const random = seeded(run.id);
  const samples = Math.max(2, Math.round(run.moving_time / SAMPLE_SECONDS));
  const base = run.distance / run.moving_time;

  const speeds: number[] = [];
  for (let i = 0; i < samples; i += 1) {
    speeds.push(base * run.shape(i / (samples - 1)));
  }
  const correction =
    run.distance / speeds.reduce((sum, speed) => sum + speed, 0);

  const streams: FixtureStreams = {
    latlng: [],
    time: [],
    distance: [],
    altitude: [],
    heartrate: [],
    velocity_smooth: [],
  };

  let covered = 0;
  // Strava's streams open on the start line: sample zero is 0 s and 0 m.
  for (let i = 0; i <= samples; i += 1) {
    const speed = i === 0 ? 0 : speeds[i - 1] * correction;
    covered = Math.min(covered + speed * SAMPLE_SECONDS, run.distance);
    const fraction = covered / run.distance;

    streams.time.push(i * SAMPLE_SECONDS);
    streams.distance.push(round(covered, 1));
    streams.velocity_smooth.push(round(speed, 2));
    streams.latlng.push(routePoint(fraction, run.lane(fraction)));
    streams.altitude.push(
      Math.round(
        18 + (run.elevationGain / 2) * (1 - Math.cos(fraction * Math.PI * 4)),
      ),
    );
    streams.heartrate.push(
      Math.round(
        run.averageHeartrate + Math.sin(i / 140) * 8 + (random() - 0.5) * 3,
      ),
    );
  }

  return streams;
}

/** The shape Strava's `/activities/:id/streams` serves, with the sampling
 *  metadata the SDK's types expect beside each `data` array. */
export function toStreamSet(streams: FixtureStreams) {
  const size = streams.time.length;
  const meta = {
    series_type: "distance" as const,
    original_size: size,
    resolution: "high" as const,
  };
  return {
    latlng: { data: streams.latlng, ...meta },
    time: { data: streams.time, ...meta },
    distance: { data: streams.distance, ...meta },
    altitude: { data: streams.altitude, ...meta },
    heartrate: { data: streams.heartrate, ...meta },
    velocity_smooth: { data: streams.velocity_smooth, ...meta },
  };
}
