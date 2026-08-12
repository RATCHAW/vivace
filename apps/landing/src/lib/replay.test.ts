import { describe, expect, it } from "vitest";
import {
  buildRoute,
  CANVAS,
  chapterWidth,
  clock,
  fade,
  pointAt,
  replayFrame,
  START_PHASE,
} from "./replay";

const route = buildRoute();

describe("buildRoute", () => {
  it("draws one closed loop inside the phone's canvas", () => {
    const first = route.points[0];
    const last = route.points[route.points.length - 1];
    expect(last[0]).toBeCloseTo(first[0], 5);
    expect(last[1]).toBeCloseTo(first[1], 5);

    for (const [x, y] of route.points) {
      expect(x).toBeGreaterThan(0);
      expect(x).toBeLessThan(CANVAS.width);
      expect(y).toBeGreaterThan(0);
      expect(y).toBeLessThan(CANVAS.height);
    }
  });

  it("produces path data and a positive arc length", () => {
    expect(route.d.startsWith("M")).toBe(true);
    expect(route.length).toBeGreaterThan(0);
    expect(route.cumulative).toHaveLength(route.points.length);
  });
});

describe("pointAt", () => {
  it("clamps to the ends of the route", () => {
    expect(pointAt(route, -1)).toEqual(route.points[0]);
    const [x, y] = pointAt(route, 2);
    const last = route.points[route.points.length - 1];
    expect(x).toBeCloseTo(last[0], 5);
    expect(y).toBeCloseTo(last[1], 5);
  });

  it("walks the route by arc length, not by index", () => {
    const half = pointAt(route, 0.5);
    // Half the arc length is roughly the far side of the loop, not the start.
    const start = route.points[0];
    expect(Math.hypot(half[0] - start[0], half[1] - start[1])).toBeGreaterThan(
      100,
    );
  });
});

describe("clock", () => {
  it("formats seconds as m:ss", () => {
    expect(clock(0)).toBe("0:00");
    expect(clock(9)).toBe("0:09");
    expect(clock(1169)).toBe("19:29");
    expect(clock(-5)).toBe("0:00");
  });
});

describe("fade", () => {
  it("ramps up, holds, then ramps down", () => {
    expect(fade(0, 0.1, 0.2, 0.8, 0.9)).toBe(0);
    expect(fade(0.15, 0.1, 0.2, 0.8, 0.9)).toBeCloseTo(0.5);
    expect(fade(0.5, 0.1, 0.2, 0.8, 0.9)).toBe(1);
    expect(fade(0.85, 0.1, 0.2, 0.8, 0.9)).toBeCloseTo(0.5);
    expect(fade(1, 0.1, 0.2, 0.8, 0.9)).toBe(0);
  });
});

describe("chapterWidth", () => {
  it("clamps to a percentage of the chapter", () => {
    expect(chapterWidth(0, 0.08, 0.74)).toBe("0%");
    expect(chapterWidth(0.41, 0.08, 0.74)).toBe("50%");
    expect(chapterWidth(1, 0.08, 0.74)).toBe("100%");
  });
});

describe("replayFrame", () => {
  it("holds the title card before the route chapter starts", () => {
    const frame = replayFrame(0, route);
    expect(frame.live.distance).toBe("0.00");
    expect(frame.live.pace).toBe("—");
    expect(frame.live.hr).toBe("—");
    expect(frame.mapOpacity).toBe("0.000");
    expect(frame.summaryOpacity).toBe("0.000");
  });

  it("serves a mid-run frame, so the page renders one without JS", () => {
    const frame = replayFrame(START_PHASE, route);
    expect(Number(frame.live.distance)).toBeGreaterThan(1);
    expect(Number(frame.mapOpacity)).toBe(1);
    expect(Number(frame.summaryOpacity)).toBe(0);
    expect(frame.chapters.title).toBe("100%");
    expect(frame.chapters.summary).toBe("0%");
  });

  it("lands the whole run, then the summary card", () => {
    const end = replayFrame(0.7, route);
    expect(end.live.distance).toBe("3.16");
    expect(end.live.time).toBe("19:29");
    expect(end.routeOffset).toBe("0.0");

    const summary = replayFrame(0.9, route);
    expect(Number(summary.summaryOpacity)).toBe(1);
    expect(Number(summary.mapOpacity)).toBe(0);
  });

  it("is a pure function of t, so the server and the first client frame agree", () => {
    expect(replayFrame(START_PHASE, route)).toEqual(
      replayFrame(START_PHASE, buildRoute()),
    );
  });
});
