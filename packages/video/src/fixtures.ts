/**
 * The runs every template has to survive.
 *
 * These are the fixtures the templates are written against, not an afterthought
 * to them: a treadmill upload with no GPS, a marathon with 42 splits, a trail
 * run whose route is a scribble, a run whose receiver spat out a spike, and the
 * one that carries nothing but a distance and a time. Each one is generated
 * deterministically from a seed, so a test that passes today fails tomorrow only
 * because something changed.
 *
 * Not exported from the package's entry: this is test material, and shipping it
 * would put a kilometre of synthetic GPS in the Lambda bundle.
 */
import { seededRandom } from "./core/seed";
import type { VideoActivity, VideoPartner, VideoStreams } from "./types";

export interface Fixture {
  /** The letter it is called by in the build spec's fixture table. */
  key: string;
  name: string;
  activity: VideoActivity;
  streams: VideoStreams;
}

interface RunSpec {
  id: number;
  name: string;
  startDate: string;
  distanceMeters: number;
  movingSeconds: number;
  elevationGain: number;
  averageHeartrate: number | null;
  /** Multiplier on the run's average speed, as a function of how far through it
   *  we are — this is what makes one fixture a negative split and another a
   *  metronome. */
  shape: (fraction: number) => number;
  route: "loop" | "trail" | null;
  /** Insert a spike and a dropout, the way a receiver under a bridge does. */
  damaged?: boolean;
}

/** A closed-ish loop around a point, with enough wobble to look surveyed rather
 *  than drawn. `trail` folds the loop back on itself repeatedly. */
function routePoint(
  fraction: number,
  shape: "loop" | "trail",
  random: () => number,
  radius: number,
): [number, number] {
  const lat0 = 51.4545;
  const lng0 = -2.5879;
  const turns = shape === "trail" ? 2.5 : 1;
  const angle = fraction * Math.PI * 2 * turns;
  const squash = shape === "trail" ? 0.35 + 0.5 * Math.sin(angle * 3) : 1;
  // Receiver noise, in metres — a few of them, the way a real fix wanders.
  const wobble = (random() - 0.5) * 5;
  return [
    lat0 + (Math.sin(angle) * radius * squash + wobble) / 111_320,
    lng0 +
      (Math.cos(angle) * radius + wobble) /
        (111_320 * Math.cos((lat0 * Math.PI) / 180)),
  ];
}

/** One run, sampled at 1 Hz — which is what Strava hands back. */
function buildRun(spec: RunSpec): Fixture {
  const random = seededRandom(spec.id);
  const samples = Math.max(2, Math.round(spec.movingSeconds));
  const base = spec.distanceMeters / spec.movingSeconds;
  const radius = spec.distanceMeters / (2 * Math.PI);

  const speeds: number[] = [];
  for (let i = 0; i < samples; i += 1)
    speeds.push(base * spec.shape(i / (samples - 1)));
  // Normalise so the streams add up to the distance on the activity: a fixture
  // whose streams disagree with its totals tests the wrong thing.
  const total = speeds.reduce((sum, speed) => sum + speed, 0);
  const correction = spec.distanceMeters / total;

  const time: number[] = [];
  const distance: number[] = [];
  const velocity: number[] = [];
  const latlng: number[][] = [];
  const altitude: number[] = [];
  const heartrate: number[] = [];

  let covered = 0;
  let clock = 0;
  // Strava's streams open on the start line: sample zero is 0 s and 0 m.
  for (let i = 0; i <= samples; i += 1) {
    const speed = i === 0 ? 0 : speeds[i - 1] * correction;
    covered += speed;
    clock += i === 0 ? 0 : 1;
    // A watch that lost its fix for three minutes halfway round: the clock runs
    // on, the distance doesn't.
    if (spec.damaged && i === Math.floor(samples / 2)) clock += 180;

    time.push(clock);
    distance.push(Math.min(covered, spec.distanceMeters));
    velocity.push(speed);
    if (spec.averageHeartrate != null) {
      heartrate.push(
        spec.averageHeartrate + Math.sin(i / 90) * 9 + (random() - 0.5) * 3,
      );
    }
    if (spec.route) {
      const fraction = covered / spec.distanceMeters;
      const point = routePoint(fraction, spec.route, random, radius);
      // One fix bounced off a building: 300 m away and back again in a second.
      const spiked = spec.damaged && i === Math.floor(samples / 3);
      latlng.push(spiked ? [point[0] + 0.0027, point[1] - 0.0027] : point);
      altitude.push(
        60 + (spec.elevationGain / 2) * (1 - Math.cos(fraction * Math.PI * 4)),
      );
    }
  }

  const activity: VideoActivity = {
    id: spec.id,
    name: spec.name,
    distance: spec.distanceMeters,
    moving_time: spec.movingSeconds,
    total_elevation_gain: spec.elevationGain,
    sport_type: "Run",
    start_date_local: spec.startDate,
    average_speed: base,
    average_heartrate: spec.averageHeartrate,
    max_heartrate:
      spec.averageHeartrate == null ? null : spec.averageHeartrate + 22,
    workout_type: "default",
  };

  const streams: VideoStreams = {
    time: { data: time },
    distance: { data: distance },
    velocity_smooth: { data: velocity },
    ...(spec.route
      ? { latlng: { data: latlng }, altitude: { data: altitude } }
      : {}),
    ...(spec.averageHeartrate != null
      ? { heartrate: { data: heartrate } }
      : {}),
  };

  return { key: "", name: spec.name, activity, streams };
}

const fixture = (key: string, spec: RunSpec): Fixture => ({
  ...buildRun(spec),
  key,
});

/** Flat: a treadmill holding one speed, and the degenerate case for every
 *  template that encodes a difference between splits. */
const flat = () => 1;

export const FIXTURE_A = fixture("A", {
  id: 1001,
  name: "Morning loop",
  startDate: "2026-08-09T07:12:00Z",
  distanceMeters: 5021,
  movingSeconds: 1523,
  elevationGain: 42,
  averageHeartrate: 152,
  // Eases into it, finishes faster than it started: a negative split.
  shape: (t) => 0.94 + t * 0.12,
  route: "loop",
});

/**
 * The other half of A: the same morning loop from the person running beside
 * them.
 *
 * A minute and a half later off the line — one watch caught GPS before the
 * other — a hair short of five kilometres, and a shade slower over the second
 * half. This is the pair the duo replay is written against, and the stagger is
 * the interesting part: it is what makes one bar sit empty while the other has
 * already started, and it is a fact about the run rather than a bug.
 */
export const FIXTURE_A_PARTNER = fixture("A2", {
  id: 1007,
  name: "Morning loop",
  startDate: "2026-08-09T07:13:30Z",
  distanceMeters: 4980,
  movingSeconds: 1571,
  elevationGain: 40,
  averageHeartrate: 146,
  // Goes out with them and hangs on: the mirror image of A's negative split.
  shape: (t) => 1.03 - t * 0.08,
  route: "loop",
});

/** Somebody else's run, as a composition takes it. The name is the invitee's
 *  first name in the real thing — see `run_invite` in apps/api. */
export function asPartner(
  source: Fixture,
  name = "Marianne",
  avatarUrl = "",
): VideoPartner {
  return {
    name,
    activity: source.activity,
    streams: source.streams,
    avatarUrl,
  };
}

export const FIXTURE_B = fixture("B", {
  id: 1002,
  name: "Treadmill 8k",
  startDate: "2026-08-11T18:40:00Z",
  distanceMeters: 8000,
  movingSeconds: 2520,
  elevationGain: 0,
  averageHeartrate: null,
  shape: flat,
  route: null,
});

export const FIXTURE_C = fixture("C", {
  id: 1003,
  name: "Bristol Marathon",
  startDate: "2026-05-03T08:00:00Z",
  distanceMeters: 42195,
  movingSeconds: 12_600,
  elevationGain: 320,
  averageHeartrate: 161,
  // Out hard, hangs on, one late surge — 42 splits with a story in them.
  shape: (t) => 1.04 - t * 0.1 + (t > 0.86 ? 0.09 : 0),
  route: "loop",
});

export const FIXTURE_D = fixture("D", {
  id: 1004,
  name: "Shakeout",
  startDate: "2026-08-12T06:30:00Z",
  distanceMeters: 1200,
  movingSeconds: 402,
  elevationGain: 4,
  averageHeartrate: 138,
  shape: flat,
  route: "loop",
});

export const FIXTURE_E = fixture("E", {
  id: 1005,
  name: "Mendip trail",
  startDate: "2026-07-19T09:05:00Z",
  distanceMeters: 14_800,
  movingSeconds: 6120,
  elevationGain: 812,
  averageHeartrate: 149,
  // A trail run's pace is the terrain's, not the athlete's.
  shape: (t) => 1 + Math.sin(t * 11) * 0.22,
  route: "trail",
});

export const FIXTURE_F = fixture("F", {
  id: 1006,
  name: "River run",
  startDate: "2026-06-02T17:20:00Z",
  distanceMeters: 10_400,
  movingSeconds: 3180,
  elevationGain: 65,
  averageHeartrate: 156,
  shape: (t) => 1 + Math.sin(t * 5) * 0.06,
  route: "loop",
  damaged: true,
});

/** The one that matters most: a run carrying nothing but a distance and a time.
 *  No streams at all, no speed, no heart rate, no climb. Minimal Numbers has to
 *  look premium for this, and every other template has to decline it politely. */
export const FIXTURE_K: Fixture = {
  key: "K",
  name: "Summary only",
  activity: {
    id: 1011,
    name: "Evening run",
    distance: 5020,
    moving_time: 1523,
    total_elevation_gain: 0,
    sport_type: "Run",
    start_date_local: "2026-08-13T19:02:00Z",
    average_speed: 0,
    average_heartrate: null,
    max_heartrate: null,
    workout_type: "default",
  },
  streams: {},
};

/**
 * Every single-run fixture from the build spec's table.
 *
 * G–J are weeks and months: they belong to the multi-run templates, which need
 * a product surface (pick a week, not a run) that doesn't exist yet. When it
 * does, they go here.
 */
export const FIXTURES: Fixture[] = [
  FIXTURE_A,
  FIXTURE_B,
  FIXTURE_C,
  FIXTURE_D,
  FIXTURE_E,
  FIXTURE_F,
  FIXTURE_K,
];
