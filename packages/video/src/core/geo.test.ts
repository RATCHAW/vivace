import { describe, expect, it } from "vitest";
import {
  cleanRoute,
  distanceMeters,
  pathLength,
  routeStrokeWidth,
  simplifyRoute,
  simplifyToTarget,
  type LatLng,
} from "./geo";

/** A straight-ish line of points, one metre apart, heading north. */
const line = (count: number): LatLng[] =>
  Array.from({ length: count }, (_, i) => [51.45 + i / 111_320, -2.58]);

describe("cleanRoute", () => {
  it("drops a fix that flew out and came straight back", () => {
    const points = line(20);
    points[10] = [points[10][0] + 0.003, points[10][1] + 0.003];
    const cleaned = cleanRoute(points);
    expect(cleaned).toHaveLength(19);
    expect(cleaned).not.toContainEqual(points[10]);
  });

  it("keeps the jump across a dropout, because the athlete really went there", () => {
    // Twenty seconds of silence and then a fix 200 m on: that is a tunnel, not
    // a spike, and deleting it would delete the run.
    const points = [...line(10), [51.4520, -2.58], ...line(5).map((p) => [p[0] + 0.002, p[1]])];
    const time = points.map((_, i) => (i === 10 ? 200 : i < 10 ? i : i + 200));
    expect(cleanRoute(points, time).length).toBeGreaterThanOrEqual(points.length - 1);
  });

  it("throws out coordinates that aren't ones", () => {
    const points: LatLng[] = [[51.45, -2.58], [Number.NaN, -2.58], [51.4501, -2.58]];
    expect(cleanRoute(points)).toHaveLength(2);
  });

  it("has nothing to say about an empty route", () => {
    expect(cleanRoute([])).toEqual([]);
  });
});

describe("simplifyRoute", () => {
  it("keeps the ends and drops the points that carry no shape", () => {
    const points = line(200);
    const simplified = simplifyRoute(points, 2);
    expect(simplified[0]).toEqual(points[0]);
    expect(simplified[simplified.length - 1]).toEqual(points[points.length - 1]);
    // A straight line simplifies to its two ends.
    expect(simplified).toHaveLength(2);
  });

  it("keeps a corner", () => {
    const points: LatLng[] = [
      [51.45, -2.58],
      [51.4509, -2.58],
      [51.4509, -2.5786],
    ];
    expect(simplifyRoute(points, 5)).toHaveLength(3);
  });

  it("lands a long route inside the target range", () => {
    // A wobbly route, so simplification has real work to do.
    const points: LatLng[] = Array.from({ length: 6000 }, (_, i) => [
      51.45 + Math.sin(i / 40) / 2000,
      -2.58 + i / 400_000,
    ]);
    const simplified = simplifyToTarget(points, 300, 600);
    expect(simplified.length).toBeLessThanOrEqual(600);
    expect(simplified.length).toBeGreaterThan(2);
  });

  it("leaves a route that is already short enough alone", () => {
    const points = line(100);
    expect(simplifyToTarget(points)).toEqual(points);
  });
});

describe("measurement", () => {
  it("measures a metre as a metre", () => {
    expect(distanceMeters([51.45, -2.58], [51.45 + 1 / 111_320, -2.58])).toBeCloseTo(1, 2);
  });

  it("sums a projected path", () => {
    expect(pathLength([[0, 0], [3, 4], [3, 8]])).toBe(9);
  });

  it("scales the stroke to the box the route fills", () => {
    const tight = routeStrokeWidth([[500, 900], [520, 920]]);
    const wide = routeStrokeWidth([[100, 300], [900, 1000]]);
    expect(tight).toBeLessThanOrEqual(wide);
    expect(tight).toBeGreaterThanOrEqual(10);
    expect(wide).toBeLessThanOrEqual(22);
  });
});
