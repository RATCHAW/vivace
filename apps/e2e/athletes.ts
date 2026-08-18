// The two athletes the end-to-end suite signs in as, and the runs they did.
//
// The whole point of the invite feature is a pairing between two people, so the
// fixture's job is to make one real: Ayoub and Sam started the same run thirty
// seconds apart, and Sam has a decoy that evening which must *not* rank. Nothing
// here is random — a ranked list that reshuffles between runs is a flaky test.

export interface FixtureRun {
  id: number;
  name: string;
  /** The athlete's wall clock, Z-suffixed, exactly as Strava serves it. */
  start_date_local: string;
  /** Seconds. */
  moving_time: number;
  /** Metres. */
  distance: number;
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
      },
      {
        id: 9002,
        name: "Tuesday easy",
        start_date_local: "2026-08-11T18:20:00Z",
        moving_time: 1800,
        distance: 6100,
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
      },
      {
        // Same day, wrong time. If this ever ranks, the time window is broken.
        id: 9102,
        name: "Evening shakeout",
        start_date_local: "2026-08-15T19:05:00Z",
        moving_time: 1500,
        distance: 5000,
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
