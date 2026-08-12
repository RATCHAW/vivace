import { describe, expect, it } from "vitest";
import type { Run, RunStreams } from "@/api";
import {
  buildCameraTrack,
  buildSparkline,
  buildSplits,
  CAMERA_TRACK_SAMPLES,
  cameraAtProgress,
  chapterAtProgress,
  chapterProgress,
  CHAPTERS,
  DRAW_END,
  DRAW_START,
  fadeAt,
  FPS,
  formatClock,
  formatKm,
  formatPace,
  MAX_CAMERA_ZOOM,
  MAX_SPLIT_ROWS,
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

describe("chapters", () => {
  it("covers the whole timeline without a gap", () => {
    expect(CHAPTERS[0].start).toBe(0);
    expect(CHAPTERS[CHAPTERS.length - 1].end).toBe(1);
    for (let i = 1; i < CHAPTERS.length; i += 1) {
      expect(CHAPTERS[i].start).toBe(CHAPTERS[i - 1].end);
    }
  });

  it("reads the chapter under a progress", () => {
    expect(chapterAtProgress(0).id).toBe("title");
    expect(chapterAtProgress(0.3).id).toBe("route");
    expect(chapterAtProgress(0.7).id).toBe("effort");
    // The boundary belongs to the chapter starting there, and the end of the
    // film stays on the last one rather than falling off it.
    expect(chapterAtProgress(0.85).id).toBe("summary");
    expect(chapterAtProgress(1).id).toBe("summary");
  });

  it("measures progress within a chapter", () => {
    const route = CHAPTERS[1];
    expect(chapterProgress(route, 0.1)).toBe(0);
    expect(chapterProgress(route, 0.38)).toBeCloseTo(0.5);
    expect(chapterProgress(route, 0.66)).toBe(1);
    // Chapters behind read full, chapters ahead read empty.
    expect(chapterProgress(route, 0.9)).toBe(1);
    expect(chapterProgress(route, 0)).toBe(0);
  });
});

describe("fadeAt", () => {
  it("ramps up, holds, and ramps down", () => {
    expect(fadeAt(0.05, 0.1, 0.2, 0.8, 0.9)).toBe(0);
    expect(fadeAt(0.15, 0.1, 0.2, 0.8, 0.9)).toBeCloseTo(0.5);
    expect(fadeAt(0.5, 0.1, 0.2, 0.8, 0.9)).toBe(1);
    expect(fadeAt(0.85, 0.1, 0.2, 0.8, 0.9)).toBeCloseTo(0.5);
    expect(fadeAt(0.95, 0.1, 0.2, 0.8, 0.9)).toBe(0);
  });

  it("holds to the end when released past 1", () => {
    expect(fadeAt(1, 0.85, 0.89, 1.01, 1.02)).toBe(1);
  });
});

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

describe("buildSparkline", () => {
  const rising = Array.from({ length: 200 }, (_, i) => 120 + i * 0.2);

  it("spans the box and stays inside it", () => {
    const line = buildSparkline(rising, 900, 240);
    if (!line) throw new Error("no sparkline");

    const coords = line.d
      .split(/[ML]/)
      .filter(Boolean)
      .map((pair) => pair.trim().split(" ").map(Number));
    expect(coords[0][0]).toBe(0);
    expect(coords[coords.length - 1][0]).toBe(900);
    for (const [, y] of coords) {
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(240);
    }
    // Screen y runs down, so a rising channel falls across the plot.
    expect(coords[coords.length - 1][1]).toBeLessThan(coords[0][1]);
    expect(line.length).toBeGreaterThan(900);
    expect(line.min).toBeCloseTo(rising[0], 0);
    expect(line.max).toBeCloseTo(rising[rising.length - 1], 0);
  });

  it("leaves headroom above the peak", () => {
    const line = buildSparkline(rising, 900, 240);
    if (!line) throw new Error("no sparkline");
    const ys = line.d
      .split(/[ML]/)
      .filter(Boolean)
      .map((pair) => Number(pair.trim().split(" ")[1]));
    expect(Math.min(...ys)).toBeGreaterThan(0);
    expect(Math.max(...ys)).toBeLessThan(240);
  });

  it("has nothing to plot for missing, short or flat channels", () => {
    expect(buildSparkline(undefined, 900, 240)).toBeNull();
    expect(buildSparkline([150], 900, 240)).toBeNull();
    expect(buildSparkline(Array(200).fill(150), 900, 240)).toBeNull();
  });

  it("ignores non-finite samples", () => {
    const line = buildSparkline([1, Number.NaN, 2, 3, 4, 5], 100, 50, 4);
    expect(line).not.toBeNull();
  });
});

describe("buildSplits", () => {
  /** A run at a dead-steady pace, sampled every 10 metres. */
  const steady = (metres: number, seconds: number) => {
    const samples = metres / 10 + 1;
    return {
      activity: {
        ...activity,
        distance: metres,
        moving_time: seconds,
        average_speed: metres / seconds,
      },
      streams: {
        distance: { data: Array.from({ length: samples }, (_, i) => i * 10) },
        time: {
          data: Array.from({ length: samples }, (_, i) => (i * 10 * seconds) / metres),
        },
      } satisfies RunStreams,
    };
  };

  it("splits a short run by the kilometre", () => {
    const { activity: run, streams } = steady(5000, 1500);
    const splits = buildSplits(run, streams);
    expect(splits.map((s) => s.label)).toEqual(["1", "2", "3", "4", "5"]);
    for (const split of splits) {
      expect(split.paceSecondsPerKm).toBeCloseTo(300);
      expect(split.weight).toBeCloseTo(1);
    }
  });

  it("weights each split against the fastest one", () => {
    const { activity: run } = steady(3000, 900);
    // 5:00, 6:00 then 4:00 per km.
    const streams: RunStreams = {
      distance: { data: [0, 1000, 2000, 3000] },
      time: { data: [0, 300, 660, 900] },
    };
    const splits = buildSplits(run, streams);
    expect(splits.map((s) => s.paceSecondsPerKm)).toEqual([300, 360, 240]);
    expect(splits[2].weight).toBe(1);
    expect(splits[0].weight).toBeCloseTo(240 / 300);
    expect(splits[1].weight).toBeCloseTo(240 / 360);
  });

  it("groups a long run into whole-kilometre steps within the row budget", () => {
    const { activity: run, streams } = steady(20000, 6000);
    const splits = buildSplits(run, streams);
    expect(splits.length).toBeLessThanOrEqual(MAX_SPLIT_ROWS);
    expect(splits.map((s) => s.label)).toEqual([
      "3",
      "6",
      "9",
      "12",
      "15",
      "18",
      "20",
    ]);
    // Three kilometres each, so the pace is still per kilometre.
    for (const split of splits) expect(split.paceSecondsPerKm).toBeCloseTo(300);
  });

  it("folds an overflowing trailing split into the one before it", () => {
    const { activity: run, streams } = steady(8510, 2553);
    const splits = buildSplits(run, streams);
    expect(splits).toHaveLength(MAX_SPLIT_ROWS);
    expect(splits[splits.length - 1].label).toBe("8.5");
  });

  it("absorbs a trailing split too short to compare", () => {
    const { activity: run, streams } = steady(3160, 948);
    const splits = buildSplits(run, streams);
    // 3.16km: the last 160m rides along with kilometre three.
    expect(splits.map((s) => s.label)).toEqual(["1", "2", "3.2"]);
  });

  it("falls back to the average pace without streams", () => {
    const { activity: run } = steady(5000, 1500);
    const splits = buildSplits(run, {});
    expect(splits).toHaveLength(5);
    for (const split of splits) expect(split.paceSecondsPerKm).toBeCloseTo(300);
  });

  it("has nothing to compare on a run under two kilometres", () => {
    const { activity: run, streams } = steady(1500, 450);
    expect(buildSplits(run, streams)).toEqual([]);
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
