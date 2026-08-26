import { describe, expect, it } from "vitest";
import { estimateDurationInFrames } from "../../duration";
import { templateEligibility } from "../../eligibility";
import {
  FIXTURE_A,
  FIXTURE_B,
  FIXTURE_C,
  FIXTURE_E,
  FIXTURE_F,
  FIXTURE_K,
} from "../../fixtures";
import { SAFE_TOP, withinSafeArea } from "../../core/layout";
import type { VideoActivity, VideoStreams } from "../../types";
import {
  beatSeconds,
  clampBpm,
  CONTENT_BOTTOM,
  DEFAULT_PULSE,
  getPulseMode,
  hasHeartRate,
  heartbeatBoxes,
  heartbeatPlan,
  heartbeatSeconds,
  heartSeries,
  PULSE_MODES,
  pulseReading,
  runProgress,
  traceHead,
  tracePath,
  tracePoints,
  TRACE_POINTS,
} from "./pulse";

const FPS = 30;

const plan = (
  fixture: { activity: VideoActivity; streams: VideoStreams },
  mode = DEFAULT_PULSE,
  seconds = 11,
) =>
  heartbeatPlan(
    fixture.activity,
    fixture.streams,
    FPS,
    Math.round(seconds * FPS),
    mode,
  );

describe("the pulse option", () => {
  it("falls back rather than throwing on a value from a stored row", () => {
    expect(getPulseMode("peak")).toBe("peak");
    expect(getPulseMode("bpm")).toBe(DEFAULT_PULSE);
    expect(getPulseMode(null)).toBe(DEFAULT_PULSE);
    // A row written while `live` still existed reads back as the default rather
    // than rendering a film nothing can cut.
    expect(getPulseMode("live")).toBe(DEFAULT_PULSE);
  });

  it("offers only tempos that are constant", () => {
    // The removed third mode, `live`, followed the curve — so it played a real
    // interval at every instant while marching through the run two hundred
    // times faster than the athlete did. Every mode left holds one rate, which
    // is the only way "this is what my heart sounded like" is true.
    expect([...PULSE_MODES]).toEqual(["average", "peak"]);
    expect(PULSE_MODES).toContain(DEFAULT_PULSE);
    expect(DEFAULT_PULSE).toBe("average");
  });
});

describe("heart rate", () => {
  it("is present when the watch recorded any of it", () => {
    expect(hasHeartRate(FIXTURE_A.activity, FIXTURE_A.streams)).toBe(true);
    // A treadmill run without a strap, and a run carrying nothing but totals.
    expect(hasHeartRate(FIXTURE_B.activity, FIXTURE_B.streams)).toBe(false);
    expect(hasHeartRate(FIXTURE_K.activity, FIXTURE_K.streams)).toBe(false);
  });

  it("is enough on its own, without a stream", () => {
    // A manual upload can carry an average and no curve. There is nothing to
    // draw, but there is something to beat at — which is the whole template.
    const activity = { ...FIXTURE_K.activity, average_heartrate: 148 };
    expect(hasHeartRate(activity, {})).toBe(true);
    expect(
      templateEligibility("heartbeat", { activity, streams: {} }).eligible,
    ).toBe(true);
    expect(heartSeries(activity, {}).charted).toBe(false);
  });

  it("turns a run with none away with a reason", () => {
    const verdict = templateEligibility("heartbeat", FIXTURE_B);
    expect(verdict.eligible).toBe(false);
    expect(verdict.reasonKey).toBe("needs-heart-rate");
  });

  it("throws out the zeroes a strap writes when it loses contact", () => {
    const activity = { ...FIXTURE_K.activity, average_heartrate: 150 };
    const series = heartSeries(activity, {
      heartrate: { data: [0, 0, 148, 152, 0, 156, 150] },
    });
    // A zero is not a slow heart, and averaging it in would drag the whole
    // curve — and with it the tempo — toward a rate nobody ran at.
    expect(series.min).toBeGreaterThanOrEqual(140);
  });

  it("keeps the peak the watch recorded, not the smoothed one", () => {
    const data = Array.from({ length: 600 }, (_, i) => (i === 300 ? 191 : 140));
    const series = heartSeries(
      { ...FIXTURE_K.activity, average_heartrate: 141, max_heartrate: 191 },
      { heartrate: { data } },
    );
    // Smoothing would flatten a one-second spike into nothing, and then the
    // marker would float above the line it is labelling.
    expect(series.max).toBe(191);
    expect(series.samples[series.peakIndex]).toBe(191);
  });

  it("never draws a rate the stream never reached", () => {
    // The needle bug, pinned. `max_heartrate` on the activity can be higher
    // than anything in the stream — an edited activity, a manual upload, a
    // synthetic fixture — and taking the higher of the two used to pin one
    // sample of the drawn curve to it. That renders as a single-sample spike
    // shooting out of an otherwise smooth trace, and stretches the vertical
    // range to a rate nothing in the curve reaches, squashing the whole line
    // into the bottom of its band.
    const data = Array.from({ length: 600 }, () => 150);
    const series = heartSeries(
      { ...FIXTURE_K.activity, average_heartrate: 150, max_heartrate: 199 },
      { heartrate: { data } },
    );
    expect(series.max).toBe(150);
    expect(Math.max(...series.samples)).toBe(150);

    // …and on a real run the drawn curve never goes above the peak it names,
    // nor below the trough that sets the bottom of its band.
    const real = heartSeries(FIXTURE_A.activity, FIXTURE_A.streams);
    expect(Math.max(...real.samples)).toBe(real.max);
    expect(Math.min(...real.samples)).toBeGreaterThanOrEqual(real.min);
  });

  it("still trusts the stated max when there is no curve at all", () => {
    // Nothing to contradict it, and it is the only peak the film can name.
    const series = heartSeries(
      { ...FIXTURE_K.activity, average_heartrate: 148, max_heartrate: 176 },
      {},
    );
    expect(series.charted).toBe(false);
    expect(series.max).toBe(176);
  });

  it("resamples onto a fixed number of points whatever the run's length", () => {
    for (const fixture of [FIXTURE_A, FIXTURE_C]) {
      const series = heartSeries(fixture.activity, fixture.streams);
      expect(series.samples.length).toBe(TRACE_POINTS);
      expect(series.charted).toBe(true);
    }
  });
});

describe("the tempo", () => {
  it("is the number on screen, rounded the same way", () => {
    // The promise the whole template makes: what you read is what you hear.
    // A tempo derived from an unrounded rate would drift from the printed one.
    const series = heartSeries(FIXTURE_A.activity, FIXTURE_A.streams);
    for (const mode of PULSE_MODES) {
      const { bpm } = pulseReading(series, mode);
      expect(Number.isInteger(bpm)).toBe(true);
      expect(beatSeconds(bpm)).toBeCloseTo(60 / bpm, 10);
    }
  });

  it("names the run's own two numbers, and nothing derived", () => {
    const series = heartSeries(FIXTURE_C.activity, FIXTURE_C.streams);
    expect(pulseReading(series, "average").bpm).toBe(series.average);
    expect(pulseReading(series, "peak").bpm).toBe(series.max);
  });

  it("still has a rate to beat at when the run carries only one number", () => {
    // No curve, so nothing to average over — but a film with no sound is not
    // what this template is for, and the one number it has is enough.
    const summary = { ...FIXTURE_K.activity, average_heartrate: 149 };
    const series = heartSeries(summary, {});
    expect(series.charted).toBe(false);
    expect(pulseReading(series, "average").bpm).toBe(149);
    expect(
      plan({ activity: summary, streams: {} }).pulses.length,
    ).toBeGreaterThan(10);
  });

  it("refuses a rate no heart has", () => {
    // The tempo is audio: a stream spike of 900 would turn the film into a buzz
    // and a dropout of 4 would stop it dead.
    expect(clampBpm(900)).toBe(220);
    expect(clampBpm(4)).toBe(40);
    expect(clampBpm(Number.NaN)).toBe(40);
  });

  it("lands a thud on the first frame and none past the last", () => {
    for (const mode of PULSE_MODES) {
      const built = plan(FIXTURE_A, mode);
      const frames = built.pulses.map((pulse) => pulse.frame);
      expect(frames[0]).toBe(0);
      expect(Math.max(...frames)).toBeLessThan(11 * FPS);
      // Unique, because each one is a React key and a doubled thud.
      expect(new Set(frames).size).toBe(frames.length);
      // Monotonic, because they are a timeline.
      expect([...frames].sort((a, b) => a - b)).toEqual(frames);
    }
  });

  it("spaces every thud evenly, because the tempo never moves", () => {
    const gaps = (mode: (typeof PULSE_MODES)[number]) => {
      const frames = plan(FIXTURE_C, mode).pulses.map((p) => p.frame);
      return frames.slice(1).map((frame, i) => frame - frames[i]);
    };
    // One tempo, one interval — give or take the frame it is rounded onto.
    expect(
      Math.max(...gaps("average")) - Math.min(...gaps("average")),
    ).toBeLessThanOrEqual(1);
    expect(
      Math.max(...gaps("peak")) - Math.min(...gaps("peak")),
    ).toBeLessThanOrEqual(1);
    // The peak is the fastest tempo there is, so it fits the most beats in.
    expect(plan(FIXTURE_C, "peak").pulses.length).toBeGreaterThan(
      plan(FIXTURE_C, "average").pulses.length,
    );
  });

  it("keeps each interval true to life rather than compressing it", () => {
    // The property the removed `live` mode broke. Ten seconds of film cover
    // twenty-five minutes of running, and the beat deliberately does *not*
    // follow that compression: a thud lands every 60/bpm seconds of real time,
    // which is what the athlete's own heart did.
    const series = heartSeries(FIXTURE_A.activity, FIXTURE_A.streams);
    for (const mode of PULSE_MODES) {
      const { bpm } = pulseReading(series, mode);
      const frames = plan(FIXTURE_A, mode).pulses.map((p) => p.frame);
      const gaps = frames.slice(1).map((frame, i) => (frame - frames[i]) / FPS);
      const mean = gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length;
      // The mean interval is the real one, to well inside a frame — which is
      // what says the error is bounded rather than accumulating.
      expect(mean).toBeCloseTo(60 / bpm, 2);
      // …and no single gap is more than one frame out, that being the most two
      // roundings can differ by.
      for (const gap of gaps) {
        expect(Math.abs(gap - 60 / bpm)).toBeLessThanOrEqual(1 / FPS);
      }
    }
  });

  it("keeps beating through the opening and the closing card", () => {
    // A template whose sound stopped for the first second and the last three
    // would be a chart with a jingle attached.
    const built = plan(FIXTURE_A);
    const open = built.beats.find((beat) => beat.id === "open")!;
    const hold = built.beats.find((beat) => beat.id === "hold")!;
    expect(built.pulses.some((p) => p.frame < open.to)).toBe(true);
    expect(built.pulses.some((p) => p.frame >= hold.from)).toBe(true);
  });
});

describe("the length", () => {
  it("is a whole number of the athlete's own heartbeats", () => {
    for (const fixture of [FIXTURE_A, FIXTURE_C]) {
      const series = heartSeries(fixture.activity, fixture.streams);
      const seconds = heartbeatSeconds(fixture.activity, fixture.streams);
      const beats = seconds / beatSeconds(series.average);
      expect(beats).toBeCloseTo(Math.round(beats), 6);
    }
  });

  it("gives a run whose heart rate travelled a longer film", () => {
    const steady = { ...FIXTURE_K.activity, average_heartrate: 150 };
    const flat = { heartrate: { data: Array<number>(600).fill(150) } };
    const intervals = {
      heartrate: {
        data: Array.from({ length: 600 }, (_, i) => (i % 120 < 60 ? 120 : 180)),
      },
    };
    expect(heartbeatSeconds(steady, intervals)).toBeGreaterThan(
      heartbeatSeconds(steady, flat),
    );
  });

  it("answers the same way twice, and stays inside a story segment", () => {
    const frames = estimateDurationInFrames("heartbeat", FIXTURE_A);
    expect(frames).toBe(estimateDurationInFrames("heartbeat", FIXTURE_A));
    expect(frames / FPS).toBeLessThanOrEqual(15);
    expect(frames).toBeGreaterThan(0);
  });

  it("fills whatever duration it is handed rather than ending on black", () => {
    for (const seconds of [7, 11, 15]) {
      const built = plan(FIXTURE_A, "average", seconds);
      const last = built.beats[built.beats.length - 1];
      expect(last.to).toBe(Math.round(seconds * FPS));
    }
  });
});

describe("the layout", () => {
  it("keeps every box in the band a story's own UI leaves alone", () => {
    for (const charted of [true, false]) {
      const boxes = heartbeatBoxes(charted);
      for (const box of [boxes.header, boxes.numeral, boxes.stats]) {
        expect(withinSafeArea(box)).toBe(true);
      }
      if (boxes.trace) expect(withinSafeArea(boxes.trace)).toBe(true);
      if (boxes.axis) expect(withinSafeArea(boxes.axis)).toBe(true);
      // …and clear of the lockup, which every template signs the frame with.
      expect(boxes.stats.top + boxes.stats.height).toBeLessThanOrEqual(
        CONTENT_BOTTOM,
      );
      expect(boxes.header.top).toBeGreaterThanOrEqual(SAFE_TOP);
    }
  });

  it("gives the numeral the trace's band when there is no trace to draw", () => {
    // Not an empty chart: a run with one heart rate in it gets a title card.
    const withCurve = heartbeatBoxes(true);
    const without = heartbeatBoxes(false);
    expect(without.trace).toBeNull();
    // …and no axis under it either: a scale with no curve over it is a row of
    // numbers with nothing to measure.
    expect(without.axis).toBeNull();
    expect(without.numeral.height).toBeGreaterThan(withCurve.numeral.height);
  });

  it("hangs the scale off the curve's floor, clear of the closing row", () => {
    const boxes = heartbeatBoxes(true);
    const trace = boxes.trace!;
    const axis = boxes.axis!;
    expect(axis.top).toBeGreaterThan(trace.top + trace.height);
    expect(axis.top + axis.height).toBeLessThanOrEqual(boxes.stats.top);
    expect(axis.left).toBe(trace.left);
    expect(axis.width).toBe(trace.width);
  });

  it("draws the curve inside its own box", () => {
    const built = plan(FIXTURE_C);
    const box = built.boxes.trace!;
    for (const point of built.points) {
      expect(point.x).toBeGreaterThanOrEqual(box.left);
      expect(point.x).toBeLessThanOrEqual(box.left + box.width);
      expect(point.y).toBeGreaterThanOrEqual(box.top);
      expect(point.y).toBeLessThanOrEqual(box.top + box.height);
    }
  });

  it("keeps a flat heart rate off the edges of its band", () => {
    const series = heartSeries(
      { ...FIXTURE_K.activity, average_heartrate: 150 },
      { heartrate: { data: Array<number>(400).fill(150) } },
    );
    const box = { top: 900, left: 80, width: 920, height: 320 };
    const ys = tracePoints(series, box).map((point) => point.y);
    // A line riding the top or the bottom of its box reads as clipped.
    expect(Math.min(...ys)).toBeGreaterThan(box.top + 10);
    expect(Math.max(...ys)).toBeLessThan(box.top + box.height - 10);
  });
});

describe("the trace", () => {
  const points = [
    { x: 0, y: 0 },
    { x: 100, y: 100 },
    { x: 200, y: 0 },
  ];

  it("travels smoothly rather than snapping between vertices", () => {
    // The dot is the leading edge of a line being drawn; a dot that hopped from
    // point to point would give away that the curve is a polyline.
    expect(traceHead(points, 0)).toEqual({ x: 0, y: 0 });
    expect(traceHead(points, 0.25)).toEqual({ x: 50, y: 50 });
    expect(traceHead(points, 1)).toEqual({ x: 200, y: 0 });
  });

  it("draws exactly as far as it has got", () => {
    expect(tracePath(points, 0)).toBe("M0.00 0.00 L0.00 0.00");
    expect(tracePath(points, 0.5)).toBe(
      "M0.00 0.00 L100.00 100.00 L100.00 100.00",
    );
    expect(tracePath(points, 1)).toContain("L200.00 0.00");
  });

  it("has nothing to say about a curve of one point", () => {
    expect(tracePath([{ x: 1, y: 2 }], 1)).toBe("");
    expect(tracePath([], 1)).toBe("");
    expect(traceHead([], 0.5)).toEqual({ x: 0, y: 0 });
  });
});

describe("the distance scale", () => {
  /** A run at one pace with a clean strap, so a test can say where a kilometre
   *  ought to land without deriving it from the fixture's own shape. */
  const steady = (meters: number, samples = 400) => ({
    activity: {
      ...FIXTURE_K.activity,
      distance: meters,
      average_heartrate: 150,
    },
    streams: {
      heartrate: { data: Array<number>(samples).fill(150) },
      distance: {
        data: Array.from(
          { length: samples },
          (_, i) => (meters * i) / (samples - 1),
        ),
      },
    },
  });

  it("names whole kilometres, and says the unit once", () => {
    // Where the eye starts, and nowhere after it: "1 km, 2, 3, 4, 5" is a
    // distance, and a "km" on every mark is the same word five times.
    expect(plan(FIXTURE_A).ticks.map((tick) => tick.label)).toEqual([
      "1 km",
      "2",
      "3",
      "4",
      "5",
    ]);
  });

  it("counts in tens on a marathon rather than printing forty-two numbers", () => {
    expect(plan(FIXTURE_C).ticks.map((tick) => tick.meters)).toEqual([
      10_000, 20_000, 30_000, 40_000,
    ]);
  });

  it("puts a mark where the athlete reached it, not on an even ruler", () => {
    // Eight hundred metres in the first half of the run and three thousand two
    // hundred in the second — the spacing *is* the reading, and a ruler would
    // print the same five numbers for both halves.
    const samples = 400;
    const built = plan({
      activity: {
        ...FIXTURE_K.activity,
        distance: 4000,
        average_heartrate: 150,
      },
      streams: {
        heartrate: { data: Array<number>(samples).fill(150) },
        distance: {
          data: Array.from({ length: samples }, (_, i) =>
            i < samples / 2
              ? (800 * i) / (samples / 2)
              : 800 + (3200 * (i - samples / 2)) / (samples / 2 - 1),
          ),
        },
      },
    });
    expect(built.ticks[0].meters).toBe(1000);
    // An even ruler would put the first kilometre a quarter of the way along.
    expect(built.ticks[0].progress).toBeGreaterThan(0.5);
    // …and the three kilometres after it crowd into what's left of the band,
    // which is what a run that finished hard looks like.
    expect(built.ticks[1].progress - built.ticks[0].progress).toBeLessThan(
      built.ticks[0].progress,
    );
  });

  it("re-aligns with the distance stream across a strap's dropouts", () => {
    // The first quarter of the stream is zeroes, so the curve is drawn from the
    // last three quarters — which begin a kilometre into the run. Reading the
    // distance stream by position in the *filtered* array instead of by the
    // sample each point came from would name that kilometre a third of the way
    // along a curve that opens on it.
    const samples = 400;
    const built = plan({
      activity: {
        ...FIXTURE_K.activity,
        distance: 4000,
        average_heartrate: 150,
      },
      streams: {
        heartrate: {
          data: Array.from({ length: samples }, (_, i) =>
            i < samples / 4 ? 0 : 150,
          ),
        },
        distance: {
          data: Array.from(
            { length: samples },
            (_, i) => (4000 * i) / (samples - 1),
          ),
        },
      },
    });
    expect(built.ticks[0].meters).toBe(1000);
    expect(built.ticks[0].progress).toBeLessThan(0.02);
    expect(built.ticks[built.ticks.length - 1].meters).toBe(4000);
  });

  it("draws every mark inside the band it labels", () => {
    for (const fixture of [FIXTURE_A, FIXTURE_C, FIXTURE_E, FIXTURE_F]) {
      const built = plan(fixture);
      const box = built.boxes.trace!;
      expect(built.ticks.length).toBeGreaterThan(0);
      for (const tick of built.ticks) {
        expect(tick.x).toBeGreaterThanOrEqual(box.left);
        expect(tick.x).toBeLessThanOrEqual(box.left + box.width);
        expect(tick.progress).toBeGreaterThanOrEqual(0);
        expect(tick.progress).toBeLessThanOrEqual(1);
      }
      // Never so many that they touch, and never in the wrong order.
      expect(built.ticks.length).toBeLessThanOrEqual(6);
      for (let i = 1; i < built.ticks.length; i += 1) {
        expect(built.ticks[i].x - built.ticks[i - 1].x).toBeGreaterThanOrEqual(
          130,
        );
      }
    }
  });

  it("spreads a treadmill's kilometres evenly, because that is what it ran", () => {
    // No distance stream at all — the run is laid out at its own average pace,
    // the same fallback the replay's overlay makes.
    const built = plan({
      activity: {
        ...FIXTURE_K.activity,
        distance: 5000,
        average_heartrate: 150,
      },
      streams: { heartrate: { data: Array<number>(400).fill(150) } },
    });
    expect(built.ticks).toHaveLength(5);
    expect(built.ticks[0].progress).toBeCloseTo(0.2, 2);
    expect(built.ticks[4].progress).toBeCloseTo(1, 2);
  });

  it("says nothing when there is nothing to name", () => {
    // A run with no distance on it, a run shorter than the smallest step, and
    // the summary-only upload that has no curve to hang a scale under.
    expect(plan({ ...steady(0) }).ticks).toEqual([]);
    expect(plan({ ...steady(600) }).ticks).toEqual([]);
    expect(
      plan({
        activity: { ...FIXTURE_K.activity, average_heartrate: 150 },
        streams: {},
      }).ticks,
    ).toEqual([]);
  });
});

describe("the plan", () => {
  it("reads the number, the point and the thud off one progress", () => {
    const built = plan(FIXTURE_A);
    const trace = built.beats.find((beat) => beat.id === "trace")!;
    // Nothing has happened to the run before the curve starts drawing, and
    // nothing more after it stops — the opening and the hold sit at the ends.
    expect(runProgress(built, 0)).toBe(0);
    expect(runProgress(built, trace.from)).toBe(0);
    expect(runProgress(built, trace.to)).toBe(1);
    expect(runProgress(built, 11 * FPS)).toBe(1);
    expect(
      runProgress(built, Math.round((trace.from + trace.to) / 2)),
    ).toBeCloseTo(0.5, 1);
  });

  it("never prints the headline twice", () => {
    // A closing row that repeats the number above it is the template admitting
    // it wanted three cells.
    for (const mode of PULSE_MODES) {
      const built = plan(FIXTURE_A, mode);
      const headline = pulseReading(built.series, mode);
      expect(built.headline).toEqual(headline);
      expect(built.stats.map((tile) => tile.label)).not.toContain(
        headline.label,
      );
      expect(built.stats).toHaveLength(3);
    }
  });

  it("leads with whichever number was asked for", () => {
    const series = heartSeries(FIXTURE_A.activity, FIXTURE_A.streams);
    expect(plan(FIXTURE_A, "peak").headline.bpm).toBe(series.max);
    expect(plan(FIXTURE_A, "average").headline.bpm).toBe(series.average);
  });

  it("prints the number it is beating at, and not a second one", () => {
    // The template's whole claim. A numeral that tracked the curve while the
    // tempo held would put a rate on screen that the athlete is not hearing.
    for (const mode of PULSE_MODES) {
      const built = plan(FIXTURE_A, mode);
      for (const pulse of built.pulses) {
        expect(pulse.bpm).toBe(built.headline.bpm);
      }
    }
  });
});
