// What the watches recorded, for the runs in `athletes.ts`.
//
// The fixture used to hand every run the same twenty-point diagonal, which was
// enough for "the studio has something to draw" and nothing else: both athletes
// got the *identical* line, so a film of the two of them showed one trace with
// another hidden underneath it. That is precisely the thing the duo replay is
// for, so the fake has to record two different runs.
//
// Everything here is a pure function of the run — same fixture, same bytes, every
// time. A ranked list that reshuffles between runs is a flaky test, and a route
// that wanders between runs is a screenshot you cannot compare.

import type { FixtureRun } from "./athletes.js";

/** Strava samples at 1 Hz and so does this, because the API asks for whatever
 *  Strava has and the app's smoothing is written against that rate. */
const SAMPLE_SECONDS = 1;

/** Metres per degree of latitude — good to a tenth of a percent anywhere a
 *  person runs, and the alternative is a geodesy library in a fixture. */
const METERS_PER_DEGREE = 111_320;

/** The park the fixture runs around. Casablanca, matching the athletes' own
 *  `city` — a film whose map is somewhere the athlete has never been is a
 *  confusing thing to look at while checking a layout. */
const CENTRE: [number, number] = [33.5731, -7.5898];

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

/** A point on the run's loop, `fraction` of the way round. `lane` is how far off
 *  the centre line they were there — see `FixtureRun`. */
function routePoint(
  fraction: number,
  radius: number,
  lane: number,
  wobble: number,
): [number, number] {
  const angle = fraction * Math.PI * 2;
  const from = radius + lane;
  const north = Math.sin(angle) * from + wobble;
  const east = Math.cos(angle) * from + wobble;
  return [
    round(CENTRE[0] + north / METERS_PER_DEGREE, 6),
    round(
      CENTRE[1] +
        east / (METERS_PER_DEGREE * Math.cos((CENTRE[0] * Math.PI) / 180)),
      6,
    ),
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
  const radius = run.distance / (2 * Math.PI);

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
    streams.latlng.push(
      routePoint(fraction, radius, run.lane(fraction), (random() - 0.5) * 6),
    );
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
