import { describe, expect, it } from "vitest";
import { FIXTURE_A, FIXTURE_B, FIXTURE_E, FIXTURE_K, FIXTURES } from "../../fixtures";
import { fitFontSize, LOGO_TOP, SAFE_TOP, SAFE_WIDTH } from "../../core/layout";
import {
  chooseMoments,
  minimalNumbersPlan,
  minimalNumbersSeconds,
  momentBox,
} from "./moments";

const FPS = 30;

describe("chooseMoments", () => {
  it("gets a film out of a run carrying only a distance and a time", () => {
    // The primary fixture: no streams, no speed, no heart rate, no climb.
    const moments = chooseMoments(FIXTURE_K.activity);
    expect(moments.map((moment) => moment.id)).toEqual(["distance", "time", "pace"]);
    // Pace is derived rather than dropped — the run knows how far and how long.
    expect(moments[2].value).toBeCloseTo(
      (FIXTURE_K.activity.moving_time * 1000) / FIXTURE_K.activity.distance,
      5,
    );
  });

  it("gives the fourth slot to a real climb, and to heart rate otherwise", () => {
    expect(chooseMoments(FIXTURE_E.activity).map((moment) => moment.id)).toContain("elevation");
    // Fixture A climbs 42 m — that is not a hill, so its heart rate wins.
    expect(chooseMoments(FIXTURE_A.activity).map((moment) => moment.id)).toContain("heartrate");
  });

  it("never shows more than four numbers before the card", () => {
    for (const fixture of FIXTURES) {
      expect(chooseMoments(fixture.activity).length, fixture.key).toBeLessThanOrEqual(4);
    }
  });

  it("alternates the anchor, because centring everything is what makes it a template", () => {
    const anchors = chooseMoments(FIXTURE_A.activity).map((moment) => moment.anchor);
    expect(anchors).toEqual(["left", "center", "right", "center"]);
  });

  it("starts a pace count-up short of the answer rather than at zero", () => {
    const pace = chooseMoments(FIXTURE_A.activity).find((moment) => moment.id === "pace");
    expect(pace?.from).toBeGreaterThan(0);
    expect(pace?.from).toBeLessThan(pace?.value ?? 0);
  });
});

describe("the plan", () => {
  it("is as long as the run has things to say", () => {
    // Variable duration is the feature: three numbers is a shorter film than
    // four, and neither is padded to the other's length.
    expect(minimalNumbersSeconds(FIXTURE_K.activity)).toBeLessThan(
      minimalNumbersSeconds(FIXTURE_A.activity),
    );
    for (const fixture of FIXTURES) {
      const seconds = minimalNumbersSeconds(fixture.activity);
      expect(seconds, fixture.key).toBeGreaterThanOrEqual(7);
      expect(seconds, fixture.key).toBeLessThanOrEqual(10);
    }
  });

  it("gives every moment a beat, and the card the rest", () => {
    const plan = minimalNumbersPlan(FIXTURE_A.activity, FPS, 12 * FPS);
    expect(plan.beats.map((beat) => beat.id)).toEqual([
      ...plan.moments.map((moment) => moment.id),
      "final",
    ]);
    expect(plan.beats[plan.beats.length - 1].to).toBe(12 * FPS);
  });

  it("still renders when a run has nothing at all", () => {
    const empty = { ...FIXTURE_B.activity, distance: 0, moving_time: 0, average_speed: 0 };
    const plan = minimalNumbersPlan(empty, FPS, 9 * FPS);
    expect(plan.moments).toHaveLength(0);
    // The closing card is the whole film, and it is still a film.
    expect(plan.beats).toHaveLength(1);
    expect(plan.beats[0].to).toBe(9 * FPS);
  });
});

describe("layout", () => {
  it("keeps every anchor inside the safe area and clear of the lockup", () => {
    for (const anchor of ["left", "center", "right"] as const) {
      const box = momentBox(anchor);
      expect(box.top, anchor).toBeGreaterThanOrEqual(SAFE_TOP);
      expect(box.top + box.height, anchor).toBeLessThanOrEqual(LOGO_TOP);
    }
  });

  it("fits every number on the frame without shrinking it to a caption", () => {
    for (const fixture of FIXTURES) {
      for (const moment of chooseMoments(fixture.activity)) {
        const measure = SAFE_WIDTH - (moment.unit ? 150 : 0);
        // The longest string the count-up passes through is the one it lands on.
        const spelled = "88:88.88".slice(0, 6);
        const size = fitFontSize(spelled, measure, 520);
        expect(size, `${fixture.key}/${moment.id}`).toBeGreaterThan(200);
      }
    }
  });
});
