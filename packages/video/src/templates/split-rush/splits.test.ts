import { describe, expect, it } from "vitest";
import {
  FIXTURE_A,
  FIXTURE_B,
  FIXTURE_C,
  FIXTURE_F,
  FIXTURE_K,
} from "../../fixtures";
import { LOGO_TOP, SAFE_TOP } from "../../core/layout";
import type { VideoActivity, VideoStreams } from "../../types";
import {
  CASCADE_LIMIT,
  FLAT_BAR,
  chooseVerdict,
  computeSplits,
  encodeSplits,
  splitRushPlan,
  splitRushSeconds,
  splitStats,
} from "./splits";

const FPS = 30;

/** A run built split by split, so a test can say exactly what happened in it. */
function runOfSplits(
  paces: number[],
  tailMeters = 0,
): {
  activity: VideoActivity;
  streams: VideoStreams;
} {
  const distance: number[] = [0];
  const time: number[] = [0];
  let meters = 0;
  let seconds = 0;
  for (const pace of paces) {
    for (let step = 0; step < 10; step += 1) {
      meters += 100;
      seconds += pace / 10;
      distance.push(meters);
      time.push(seconds);
    }
  }
  if (tailMeters > 0) {
    meters += tailMeters;
    seconds += (paces[paces.length - 1] * tailMeters) / 1000;
    distance.push(meters);
    time.push(seconds);
  }
  return {
    activity: {
      id: 7,
      name: "Test run",
      distance: meters,
      moving_time: seconds,
      total_elevation_gain: 10,
      sport_type: "Run",
      start_date_local: "2026-08-09T07:12:00Z",
      average_speed: meters / seconds,
      average_heartrate: null,
      max_heartrate: null,
      workout_type: "default",
    },
    streams: { distance: { data: distance }, time: { data: time } },
  };
}

describe("computeSplits", () => {
  it("cuts a run at every kilometre", () => {
    const { activity, streams } = runOfSplits([300, 290, 310, 295, 285]);
    const splits = computeSplits(activity, streams);
    expect(splits).toHaveLength(5);
    expect(splits.map((split) => Math.round(split.paceSecondsPerKm))).toEqual([
      300, 290, 310, 295, 285,
    ]);
    expect(splits.every((split) => !split.partial)).toBe(true);
  });

  it("keeps a tail as a partial split, labelled by its distance", () => {
    const { activity, streams } = runOfSplits([300, 300], 400);
    const splits = computeSplits(activity, streams);
    expect(splits).toHaveLength(3);
    expect(splits[2].partial).toBe(true);
    expect(splits[2].label).toBe("0.4");
    expect(splits[2].distanceMeters).toBeCloseTo(400, 0);
  });

  it("drops a tail too short to be a split", () => {
    const { activity, streams } = runOfSplits([300, 300], 20);
    expect(computeSplits(activity, streams)).toHaveLength(2);
  });

  it("adds up to the moving time on the activity", () => {
    const splits = computeSplits(FIXTURE_A.activity, FIXTURE_A.streams);
    const total = splits.reduce((sum, split) => sum + split.seconds, 0);
    // The tail under 60 m is dropped, so the splits cover slightly less than the
    // whole run — but every second of what they do cover is accounted for.
    expect(total).toBeGreaterThan(FIXTURE_A.activity.moving_time * 0.98);
    expect(total).toBeLessThanOrEqual(FIXTURE_A.activity.moving_time + 1);
  });

  it("does not let a stopped watch become a slow kilometre", () => {
    // Fixture F holds a three-minute dropout in the middle of the run. Elapsed
    // time says one kilometre took far longer than the rest; moving time knows
    // better, and the splits are cut from moving time.
    const splits = computeSplits(FIXTURE_F.activity, FIXTURE_F.streams);
    const paces = splits.map((split) => split.paceSecondsPerKm);
    const slowest = Math.max(...paces);
    const median = [...paces].sort((a, b) => a - b)[
      Math.floor(paces.length / 2)
    ];
    expect(slowest).toBeLessThan(median * 1.25);
  });

  it("splits a run with no streams at its own average pace", () => {
    const splits = computeSplits(FIXTURE_K.activity, FIXTURE_K.streams);
    expect(splits.length).toBeGreaterThan(0);
    const paces = splits.map((split) => Math.round(split.paceSecondsPerKm));
    expect(new Set(paces).size).toBe(1);
  });

  it("returns the same splits every time", () => {
    expect(computeSplits(FIXTURE_C.activity, FIXTURE_C.streams)).toEqual(
      computeSplits(FIXTURE_C.activity, FIXTURE_C.streams),
    );
  });
});

describe("the bar encoding", () => {
  it("makes the faster split the longer bar", () => {
    const { activity, streams } = runOfSplits([320, 300, 280]);
    const splits = computeSplits(activity, streams);
    const { widths, fastestIndex } = encodeSplits(splits);
    expect(widths[0]).toBeLessThan(widths[1]);
    expect(widths[1]).toBeLessThan(widths[2]);
    expect(fastestIndex).toBe(2);
  });

  it("spreads a consistent run over the whole measure rather than proportionally", () => {
    const { activity, streams } = runOfSplits([300, 297, 303]);
    const { widths } = encodeSplits(computeSplits(activity, streams));
    // Raw proportional scaling would put these within 2% of each other and the
    // chart would read as five identical bars.
    expect(Math.min(...widths)).toBeCloseTo(0.4, 5);
    expect(Math.max(...widths)).toBeCloseTo(1, 5);
  });

  it("keeps every bar inside the measure", () => {
    for (const fixture of [FIXTURE_A, FIXTURE_C, FIXTURE_F]) {
      const { widths } = encodeSplits(
        computeSplits(fixture.activity, fixture.streams),
      );
      for (const width of widths) {
        expect(width).toBeGreaterThan(0);
        expect(width).toBeLessThanOrEqual(1);
      }
    }
  });

  it("never calls a partial split the fastest one", () => {
    // The 400 m tail is run at 4:00/km — faster than any full kilometre — and it
    // is still not the fastest kilometre, because it is not a kilometre.
    const { activity, streams } = runOfSplits([300, 310, 305], 400);
    const splits = computeSplits(activity, streams);
    splits[3].seconds = 96;
    splits[3].paceSecondsPerKm = 240;
    const { fastestIndex, widths } = encodeSplits(splits);
    expect(fastestIndex).toBe(0);
    // …and its bar is cut to the distance it covered.
    expect(widths[3]).toBeLessThan(0.5);
  });

  it("sees a treadmill at one speed as flat", () => {
    const encoding = encodeSplits(
      computeSplits(FIXTURE_B.activity, FIXTURE_B.streams),
    );
    expect(encoding.flat).toBe(true);
    expect(encoding.fastestIndex).toBe(-1);
    expect(new Set(encoding.widths)).toEqual(new Set([FLAT_BAR]));
  });
});

describe("the verdict", () => {
  const verdictOf = (paces: number[], tail = 0) => {
    const { activity, streams } = runOfSplits(paces, tail);
    return chooseVerdict(computeSplits(activity, streams), activity);
  };

  it("prefers a negative split over everything else", () => {
    const verdict = verdictOf([320, 315, 300, 295]);
    expect(verdict.id).toBe("negative-split");
    expect(verdict.detail).toMatch(/SECOND HALF \d+% FASTER/);
  });

  it("calls a fast finish when the last kilometre is the fastest", () => {
    // First half faster than the second overall, so only the finish is left.
    const verdict = verdictOf([300, 290, 340, 285]);
    expect(verdict.id).toBe("fastest-finish");
  });

  it("calls even pacing a metronome, and never claims a personal best", () => {
    const verdict = verdictOf([300, 302, 299, 301, 305]);
    expect(verdict.id).toBe("metronome");
    // "Most consistent run yet" needs the last ten runs, and this template is
    // handed one.
    expect(verdict.headline).not.toMatch(/yet/i);
  });

  it("names the fastest kilometre when one stands out", () => {
    const verdict = verdictOf([330, 260, 340, 335]);
    expect(verdict.id).toBe("fastest-split");
    expect(verdict.headline).toMatch(/Fastest km — \d:\d\d/);
  });

  it("falls back to average pace, including for a treadmill", () => {
    expect(
      chooseVerdict(
        computeSplits(FIXTURE_B.activity, FIXTURE_B.streams),
        FIXTURE_B.activity,
      ).id,
    ).toBe("average-pace");
    const short = runOfSplits([300]);
    expect(
      chooseVerdict(
        computeSplits(short.activity, short.streams),
        short.activity,
      ).id,
    ).toBe("average-pace");
  });

  it("never surfaces a negative", () => {
    const forbidden = /slow|worst|below|fade|drop|lost/i;
    for (const paces of [
      [300, 320, 340, 360],
      [300, 300, 300],
      [280, 340, 300, 330],
    ]) {
      const verdict = verdictOf(paces);
      expect(verdict.headline).not.toMatch(forbidden);
      expect(verdict.detail).not.toMatch(forbidden);
    }
  });
});

describe("splitStats", () => {
  it("finds the kilometre that broke away from the running average", () => {
    const { activity, streams } = runOfSplits([320, 318, 322, 270, 315]);
    const stats = splitStats(computeSplits(activity, streams));
    expect(stats.breakawayIndex).toBe(3);
  });
});

describe("the plan", () => {
  it("cascades a short run and draws a long one as a strip", () => {
    const short = splitRushPlan(
      FIXTURE_A.activity,
      FIXTURE_A.streams,
      FPS,
      12 * FPS,
    );
    expect(short.mode).toBe("cascade");
    expect(short.splits.length).toBeLessThanOrEqual(CASCADE_LIMIT);

    const marathon = splitRushPlan(
      FIXTURE_C.activity,
      FIXTURE_C.streams,
      FPS,
      12 * FPS,
    );
    expect(marathon.mode).toBe("strip");
    expect(marathon.splits.length).toBeGreaterThan(40);
    // Three splits worth zooming to, and no two the same.
    expect(marathon.heroes.length).toBeGreaterThanOrEqual(2);
    expect(new Set(marathon.heroes.map((split) => split.index)).size).toBe(
      marathon.heroes.length,
    );
  });

  it("keeps every row inside the safe area, marathon included", () => {
    for (const fixture of [FIXTURE_A, FIXTURE_B, FIXTURE_C, FIXTURE_F]) {
      const plan = splitRushPlan(
        fixture.activity,
        fixture.streams,
        FPS,
        12 * FPS,
      );
      for (const row of plan.rows) {
        expect(row.top, fixture.key).toBeGreaterThanOrEqual(SAFE_TOP);
        expect(row.top + row.height, fixture.key).toBeLessThanOrEqual(LOGO_TOP);
      }
    }
  });

  it("fills the frames it was given, however many those are", () => {
    for (const total of [8 * FPS, 12 * FPS, 15 * FPS]) {
      const plan = splitRushPlan(
        FIXTURE_A.activity,
        FIXTURE_A.streams,
        FPS,
        total,
      );
      expect(plan.beats[0].from).toBe(0);
      expect(plan.beats[plan.beats.length - 1].to).toBe(total);
      // Beats run end to end with no gap and no overlap.
      for (let i = 1; i < plan.beats.length; i += 1) {
        expect(plan.beats[i].from).toBe(plan.beats[i - 1].to);
      }
    }
  });

  it("is shorter for a run with nothing to compare", () => {
    expect(splitRushSeconds(FIXTURE_B.activity, FIXTURE_B.streams)).toBe(8);
    expect(
      splitRushSeconds(FIXTURE_A.activity, FIXTURE_A.streams),
    ).toBeGreaterThan(8);
  });

  it("never runs past the story ceiling", () => {
    for (const fixture of [FIXTURE_A, FIXTURE_B, FIXTURE_C, FIXTURE_F]) {
      expect(
        splitRushSeconds(fixture.activity, fixture.streams),
        fixture.key,
      ).toBeLessThanOrEqual(15);
    }
  });
});
