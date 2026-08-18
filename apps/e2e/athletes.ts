// The two athletes the end-to-end suite signs in as, and the runs they did.
//
// The whole point of the invite feature is a pairing between two people, so the
// fixture's job is to make one real: Ayoub and Sam started the same run thirty
// seconds apart, and Sam has a decoy that evening which must *not* rank. Nothing
// here is random — a ranked list that reshuffles between runs is a flaky test.
//
// The runs carry enough to be *watched*, not only matched: a lane on the road, a
// pace shape, a heart rate and a climb. `streams.ts` turns those into what the
// watch recorded. The duo replay draws two traces from two of these, so a
// fixture where both athletes record the same line is a fixture that cannot show
// you whether the template works.

export interface FixtureRun {
  id: number;
  name: string;
  /** The athlete's wall clock, Z-suffixed, exactly as Strava serves it. */
  start_date_local: string;
  /** Seconds. */
  moving_time: number;
  /** Metres. */
  distance: number;
  /** Metres. */
  elevationGain: number;
  averageHeartrate: number;
  /**
   * How far off the loop's centre line they were, in metres, at a fraction of
   * the way round.
   *
   * This is what makes two people who ran together two visible traces instead of
   * one. A road's width is about eighteen metres of daylight between two GPS
   * traces, which is honest and — on a ten-kilometre loop fitted to a phone —
   * about two pixels. So one of the pair below also swings wide for the middle
   * third, the way somebody does when they loop back to a water fountain. The
   * fixture's job is to make the template legible, and two lines you cannot tell
   * apart do not.
   */
  lane: (fraction: number) => number;
  /**
   * Speed as a multiple of the run's average, over 0–1 of the run.
   *
   * A flat 1 makes every pace reading identical and the live numbers dead. One
   * of the pair below finishes faster than they started and the other fades,
   * because "who was stronger at the end" is the thing a two-runner film is
   * actually showing.
   */
  shape: (fraction: number) => number;
}

export interface FixtureAthlete {
  /** The key in the URL when signing in — see fake-strava.ts. */
  key: string;
  id: number;
  firstname: string;
  lastname: string;
  runs: FixtureRun[];
}

/** The morning they ran together. Sam is thirty seconds behind on the watch. */
const TOGETHER = "2026-08-15T07:00:00Z";
const TOGETHER_SAM = "2026-08-15T07:00:30Z";

export const ATHLETES: Record<"ayoub" | "sam", FixtureAthlete> = {
  ayoub: {
    key: "ayoub",
    id: 165387970,
    firstname: "Ayoub",
    lastname: "Ben Darsi",
    runs: [
      {
        id: 9001,
        name: "Saturday long run",
        start_date_local: TOGETHER,
        moving_time: 3000,
        distance: 10240,
        elevationGain: 96,
        averageHeartrate: 154,
        lane: () => 0,
        // Eases in, finishes faster than they started: a negative split.
        shape: (t) => 0.94 + t * 0.12,
      },
      {
        id: 9002,
        name: "Tuesday easy",
        start_date_local: "2026-08-11T18:20:00Z",
        moving_time: 1800,
        distance: 6100,
        elevationGain: 34,
        averageHeartrate: 141,
        lane: () => 0,
        shape: () => 1,
      },
    ],
  },
  sam: {
    key: "sam",
    id: 271828182,
    firstname: "Sam",
    lastname: "Rivera",
    runs: [
      {
        // The other half of Ayoub's Saturday run.
        id: 9101,
        name: "Long one with Ayoub",
        start_date_local: TOGETHER_SAM,
        moving_time: 2960,
        distance: 10180,
        elevationGain: 92,
        averageHeartrate: 161,
        // The other side of the road all the way round, drifting the way two
        // people do, and a wider swing through the middle third — so the two
        // traces are visibly two even when the whole route is on screen.
        lane: (t) =>
          20 +
          6 * Math.sin(t * 37) +
          60 * Math.max(0, Math.sin((t - 0.25) * Math.PI * 2)),
        // Out hard and hangs on — the mirror of Ayoub's, so the gap between the
        // two dots opens one way and then closes the other.
        shape: (t) => 1.05 - t * 0.11,
      },
      {
        // Same day, wrong time. If this ever ranks, the time window is broken.
        id: 9102,
        name: "Evening shakeout",
        start_date_local: "2026-08-15T19:05:00Z",
        moving_time: 1500,
        distance: 5000,
        elevationGain: 12,
        averageHeartrate: 132,
        lane: () => 0,
        shape: () => 1,
      },
    ],
  },
};

/** The run the two of them actually did together. */
export const SHARED_RUN = ATHLETES.ayoub.runs[0];
export const SHARED_RUN_SAM = ATHLETES.sam.runs[0];
export const DECOY_RUN = ATHLETES.sam.runs[1];

/** The access token the fake hands out for an athlete, and reads back. */
export function tokenFor(key: string): string {
  return `e2e-access-${key}`;
}

export function athleteForToken(token: string): FixtureAthlete | null {
  const key = token.replace(/^e2e-access-/, "");
  return Object.values(ATHLETES).find((athlete) => athlete.key === key) ?? null;
}
