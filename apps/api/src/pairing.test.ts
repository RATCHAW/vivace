import { describe, expect, it } from "vitest";
import { hasObscuredStart, matchScore, rankCandidates } from "./pairing.js";
import type { Run } from "./schemas.js";

/** A run with only the fields the matcher reads set to anything meaningful. */
function run(overrides: Partial<Run> & Pick<Run, "id">): Run {
  return {
    name: "Morning Run",
    distance: 10_000,
    moving_time: 3_000,
    total_elevation_gain: 0,
    sport_type: "Run",
    start_date_local: "2026-08-15T07:00:00Z",
    start_latlng: null,
    end_latlng: null,
    average_speed: 3.33,
    average_heartrate: null,
    max_heartrate: null,
    workout_type: "default",
    ...overrides,
  };
}

describe("hasObscuredStart", () => {
  it("spots Strava's hidden start time", () => {
    // Documented in the changelog, 3 July 2024: a hidden start comes back as
    // midnight plus one second rather than as null.
    expect(
      hasObscuredStart(
        run({ id: 1, start_date_local: "2026-08-15T00:00:01Z" }),
      ),
    ).toBe(true);
  });

  it("leaves a genuine midnight run alone", () => {
    expect(
      hasObscuredStart(
        run({ id: 1, start_date_local: "2026-08-15T00:00:00Z" }),
      ),
    ).toBe(false);
    expect(
      hasObscuredStart(
        run({ id: 2, start_date_local: "2026-08-15T00:00:02Z" }),
      ),
    ).toBe(false);
  });
});

describe("matchScore", () => {
  const target = run({ id: 1 });

  it("scores an identical run at 1", () => {
    expect(matchScore(target, run({ id: 2 }))).toBeCloseTo(1);
  });

  it("scores runs that never overlapped at 0", () => {
    const later = run({ id: 2, start_date_local: "2026-08-15T09:00:00Z" });
    expect(matchScore(target, later)).toBe(0);
  });

  it("ranks a closer start above a further one", () => {
    const close = run({ id: 2, start_date_local: "2026-08-15T07:01:00Z" });
    const further = run({ id: 3, start_date_local: "2026-08-15T07:20:00Z" });
    expect(matchScore(target, close)).toBeGreaterThan(
      matchScore(target, further),
    );
  });

  it("forgives a watch stopped at the door rather than the corner", () => {
    // Half a kilometre apart on a ten-kilometre run is normal and must not
    // cost the match — distance is a tie-breaker, not a test.
    const shorter = run({ id: 2, distance: 9_500 });
    expect(matchScore(target, shorter)).toBeGreaterThan(0.9);
  });

  it("scores a run with no moving time at 0 rather than dividing by it", () => {
    expect(matchScore(target, run({ id: 2, moving_time: 0 }))).toBe(0);
  });
});

describe("rankCandidates", () => {
  const target = run({ id: 1, start_date_local: "2026-08-15T07:00:00Z" });

  it("puts the best match first", () => {
    const candidates = [
      run({ id: 2, start_date_local: "2026-08-15T07:25:00Z" }),
      run({ id: 3, start_date_local: "2026-08-15T07:00:30Z" }),
    ];
    expect(rankCandidates(target, candidates).map((m) => m.run.id)).toEqual([
      3, 2,
    ]);
  });

  it("drops runs from another part of the day", () => {
    const evening = run({ id: 2, start_date_local: "2026-08-15T19:00:00Z" });
    expect(rankCandidates(target, [evening])).toEqual([]);
  });

  it("refuses to match two runs with hidden start times", () => {
    // Both read 00:00:01, so they overlap perfectly and would otherwise score
    // as a flawless match — the one false positive that looks like a true one.
    const hidden = run({ id: 1, start_date_local: "2026-08-15T00:00:01Z" });
    const alsoHidden = run({ id: 2, start_date_local: "2026-08-15T00:00:01Z" });

    expect(rankCandidates(hidden, [alsoHidden])).toEqual([]);
    // And a hidden candidate is dropped even when the target is visible.
    expect(
      rankCandidates(run({ id: 1, start_date_local: "2026-08-15T00:00:30Z" }), [
        alsoHidden,
      ]),
    ).toEqual([]);
  });

  it("keeps a plausible-but-imperfect run rather than hiding it", () => {
    // The athlete confirms, so a weak candidate still belongs on the list —
    // hiding the right run from someone who knows which one it was is the
    // expensive mistake here, not showing them one extra.
    const loose = run({
      id: 2,
      start_date_local: "2026-08-15T07:15:00Z",
      distance: 6_000,
      moving_time: 2_000,
    });
    expect(rankCandidates(target, [loose]).map((m) => m.run.id)).toEqual([2]);
  });

  it("caps the list", () => {
    const many = Array.from({ length: 9 }, (_, i) =>
      run({ id: i + 2, start_date_local: "2026-08-15T07:00:10Z" }),
    );
    expect(rankCandidates(target, many)).toHaveLength(5);
    expect(rankCandidates(target, many, 2)).toHaveLength(2);
  });

  it("breaks a tie deterministically", () => {
    // Two identical runs must not come back in whichever order the array
    // happened to arrive in — the athlete would see the list reshuffle itself
    // between renders.
    const a = run({ id: 7 });
    const b = run({ id: 3 });
    expect(rankCandidates(target, [a, b]).map((m) => m.run.id)).toEqual([3, 7]);
    expect(rankCandidates(target, [b, a]).map((m) => m.run.id)).toEqual([3, 7]);
  });

  it("returns nothing rather than everything when there is nothing", () => {
    expect(rankCandidates(target, [])).toEqual([]);
  });
});
