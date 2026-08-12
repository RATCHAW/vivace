import { describe, expect, it } from "vitest";
import type { Run, RunStreams } from "@/api";
import {
  formatClock,
  formatKm,
  formatPace,
  metricsAtProgress,
  projectRoute,
  sampleIndex,
} from "./data";

const activity: Run = {
  id: 987654321,
  name: "Morning Run",
  distance: 5000,
  moving_time: 1500,
  total_elevation_gain: 42,
  sport_type: "Run",
  start_date_local: "2026-08-09T07:12:00Z",
  average_speed: 5000 / 1500,
  average_heartrate: 152.4,
};

describe("formatClock", () => {
  it("formats minutes and seconds", () => {
    expect(formatClock(754)).toBe("12:34");
  });
  it("formats hours with padded minutes", () => {
    expect(formatClock(3723)).toBe("1:02:03");
  });
});

describe("formatPace", () => {
  it("formats seconds per km", () => {
    expect(formatPace(312)).toBe("5:12");
  });
  it("handles unknown pace", () => {
    expect(formatPace(null)).toBe("–:––");
    expect(formatPace(0)).toBe("–:––");
  });
});

describe("formatKm", () => {
  it("renders meters as km with two decimals", () => {
    expect(formatKm(5021)).toBe("5.02");
  });
});

describe("sampleIndex", () => {
  it("clamps to the stream bounds", () => {
    expect(sampleIndex(100, -1)).toBe(0);
    expect(sampleIndex(100, 0)).toBe(0);
    expect(sampleIndex(100, 1)).toBe(99);
    expect(sampleIndex(100, 2)).toBe(99);
  });
  it("is empty-safe", () => {
    expect(sampleIndex(0, 0.5)).toBe(0);
  });
});

describe("metricsAtProgress", () => {
  const streams: RunStreams = {
    time: { data: [0, 750, 1500] },
    distance: { data: [0, 2500, 5000] },
    velocity_smooth: { data: [0, 3.2, 3.4] },
    heartrate: { data: [120, 150, 160] },
  };

  it("reads live values from the streams", () => {
    const mid = metricsAtProgress(activity, streams, 0.5);
    expect(mid.distanceMeters).toBe(2500);
    expect(mid.elapsedSeconds).toBe(750);
    expect(mid.paceSecondsPerKm).toBeCloseTo(1000 / 3.2);
    expect(mid.heartrate).toBe(150);
  });

  it("lands on the final samples at progress 1", () => {
    const end = metricsAtProgress(activity, streams, 1);
    expect(end.distanceMeters).toBe(5000);
    expect(end.elapsedSeconds).toBe(1500);
  });

  it("scales activity totals when streams are missing", () => {
    const mid = metricsAtProgress(activity, {}, 0.5);
    expect(mid.distanceMeters).toBe(2500);
    expect(mid.elapsedSeconds).toBe(750);
    expect(mid.paceSecondsPerKm).toBeCloseTo(300);
    expect(mid.heartrate).toBe(152);
  });
});

describe("projectRoute", () => {
  it("fits the route inside the padded box", () => {
    const points: [number, number][] = [
      [47.36, 8.53],
      [47.38, 8.55],
      [47.37, 8.56],
    ];
    const padding = { top: 480, bottom: 660, left: 130, right: 130 };
    const projected = projectRoute(points, 1080, 1920, padding);
    expect(projected).toHaveLength(3);
    for (const [x, y] of projected) {
      expect(x).toBeGreaterThanOrEqual(padding.left);
      expect(x).toBeLessThanOrEqual(1080 - padding.right);
      expect(y).toBeGreaterThanOrEqual(padding.top);
      expect(y).toBeLessThanOrEqual(1920 - padding.bottom);
    }
    // Northernmost point maps to the smallest y (screen up).
    const ys = projected.map(([, y]) => y);
    expect(Math.min(...ys)).toBe(projected[1][1]);
  });

  it("is empty-safe", () => {
    expect(projectRoute([], 1080, 1920, { top: 0, right: 0, bottom: 0, left: 0 })).toEqual([]);
  });
});
