import { describe, expect, it } from "vitest";
import {
  buildRoutesCameraTrack,
  cameraAtProgress,
  projectPoint,
} from "../../core/camera";
import { withinSafeArea } from "../../core/layout";
import { RUNNER_CLEARANCE } from "../../core/marker";
import {
  asPartner,
  FIXTURE_A,
  FIXTURE_A_PARTNER,
  FIXTURE_B,
} from "../../fixtures";
import { getTemplate } from "../../registry";
import type { VideoActivity } from "../../types";
import {
  duoBarFill,
  duoClock,
  duoDrawnAt,
  duoFrame,
  duoRunners,
  hasObscuredStart,
  progressAtSeconds,
  runSeconds,
  DUO_INK,
  DUO_ROUTE_PADDING,
  DUO_ROWS_BOX,
  DUO_TITLE_TOP,
} from "./duo";

const { fps, durationInFrames, width, height } = getTemplate("duo-replay");
// The template's own draw window, spelled the way the composition computes it.
const DRAW_FRAMES =
  Math.round(0.92 * durationInFrames) - Math.round(0.06 * durationInFrames);

const pair = (name = "Marianne") =>
  duoRunners(
    FIXTURE_A.activity,
    FIXTURE_A.streams,
    "",
    asPartner(FIXTURE_A_PARTNER, name),
    "Ayoub",
  );

describe("the two runners", () => {
  it("gives each of them their own ink, and the athlete the replay's", () => {
    const [you, partner] = pair();
    expect(you.color).toBe(DUO_INK.you);
    expect(partner.color).toBe(DUO_INK.partner);
    // The single-runner replay draws in cobalt; an athlete's own line looks the
    // same in both cuts, which is what stops the duo film reading as a
    // different app's.
    expect(you.color).toBe("#494fdf");
    expect(you.color).not.toBe(partner.color);
  });

  it("takes each route off its own streams", () => {
    const [you, partner] = pair();
    expect(you.points).toBe(FIXTURE_A.streams.latlng?.data);
    expect(partner.points).toBe(FIXTURE_A_PARTNER.streams.latlng?.data);
  });
});

describe("the shared clock", () => {
  it("reads the stagger off the two start times", () => {
    const clock = duoClock(pair());
    // A started at 07:12:00 and the partner at 07:13:30.
    expect(clock.fromWallClock).toBe(true);
    expect(clock.offsetSeconds[0]).toBe(0);
    expect(clock.offsetSeconds[1]).toBe(90);
  });

  it("runs until the last of them finishes, not the first", () => {
    const runners = pair();
    const clock = duoClock(runners);
    const ends = runners.map(
      (runner, index) =>
        runSeconds(runner.activity, runner.streams) +
        clock.offsetSeconds[index],
    );
    expect(clock.totalSeconds).toBe(Math.max(...ends));
    // Both of them cross their own line inside the film.
    expect(clock.totalSeconds).toBeGreaterThanOrEqual(Math.min(...ends));
  });

  it("lines them up at zero when a start time was hidden", () => {
    // Strava obscures a hidden start as midnight plus one second, so two runs
    // hidden on the same day would otherwise report a flawless zero stagger.
    const hidden = (activity: VideoActivity): VideoActivity => ({
      ...activity,
      start_date_local: "2026-08-09T00:00:01Z",
    });
    expect(hasObscuredStart(hidden(FIXTURE_A.activity))).toBe(true);

    const runners = pair();
    runners[1] = { ...runners[1], activity: hidden(runners[1].activity) };
    const clock = duoClock(runners);
    expect(clock.fromWallClock).toBe(false);
    expect(clock.offsetSeconds).toEqual([0, 0]);
  });

  it("refuses a stagger that would leave a bar empty for a fifth of the film", () => {
    const runners = pair();
    runners[1] = {
      ...runners[1],
      activity: {
        ...runners[1].activity,
        // Twenty minutes late: inside what the invite's matcher allows, and far
        // outside what two watches disagreeing by is.
        start_date_local: "2026-08-09T07:32:00Z",
      },
    };
    const clock = duoClock(runners);
    expect(clock.fromWallClock).toBe(false);
    expect(clock.offsetSeconds).toEqual([0, 0]);
  });

  it("survives a run with no streams at all", () => {
    const runners = pair();
    runners[1] = { ...runners[1], streams: {}, points: [] };
    const clock = duoClock(runners);
    expect(clock.totalSeconds).toBeGreaterThan(0);
    expect(Number.isFinite(clock.totalSeconds)).toBe(true);
  });
});

describe("progressAtSeconds", () => {
  it("reads the watch's own clock rather than dividing out the total", () => {
    // F's watch lost its fix for three minutes: the time stream jumps, and a
    // runner placed by elapsed/total would be three minutes down the road.
    const time = { data: [0, 10, 20, 200, 210, 220] };
    const streams = { time };
    // 30 seconds in, the athlete is still at the third sample — not halfway.
    expect(progressAtSeconds(streams, 30, 220)).toBeCloseTo(2 / 5, 6);
    // …and 205 seconds in they have only just moved off it: the three minutes
    // between samples 2 and 3 are the dropout, not distance covered.
    expect(progressAtSeconds(streams, 205, 220)).toBeCloseTo(3 / 5, 6);
  });

  it("clamps at both ends", () => {
    const streams = { time: { data: [0, 1, 2, 3] } };
    expect(progressAtSeconds(streams, -50, 3)).toBe(0);
    expect(progressAtSeconds(streams, 5000, 3)).toBe(1);
  });

  it("falls back to the totals when there is no time stream", () => {
    expect(progressAtSeconds({}, 300, 600)).toBeCloseTo(0.5, 6);
    expect(progressAtSeconds({}, 300, 0)).toBe(0);
  });
});

describe("each frame of the film", () => {
  const runners = pair();
  const clock = duoClock(runners);
  const at = (progress: number) =>
    duoFrame(runners, clock, progress, fps, DRAW_FRAMES);

  it("holds the later runner on the line until their own clock starts", () => {
    const [you, partner] = at(0);
    expect(you.started).toBe(true);
    expect(partner.started).toBe(false);
    // Nothing drawn is what `core/RouteMap` reads as "start marker only".
    expect(partner.drawn).toBe(0);
    expect(partner.live.distanceMeters).toBe(0);
  });

  it("has both of them running once the stagger is spent", () => {
    const after = clock.offsetSeconds[1] / clock.totalSeconds + 0.01;
    const [you, partner] = at(after);
    expect(you.started).toBe(true);
    expect(partner.started).toBe(true);
    expect(partner.drawn).toBeGreaterThan(0);
  });

  it("finishes both of them by the end, each on their own totals", () => {
    const [you, partner] = at(1);
    expect(you.finished).toBe(true);
    expect(partner.finished).toBe(true);
    expect(you.live.distanceMeters).toBeCloseTo(FIXTURE_A.activity.distance, 0);
    expect(partner.live.distanceMeters).toBeCloseTo(
      FIXTURE_A_PARTNER.activity.distance,
      0,
    );
  });

  it("only ever draws more of a route, never less", () => {
    let previous = [0, 0];
    for (let i = 0; i <= 60; i += 1) {
      const drawn = duoDrawnAt(runners, clock, i / 60);
      expect(drawn[0]).toBeGreaterThanOrEqual(previous[0]);
      expect(drawn[1]).toBeGreaterThanOrEqual(previous[1]);
      previous = drawn;
    }
    expect(previous[0]).toBe(runners[0].points.length);
    expect(previous[1]).toBe(runners[1].points.length);
  });

  it("agrees with the numbers it draws under the dots", () => {
    // The whole point of one clock: the trace's head and the bar under it are
    // the same instant of the same run.
    const [you] = at(0.5);
    const covered =
      FIXTURE_A.streams.distance?.data[you.drawn - 1] ?? Number.NaN;
    expect(you.live.distanceMeters).toBeCloseTo(covered, 6);
  });
});

describe("the two bars", () => {
  it("puts both of them on the longer run's scale", () => {
    const runners = pair();
    const clock = duoClock(runners);
    const frames = duoFrame(runners, clock, 1, fps, DRAW_FRAMES);
    const [you, partner] = duoBarFill(frames);

    // A ran further, so A's bar fills and the partner's stops short — two full
    // bars would say they covered the same ground.
    expect(you).toBeCloseTo(1, 2);
    expect(partner).toBeLessThan(1);
    expect(partner).toBeCloseTo(
      FIXTURE_A_PARTNER.activity.distance / FIXTURE_A.activity.distance,
      2,
    );
  });

  it("is empty-safe for a run with no distance in it", () => {
    const runners = duoRunners(
      { ...FIXTURE_B.activity, distance: 0 },
      {},
      "",
      asPartner({
        ...FIXTURE_B,
        activity: { ...FIXTURE_B.activity, distance: 0 },
      }),
    );
    const frames = duoFrame(runners, duoClock(runners), 0.5, fps, DRAW_FRAMES);
    expect(duoBarFill(frames)).toEqual([0, 0]);
  });
});

describe("the shot", () => {
  const runners = pair();
  const clock = duoClock(runners);
  const viewport = { width, height, padding: DUO_ROUTE_PADDING };
  const track = buildRoutesCameraTrack(
    runners.map((runner) => runner.points),
    (progress) => duoDrawnAt(runners, clock, progress),
    viewport,
    { clearance: RUNNER_CLEARANCE },
  );
  const safeBox = {
    left: DUO_ROUTE_PADDING.left,
    right: width - DUO_ROUTE_PADDING.right,
    top: DUO_ROUTE_PADDING.top,
    bottom: height - DUO_ROUTE_PADDING.bottom,
  };

  it("holds both drawn traces in the safe box on every frame", () => {
    // Not just the keyframes: what the video reads is interpolated between two
    // of them, and framing one runner while the other leaves is the whole
    // failure this template could have.
    const escapees: string[] = [];
    for (let frame = 0; frame <= DRAW_FRAMES; frame += 1) {
      const progress = frame / DRAW_FRAMES;
      const camera = cameraAtProgress(track, progress);
      if (!camera) throw new Error("no camera");
      const drawn = duoDrawnAt(runners, clock, progress);
      runners.forEach((runner, index) => {
        for (const point of runner.points.slice(0, drawn[index])) {
          const [x, y] = projectPoint(point, camera, { width, height });
          if (
            x < safeBox.left - 1 ||
            x > safeBox.right + 1 ||
            y < safeBox.top - 1 ||
            y > safeBox.bottom + 1
          ) {
            escapees.push(`${runner.key}@${frame}`);
          }
        }
      });
    }
    expect(escapees).toEqual([]);
  });

  it("keeps both runners clear of the edges, and only ever widens", () => {
    const grazed: string[] = [];
    track.forEach((camera, index) => {
      const drawn = duoDrawnAt(runners, clock, index / (track.length - 1));
      runners.forEach((runner, r) => {
        if (drawn[r] < 1) return;
        const head = runner.points[drawn[r] - 1];
        const [x, y] = projectPoint(head, camera, { width, height });
        if (
          x < safeBox.left + RUNNER_CLEARANCE - 1 ||
          x > safeBox.right - RUNNER_CLEARANCE + 1 ||
          y < safeBox.top + RUNNER_CLEARANCE - 1 ||
          y > safeBox.bottom - RUNNER_CLEARANCE + 1
        ) {
          grazed.push(`${runner.key}@${index}`);
        }
      });
    });
    expect(grazed).toEqual([]);

    // A shot that widens, narrows and widens again reads as hesitation — and
    // with two runners coming apart there is always something new to hold.
    expect(
      track.filter((camera, i) => i > 0 && camera.zoom > track[i - 1].zoom),
    ).toEqual([]);
  });

  it("frames both start lines before either of them has set off", () => {
    // The later runner's marker is on the plate from frame one, so the opening
    // shot has to hold it even though there is no trace behind it yet.
    const [opening] = track;
    for (const runner of runners) {
      const [x, y] = projectPoint(runner.points[0], opening, { width, height });
      expect(x, runner.key).toBeGreaterThanOrEqual(safeBox.left - 1);
      expect(x, runner.key).toBeLessThanOrEqual(safeBox.right + 1);
      expect(y, runner.key).toBeGreaterThanOrEqual(safeBox.top - 1);
      expect(y, runner.key).toBeLessThanOrEqual(safeBox.bottom + 1);
    }
  });

  it("is empty-safe when neither of them recorded a route", () => {
    expect(buildRoutesCameraTrack([[], []], () => [0, 0], viewport)).toEqual(
      [],
    );
  });
});

describe("the layout", () => {
  it("keeps both bars inside the story's safe area", () => {
    // Instagram covers the top with the poster's name and the bottom with the
    // reply bar. A number outside this band is a number nobody reads.
    expect(withinSafeArea(DUO_ROWS_BOX)).toBe(true);
    expect(withinSafeArea({ top: DUO_TITLE_TOP, height: 140 })).toBe(true);
  });

  it("leaves the map a box that clears both bands", () => {
    // The route may cross the safe area — it is illustration — but the camera
    // must not frame it under the bars, or the trace draws behind the numbers.
    expect(DUO_ROUTE_PADDING.bottom).toBeGreaterThan(height - DUO_ROWS_BOX.top);
    expect(
      height - DUO_ROUTE_PADDING.top - DUO_ROUTE_PADDING.bottom,
    ).toBeGreaterThan(400);
  });
});
