import { describe, expect, it } from "vitest";
import {
  buildRoutesCameraTrack,
  cameraAtProgress,
  projectPoint,
} from "../../core/camera";
import { PAGE_INSET, SAFE_TOP, withinSafeArea } from "../../core/layout";
import {
  runnerLabelClearance,
  RUNNER_AVATAR_SIZE,
  RUNNER_DOT_RADIUS,
  RUNNER_LABEL,
} from "../../core/marker";
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
  duoFillBox,
  duoFrame,
  duoHeadlineBox,
  duoNumbersWidth,
  duoOutro,
  duoOutroMetric,
  duoRunners,
  hasObscuredStart,
  progressAtSeconds,
  runSeconds,
  DUO_BAR_HEIGHT,
  DUO_DRAW_FROM,
  DUO_DRAW_TO,
  DUO_INK,
  DUO_OUTRO_BOX,
  DUO_OUTRO_CARD_HEIGHT,
  DUO_OUTRO_CARD_TOP,
  DUO_OUTRO_COLUMN_LEFT,
  DUO_OUTRO_COLUMN_WIDTH,
  DUO_OUTRO_FROM,
  DUO_OUTRO_GAP,
  DUO_OUTRO_TRAVEL,
  DUO_ROUTE_PADDING,
  DUO_ROWS_BOX,
  DUO_ROW_HEIGHT,
  DUO_ROW_TOPS,
  DUO_TITLE_TOP,
} from "./duo";

const { fps, durationInFrames, width, height } = getTemplate("duo-replay");
// The template's own draw window, spelled the way the composition computes it.
const DRAW_FRAMES =
  Math.round(DUO_DRAW_TO * durationInFrames) -
  Math.round(DUO_DRAW_FROM * durationInFrames);

const pair = (name = "Marianne") =>
  duoRunners(
    FIXTURE_A.activity,
    FIXTURE_A.streams,
    "",
    asPartner(FIXTURE_A_PARTNER, name),
    "Ayoub",
  );

describe("the two runners", () => {
  it("draws both of them in the one house ink", () => {
    // The single-runner replay draws in cobalt; an athlete's own line looks the
    // same in both cuts, which is what stops the duo film reading as a
    // different app's. A second hue for the partner was what broke that, and the
    // job it was doing — saying which line is whose — is the names' now.
    expect(DUO_INK).toBe("#494fdf");
  });

  it("carries each of their names, which is who-is-who in this film", () => {
    const [you, partner] = pair();
    expect(you.name).toBe("Ayoub");
    expect(partner.name).toBe("Marianne");
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
  // The fixtures carry no pictures, so this is the dot's own berth plus the name
  // plate hanging under it — what the composition asks for on the same pair.
  const clearance = runnerLabelClearance(false);
  const track = buildRoutesCameraTrack(
    runners.map((runner) => runner.points),
    (progress) => duoDrawnAt(runners, clock, progress),
    viewport,
    { clearance },
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
          x < safeBox.left + clearance - 1 ||
          x > safeBox.right - clearance + 1 ||
          y < safeBox.top + clearance - 1 ||
          y > safeBox.bottom - clearance + 1
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

  it.each([
    ["the plain dot", false],
    ["a face riding the head", true],
  ])("keeps each runner's name plate off the numbers, with %s", (_, avatar) => {
    // The name is what says which line is whose, so a plate rides each head on
    // every frame of the draw. The athlete's hangs above their marker and their
    // partner's below — level runners would otherwise cover each other — and the
    // band under the map is where the two rows of numbers are. Either side has
    // to stay clear of both: a name on top of the numbers it points at is worse
    // than no name.
    const berth = runnerLabelClearance(avatar);
    const shot = buildRoutesCameraTrack(
      runners.map((runner) => runner.points),
      (progress) => duoDrawnAt(runners, clock, progress),
      viewport,
      { clearance: berth },
    );
    const reach = avatar ? RUNNER_AVATAR_SIZE / 2 : RUNNER_DOT_RADIUS;

    shot.forEach((camera, index) => {
      const drawn = duoDrawnAt(runners, clock, index / (shot.length - 1));
      runners.forEach((runner, r) => {
        if (drawn[r] < 1) return;
        const [x, y] = projectPoint(runner.points[drawn[r] - 1], camera, {
          width,
          height,
        });
        const under = y + reach + RUNNER_LABEL.gap;
        const over = y - reach - RUNNER_LABEL.gap - RUNNER_LABEL.height;
        expect(under + RUNNER_LABEL.height, runner.key).toBeLessThanOrEqual(
          DUO_ROW_TOPS[0],
        );
        // The upper plate has the title band above it, which the map's own
        // padding already holds it clear of.
        expect(over, runner.key).toBeGreaterThanOrEqual(SAFE_TOP);
        // And the widest a name is allowed to get still lands on the frame:
        // the plate is centred on the head, so half of it is the reach.
        expect(
          x - RUNNER_LABEL.maxWidth / 2,
          runner.key,
        ).toBeGreaterThanOrEqual(0);
        expect(x + RUNNER_LABEL.maxWidth / 2, runner.key).toBeLessThanOrEqual(
          width,
        );
      });
    });
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

describe("the closing card", () => {
  it("keeps the whole card inside the story's safe area", () => {
    // The frame the film is paused on, and the one somebody screenshots. A
    // number under the reply bar is a number nobody reads.
    expect(withinSafeArea(DUO_OUTRO_BOX)).toBe(true);
  });

  it("gives the two columns the same gutter the rows had", () => {
    const [left, right] = DUO_OUTRO_COLUMN_LEFT;
    expect(left).toBe(PAGE_INSET);
    expect(right - (left + DUO_OUTRO_COLUMN_WIDTH)).toBe(DUO_OUTRO_GAP);
    // The two columns and the gap between them fill the measure exactly, so the
    // card reads against the same left and right edges as the replay did.
    expect(right + DUO_OUTRO_COLUMN_WIDTH).toBe(width - left);
  });

  it("is over and held before the film ends", () => {
    // A move still running on the last frame is a film that ends mid-gesture.
    expect(DUO_OUTRO_FROM + DUO_OUTRO_TRAVEL).toBeLessThan(0.9);
    // …and it starts after the draw has finished, not over the top of it.
    expect(DUO_OUTRO_FROM).toBeGreaterThan(DUO_DRAW_TO);
  });

  it("leaves the replay untouched until its own window", () => {
    for (const t of [0, 0.4, DUO_DRAW_TO, DUO_OUTRO_FROM]) {
      const plan = duoOutro(t);
      // Not `toBe(0)`: the easings are polynomials, and one of them lands a
      // rounding error either side of zero at exactly this frame.
      for (const [part, value] of Object.entries({
        move: plan.move,
        veil: plan.veil,
        rowsOut: plan.rowsOut,
        ...Object.fromEntries(plan.cardIn.map((v, i) => [`cardIn${i}`, v])),
        ...Object.fromEntries(plan.avatarIn.map((v, i) => [`avatarIn${i}`, v])),
      })) {
        expect(value, `${part} at ${t}`).toBeCloseTo(0, 9);
      }
    }
  });

  it("has every part of the move landed by the final frame", () => {
    const plan = duoOutro(1);
    expect(plan.move).toBe(1);
    expect(plan.veil).toBe(1);
    expect(plan.rowsOut).toBe(1);
    expect(plan.cardIn).toEqual([1, 1]);
    // The faces overshoot on their way in and settle back onto 1.
    expect(plan.avatarIn).toEqual([1, 1]);
  });

  it("moves every part exactly once, and only forwards", () => {
    // Anything that goes back on itself reads as a stutter, and this is the one
    // gesture in the film with four things moving at the same time.
    let previous = duoOutro(0);
    for (let i = 1; i <= 200; i += 1) {
      const plan = duoOutro(i / 200);
      expect(plan.move).toBeGreaterThanOrEqual(previous.move);
      expect(plan.veil).toBeGreaterThanOrEqual(previous.veil);
      expect(plan.rowsOut).toBeGreaterThanOrEqual(previous.rowsOut);
      expect(plan.cardIn[0]).toBeGreaterThanOrEqual(previous.cardIn[0]);
      expect(plan.cardIn[1]).toBeGreaterThanOrEqual(previous.cardIn[1]);
      previous = plan;
    }
  });

  it("empties the running row of numbers before the card's land on it", () => {
    // The same three numbers dissolving through themselves at two sizes is the
    // one way this move could read as a mistake. The plate underneath arrives
    // whenever it likes — it is empty — but a number in it may not.
    const at = (share: number) =>
      duoOutro(DUO_OUTRO_FROM + DUO_OUTRO_TRAVEL * share);
    expect(at(0.32 + 1e-4).rowsOut).toBe(1);
    for (let card = 0; card < 2; card += 1) {
      for (let order = 0; order < 3; order += 1) {
        expect(duoOutroMetric(at(0.32), card, order)).toBeCloseTo(0, 9);
      }
    }
    // …and the empty plate is up in time to catch the fill travelling to it.
    expect(at(0.32).cardIn[0]).toBeGreaterThan(0.5);
  });

  it("walks each name from its row to the head of its own column", () => {
    [0, 1].forEach((index) => {
      const start = duoHeadlineBox(index, 0);
      const end = duoHeadlineBox(index, 1);
      // Both rows start on the same full-width measure…
      expect(start.left).toBe(duoHeadlineBox(0, 0).left);
      expect(start.top).toBe(DUO_ROW_TOPS[index]);
      // …and end over their own column, level with each other.
      expect(end.left).toBe(DUO_OUTRO_COLUMN_LEFT[index]);
      expect(width - end.right - end.left).toBe(DUO_OUTRO_COLUMN_WIDTH);
      expect(end.top).toBe(duoHeadlineBox(0, 1).top);
    });
  });

  it("splits the two fills apart into the feet of the two cards", () => {
    const [you, partner] = [duoFillBox(0, 1), duoFillBox(1, 1)];
    // One leaves left and one leaves right — the rearrangement said in one
    // element — and both land on the floor of their own plate.
    expect(you.left).toBeLessThan(partner.left);
    expect(you.top).toBe(partner.top);
    expect(you.top + DUO_BAR_HEIGHT).toBeLessThan(
      DUO_OUTRO_CARD_TOP + DUO_OUTRO_CARD_HEIGHT,
    );
    // Where they started: the foot of their row, on the full measure.
    expect(duoFillBox(0, 0).top).toBe(
      DUO_ROW_TOPS[0] + DUO_ROW_HEIGHT - DUO_BAR_HEIGHT,
    );
    expect(duoFillBox(0, 0).left).toBe(duoFillBox(1, 0).left);
  });

  it("keeps the title band clear of the mark it moves under", () => {
    expect(DUO_OUTRO_BOX.top).toBe(DUO_TITLE_TOP);
  });

  it("still keeps a running name out of its own numbers", () => {
    // The name travels, so it sits on its own layer and nothing pushes it any
    // more. It is handed the room the numbers need instead, and a name too long
    // for what is left has to be the thing that gives.
    const runners = pair();
    const [you] = duoFrame(runners, duoClock(runners), 1, fps, DRAW_FRAMES);
    const numbers = duoNumbersWidth(you.live);
    expect(numbers).toBeGreaterThan(400);

    const box = duoHeadlineBox(0, 0, numbers);
    expect(width - box.right).toBeLessThanOrEqual(width - PAGE_INSET - numbers);
    // …and the room is given back on the way to the card, where the numbers
    // are underneath rather than beside.
    expect(duoHeadlineBox(0, 1, numbers).right).toBe(
      duoHeadlineBox(0, 1, 0).right,
    );
  });
});
