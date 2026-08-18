import { describe, expect, it } from "vitest";
import { estimateDurationInFrames, MAX_STORY_SECONDS } from "./duration";
import {
  recommendTemplate,
  templateEligibilities,
  templateEligibility,
} from "./eligibility";
import {
  asPartner,
  FIXTURE_A,
  FIXTURE_A_PARTNER,
  FIXTURE_B,
  FIXTURE_C,
  FIXTURE_D,
  FIXTURE_K,
  FIXTURES,
} from "./fixtures";
import { getTemplate, VIDEO_TEMPLATES } from "./registry";

describe("eligibility", () => {
  it("offers everything for a typical GPS run with a partner on it", () => {
    const input = { ...FIXTURE_A, partner: asPartner(FIXTURE_A_PARTNER) };
    for (const entry of templateEligibilities(input)) {
      expect(entry.eligible, entry.id).toBe(true);
      expect(entry.reason, entry.id).toBeUndefined();
    }
  });

  it("holds the duo cut back until somebody has accepted", () => {
    // Not a fact about the run: the same GPS run is eligible the moment an
    // invitation on it is answered, which is why the picker greys it rather
    // than hiding it.
    const alone = templateEligibility("duo-replay", FIXTURE_A);
    expect(alone.eligible).toBe(false);
    expect(alone.reasonKey).toBe("needs-partner");
    expect(
      templateEligibility("duo-replay", {
        ...FIXTURE_A,
        partner: asPartner(FIXTURE_A_PARTNER),
      }).eligible,
    ).toBe(true);
  });

  it("still needs a route of its own, partner or not", () => {
    // The partner's run is drawn beside this one, not instead of it: a
    // treadmill run with a friend on it has nothing to draw.
    expect(
      templateEligibility("duo-replay", {
        ...FIXTURE_B,
        partner: asPartner(FIXTURE_A_PARTNER),
      }).reasonKey,
    ).toBe("needs-route");
  });

  it("turns the map templates away from a treadmill, and keeps the rest", () => {
    const verdicts = Object.fromEntries(
      templateEligibilities(FIXTURE_B).map((entry) => [entry.id, entry]),
    );
    expect(verdicts["run-video"].eligible).toBe(false);
    expect(verdicts["run-video"].reason).toMatch(/GPS/);
    expect(verdicts["living-poster"].eligible).toBe(false);
    // The whole point of Split Rush: it serves the run the replay can't.
    expect(verdicts["split-rush"].eligible).toBe(true);
    expect(verdicts["minimal-numbers"].eligible).toBe(true);
  });

  it("gates Split Rush on having something to split", () => {
    const verdict = templateEligibility("split-rush", FIXTURE_D);
    expect(verdict.eligible).toBe(false);
    expect(verdict.reason).toBe("Needs at least 2 km");
  });

  it("always has an answer for a run that carries nothing", () => {
    const verdicts = templateEligibilities(FIXTURE_K);
    expect(
      verdicts.filter((entry) => entry.eligible).map((entry) => entry.id),
    ).toEqual(["minimal-numbers"]);
    expect(recommendTemplate(FIXTURE_K)).toBe("minimal-numbers");
  });

  it("never leaves a run with nothing to render", () => {
    for (const fixture of FIXTURES) {
      expect(
        templateEligibility("minimal-numbers", fixture).eligible,
        fixture.key,
      ).toBe(true);
      const recommended = recommendTemplate(fixture);
      expect(
        templateEligibility(recommended, fixture).eligible,
        fixture.key,
      ).toBe(true);
    }
  });

  it("gives a reason whenever it says no, and none when it says yes", () => {
    for (const fixture of FIXTURES) {
      for (const entry of templateEligibilities(fixture)) {
        expect(Boolean(entry.reason), `${fixture.key}/${entry.id}`).toBe(
          !entry.eligible,
        );
      }
    }
  });
});

describe("duration", () => {
  it("cuts every story template inside Instagram's segment limit", () => {
    for (const fixture of FIXTURES) {
      for (const template of VIDEO_TEMPLATES) {
        const frames = estimateDurationInFrames(template.id, fixture);
        expect(
          frames / template.fps,
          `${fixture.key}/${template.id}`,
        ).toBeLessThanOrEqual(MAX_STORY_SECONDS);
        expect(frames, `${fixture.key}/${template.id}`).toBeGreaterThan(0);
      }
    }
  });

  it("leaves a template with no estimator on its catalogue duration", () => {
    expect(estimateDurationInFrames("run-video", FIXTURE_A)).toBe(
      getTemplate("run-video").durationInFrames,
    );
  });

  it("gives a marathon a longer Split Rush than a parkrun", () => {
    expect(estimateDurationInFrames("split-rush", FIXTURE_C)).toBeGreaterThan(
      estimateDurationInFrames("split-rush", FIXTURE_A),
    );
  });

  it("answers the same way twice", () => {
    for (const template of VIDEO_TEMPLATES) {
      expect(estimateDurationInFrames(template.id, FIXTURE_A)).toBe(
        estimateDurationInFrames(template.id, FIXTURE_A),
      );
    }
  });
});
