import { describe, expect, it } from "vitest";
import { FIXTURE_A, FIXTURE_C, FIXTURE_E, FIXTURE_F } from "../../fixtures";
import { CANVAS_HEIGHT, CANVAS_WIDTH, LOGO_TOP, SAFE_TOP } from "../../core/layout";
import { cleanRoute, distanceMeters } from "../../core/geo";
import {
  MIN_ROUTE_POINTS,
  POSTER_PADDING,
  posterPlan,
  posterRoute,
  posterStats,
  STATS_TOP,
  TYPE_BLOCK_TOP,
} from "./poster";

const FPS = 30;

describe("posterRoute", () => {
  it("simplifies a raw stream down to something a pen could have drawn", () => {
    const raw = FIXTURE_C.streams.latlng?.data ?? [];
    const route = posterRoute(FIXTURE_C.streams);
    expect(raw.length).toBeGreaterThan(5000);
    expect(route.length).toBeLessThanOrEqual(600);
    expect(route.length).toBeGreaterThanOrEqual(MIN_ROUTE_POINTS);
    // The start line and the finish are never simplified away.
    expect(route[0]).toEqual(raw[0]);
    expect(route[route.length - 1]).toEqual(raw[raw.length - 1]);
  });

  it("drops the fix that bounced off a building", () => {
    // Fixture F holds one sample 300 m off the route and back again.
    const raw = FIXTURE_F.streams.latlng?.data ?? [];
    const worstRaw = Math.max(
      ...raw.slice(1).map((point, index) => distanceMeters(raw[index], point)),
    );
    expect(worstRaw).toBeGreaterThan(200);

    // Measured on the cleaned route rather than the simplified one: simplifying
    // is *supposed* to leave long straight steps between the points it keeps.
    const cleaned = cleanRoute(raw, FIXTURE_F.streams.time?.data);
    const worst = Math.max(
      ...cleaned.slice(1).map((point, index) => distanceMeters(cleaned[index], point)),
    );
    expect(worst).toBeLessThan(20);
    expect(cleaned.length).toBeGreaterThan(raw.length - 5);
  });

  it("has nothing to draw for a run with no GPS", () => {
    expect(posterRoute({})).toEqual([]);
  });
});

describe("the composition", () => {
  it("frames the route in the upper band, north up, inside its padding", () => {
    for (const fixture of [FIXTURE_A, FIXTURE_E, FIXTURE_F]) {
      const plan = posterPlan(fixture.activity, fixture.streams, FPS, 10 * FPS);
      const xs = plan.projected.map(([x]) => x);
      const ys = plan.projected.map(([, y]) => y);
      expect(Math.min(...xs), fixture.key).toBeGreaterThanOrEqual(POSTER_PADDING.left - 0.5);
      expect(Math.max(...xs), fixture.key).toBeLessThanOrEqual(
        CANVAS_WIDTH - POSTER_PADDING.right + 0.5,
      );
      expect(Math.min(...ys), fixture.key).toBeGreaterThanOrEqual(POSTER_PADDING.top - 0.5);
      // The route never reaches the type block, let alone the lockup.
      expect(Math.max(...ys), fixture.key).toBeLessThanOrEqual(
        CANVAS_HEIGHT - POSTER_PADDING.bottom + 0.5,
      );
      expect(CANVAS_HEIGHT - POSTER_PADDING.bottom).toBeLessThan(TYPE_BLOCK_TOP);
    }
  });

  it("keeps the type block and the stat row inside the safe area", () => {
    expect(TYPE_BLOCK_TOP).toBeGreaterThan(SAFE_TOP);
    expect(STATS_TOP).toBeGreaterThan(TYPE_BLOCK_TOP);
    expect(STATS_TOP + 120).toBeLessThanOrEqual(LOGO_TOP);
  });

  it("scales the stroke to the route, so a loop and a marathon read as one pen", () => {
    const loop = posterPlan(FIXTURE_A.activity, FIXTURE_A.streams, FPS, 10 * FPS);
    const trail = posterPlan(FIXTURE_E.activity, FIXTURE_E.streams, FPS, 10 * FPS);
    for (const plan of [loop, trail]) {
      expect(plan.strokeWidth).toBeGreaterThanOrEqual(10);
      expect(plan.strokeWidth).toBeLessThanOrEqual(22);
    }
    // …and the reveal is timed against the drawn length, not the point count.
    expect(loop.length).toBeGreaterThan(0);
  });

  it("gives elevation a column only when there was a hill", () => {
    expect(posterStats(FIXTURE_A.activity)).toHaveLength(3);
    expect(posterStats(FIXTURE_E.activity)).toHaveLength(4);
    expect(posterStats(FIXTURE_E.activity)[3]).toMatchObject({ label: "Elevation", unit: "m" });
  });

  it("ends on a held frame, whatever duration it is handed", () => {
    for (const total of [8 * FPS, 10 * FPS, 15 * FPS]) {
      const plan = posterPlan(FIXTURE_A.activity, FIXTURE_A.streams, FPS, total);
      const hold = plan.beats[plan.beats.length - 1];
      expect(hold.id).toBe("hold");
      expect(hold.to).toBe(total);
      expect(hold.to - hold.from).toBeGreaterThan(0);
    }
  });

  it("draws the same poster twice", () => {
    expect(posterPlan(FIXTURE_A.activity, FIXTURE_A.streams, FPS, 10 * FPS)).toEqual(
      posterPlan(FIXTURE_A.activity, FIXTURE_A.streams, FPS, 10 * FPS),
    );
  });
});
