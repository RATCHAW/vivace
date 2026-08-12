import { describe, expect, it } from "vitest";
import type { Run, RunStreams } from "@/api";
import {
  buildCameraTrack,
  CAMERA_TRACK_SAMPLES,
  cameraAtProgress,
  DRAW_END,
  DRAW_START,
  FPS,
  formatClock,
  formatKm,
  formatPace,
  MAX_CAMERA_ZOOM,
  metricsAtProgress,
  projectPoint,
  projectRoute,
  ROUTE_PADDING,
  RUNNER_CLEARANCE,
  sampleIndex,
  smoothingHalfWidth,
  VIDEO_HEIGHT,
  VIDEO_WIDTH,
  windowMean,
  type LatLng,
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

describe("windowMean", () => {
  it("averages the window, clamped to the stream bounds", () => {
    expect(windowMean([1, 2, 3], 0, 1)).toBe(1.5);
    expect(windowMean([1, 2, 3], 1, 5)).toBe(2);
  });
  it("ignores non-finite samples", () => {
    expect(windowMean([1, Number.NaN, 3], 1, 1)).toBe(2);
  });
  it("is empty-safe", () => {
    expect(windowMean(undefined, 0, 3)).toBeNull();
    expect(windowMean([], 0, 3)).toBeNull();
  });
});

describe("smoothingHalfWidth", () => {
  it("covers half a second of video at the draw's sample rate", () => {
    const drawFrames = DRAW_END - DRAW_START;
    // 4 samples per frame -> 60 samples per half-second, 30 either side.
    expect(smoothingHalfWidth(4 * drawFrames, FPS)).toBe(30);
  });
  it("does not smooth streams too short to step per frame", () => {
    expect(smoothingHalfWidth(3, FPS)).toBe(0);
  });
});

describe("metricsAtProgress smoothing", () => {
  // A real run steps several samples per frame, so a single bad sample used to
  // land whole on one frame and snap back on the next.
  const sampleCount = 4 * (DRAW_END - DRAW_START);
  const spikeIndex = sampleIndex(sampleCount, 0.5);

  const withSpike = (steady: number, spike: number) =>
    Array.from({ length: sampleCount }, (_, i) => (i === spikeIndex ? spike : steady));

  const streams: RunStreams = {
    time: { data: Array.from({ length: sampleCount }, (_, i) => i) },
    distance: { data: Array.from({ length: sampleCount }, (_, i) => i * 3) },
    velocity_smooth: { data: withSpike(3, 0.6) },
    heartrate: { data: withSpike(150, 190) },
  };

  it("rides through a pace spike instead of snapping to it", () => {
    const mid = metricsAtProgress(activity, streams, 0.5, FPS);
    // The raw sample reads 1000 / 0.6 ≈ 1667 s/km — a 5:33 pace flashing 27:47.
    // Averaged, the spike is worth a handful of seconds per km.
    expect(mid.paceSecondsPerKm).toBeGreaterThan(1000 / 3);
    expect(mid.paceSecondsPerKm).toBeLessThan(1000 / 3 + 10);
  });

  it("rides through a heart rate spike", () => {
    const mid = metricsAtProgress(activity, streams, 0.5, FPS);
    expect(mid.heartrate).toBe(151);
  });

  it("still reads distance and time straight off the streams", () => {
    const mid = metricsAtProgress(activity, streams, 0.5, FPS);
    expect(mid.elapsedSeconds).toBe(spikeIndex);
    expect(mid.distanceMeters).toBe(spikeIndex * 3);
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

describe("buildCameraTrack", () => {
  const viewport = {
    width: VIDEO_WIDTH,
    height: VIDEO_HEIGHT,
    padding: ROUTE_PADDING,
  };

  const leg = (from: LatLng, to: LatLng, steps: number): LatLng[] =>
    Array.from({ length: steps }, (_, i) => [
      from[0] + ((to[0] - from[0]) * i) / steps,
      from[1] + ((to[1] - from[1]) * i) / steps,
    ]);

  // 2km north, a hard right for 2km east, then back south-west to the start.
  // Each leg grows the drawn route's bounding box along a different axis, which
  // is what used to swing the camera off the runner mid-turn.
  const route: LatLng[] = [
    ...leg([47.36, 8.53], [47.378, 8.53], 80),
    ...leg([47.378, 8.53], [47.378, 8.557], 80),
    ...leg([47.378, 8.557], [47.36, 8.53], 80),
    [47.36, 8.53],
  ];

  const safeBox = {
    left: ROUTE_PADDING.left,
    right: VIDEO_WIDTH - ROUTE_PADDING.right,
    top: ROUTE_PADDING.top,
    bottom: VIDEO_HEIGHT - ROUTE_PADDING.bottom,
  };

  /** Points of `route` that are drawn at `progress` — the trace plus the runner
   *  dot at its head — that fall outside the safe box under `camera`. */
  const escapees = (progress: number) => {
    const camera = cameraAtProgress(buildCameraTrack(route, viewport), progress);
    if (!camera) throw new Error("no camera");
    return route
      .slice(0, sampleIndex(route.length, progress) + 1)
      .map((p) => projectPoint(p, camera, viewport))
      .filter(
        ([x, y]) =>
          x < safeBox.left - 1 ||
          x > safeBox.right + 1 ||
          y < safeBox.top - 1 ||
          y > safeBox.bottom + 1,
      );
  };

  it("holds the drawn trace and the runner in the safe box on every frame", () => {
    const track = buildCameraTrack(route, viewport);
    expect(track).toHaveLength(CAMERA_TRACK_SAMPLES);

    // Every frame of the draw, not just the keyframes: what the video reads is
    // interpolated between two of them.
    const offenders = Array.from({ length: DRAW_END - DRAW_START + 1 }, (_, i) =>
      escapees(i / (DRAW_END - DRAW_START)),
    ).flat();
    expect(offenders).toEqual([]);
  });

  it("opens on the start line at the tightest zoom", () => {
    const [opening] = buildCameraTrack(route, viewport);
    expect(opening.zoom).toBe(MAX_CAMERA_ZOOM);
    // The safe box is taller below the middle than above it, so the start dot
    // sits above the map's centre, not on it.
    const [x, y] = projectPoint(route[0], opening, viewport);
    expect(x).toBeCloseTo((safeBox.left + safeBox.right) / 2, 3);
    expect(y).toBeCloseTo((safeBox.top + safeBox.bottom) / 2, 3);
  });

  it("keeps the runner clear of the safe box's edges", () => {
    const track = buildCameraTrack(route, viewport);
    const grazed = track.filter((camera, i) => {
      const runner = route[sampleIndex(route.length, i / (track.length - 1))];
      const [x, y] = projectPoint(runner, camera, viewport);
      return (
        x < safeBox.left + RUNNER_CLEARANCE - 1 ||
        x > safeBox.right - RUNNER_CLEARANCE + 1 ||
        y < safeBox.top + RUNNER_CLEARANCE - 1 ||
        y > safeBox.bottom - RUNNER_CLEARANCE + 1
      );
    });
    // The trace behind the dot may touch the boundary; the dot itself sits a
    // gutter clear of it, or it reads as about to leave frame.
    expect(grazed).toEqual([]);
  });

  it("settles on the whole route, filling the safe box", () => {
    const track = buildCameraTrack(route, viewport);
    const last = track[track.length - 1];
    const projected = route.map((p) => projectPoint(p, last, viewport));
    const xs = projected.map(([x]) => x);
    const ys = projected.map(([, y]) => y);

    expect(Math.min(...xs)).toBeGreaterThanOrEqual(safeBox.left - 1);
    expect(Math.max(...xs)).toBeLessThanOrEqual(safeBox.right + 1);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(safeBox.top - 1);
    expect(Math.max(...ys)).toBeLessThanOrEqual(safeBox.bottom + 1);
    // Inside is not enough — the closing shot is a reveal, so the route has to
    // fill the box on its binding axis, give or take the runner's gutter.
    const filled = Math.max(
      (Math.max(...xs) - Math.min(...xs)) / (safeBox.right - safeBox.left),
      (Math.max(...ys) - Math.min(...ys)) / (safeBox.bottom - safeBox.top),
    );
    expect(filled).toBeGreaterThan(0.8);
  });

  it("only ever widens the shot", () => {
    const track = buildCameraTrack(route, viewport);
    const tightened = track.filter((camera, i) => i > 0 && camera.zoom > track[i - 1].zoom);
    expect(tightened).toEqual([]);
  });

  it("never cuts between frames", () => {
    const track = buildCameraTrack(route, viewport);
    const frames = Array.from({ length: DRAW_END - DRAW_START + 1 }, (_, i) =>
      cameraAtProgress(track, i / (DRAW_END - DRAW_START)),
    );
    // A camera that re-frames faster than this reads as a cut, not a move: an
    // eighth of a zoom level, or a tenth of the frame's width, per frame.
    for (let i = 1; i < frames.length; i += 1) {
      const from = frames[i - 1];
      const to = frames[i];
      if (!from || !to) throw new Error("no camera");
      expect(Math.abs(to.zoom - from.zoom)).toBeLessThan(0.125);
      const [x, y] = projectPoint([from.center[1], from.center[0]], to, viewport);
      expect(Math.hypot(x - VIDEO_WIDTH / 2, y - VIDEO_HEIGHT / 2)).toBeLessThan(
        VIDEO_WIDTH / 10,
      );
    }
  });

  it("is empty-safe", () => {
    expect(buildCameraTrack([], viewport)).toEqual([]);
    expect(cameraAtProgress([], 0.5)).toBeNull();
  });
});
