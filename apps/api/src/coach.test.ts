import { describe, expect, it } from "vitest";
import { APICallError, RetryError } from "ai";
import {
  clock,
  decodePolyline,
  decoupling,
  easyIntensity,
  loadRatio,
  pace,
  planProgress,
  predictRaces,
  routePath,
  toSplits,
  weeklyVolume,
  weekStart,
} from "./training.js";
import { toQueue, toSignals, weeksToRace } from "./briefing.js";
import {
  buildQuestionnaire,
  coachFailure,
  coachSystemPrompt,
  dropUnannouncedToolInput,
  mondayFirst,
  type QuestionnaireCard,
} from "./coach.js";
import { titleFrom } from "./chat-store.js";
import type { BestEffort } from "./strava.js";
import type { Run, RunStreams } from "./schemas.js";

/** A run on `date`, with everything the analysis reads and nothing else. */
function run(date: string, km: number, over: Partial<Run> = {}): Run {
  const moving_time = over.moving_time ?? Math.round(km * 300);
  return {
    id: Number(date.replaceAll("-", "")) + Math.round(km * 10),
    name: "Run",
    distance: km * 1000,
    moving_time,
    total_elevation_gain: 0,
    sport_type: "Run",
    start_date_local: `${date}T07:00:00Z`,
    average_speed: (km * 1000) / moving_time,
    average_heartrate: null,
    max_heartrate: null,
    workout_type: "default",
    ...over,
  };
}

/** A steady run: `metres` per sample at a constant `secondsPerKm`. */
function steadyStreams(
  totalMetres: number,
  secondsPerKm: number,
  heartrate?: number[],
): RunStreams {
  const step = 100;
  const distance: number[] = [];
  const time: number[] = [];
  for (let metres = 0; metres <= totalMetres; metres += step) {
    distance.push(metres);
    time.push((metres / 1000) * secondsPerKm);
  }
  return {
    distance: { data: distance },
    time: { data: time },
    ...(heartrate ? { heartrate: { data: heartrate } } : {}),
  };
}

describe("pace", () => {
  it("formats seconds per kilometre as m:ss", () => {
    expect(pace(333)).toBe("5:33");
    expect(pace(360)).toBe("6:00");
    expect(pace(365.4)).toBe("6:05");
  });

  it("carries a rounded 60 into the next minute", () => {
    expect(pace(359.7)).toBe("6:00");
  });

  it("has nothing to say about a run with no speed", () => {
    expect(pace(null)).toBeNull();
    expect(pace(0)).toBeNull();
    expect(pace(Number.POSITIVE_INFINITY)).toBeNull();
  });
});

describe("clock", () => {
  it("drops the hour until there is one", () => {
    expect(clock(1724)).toBe("28:44");
    expect(clock(5053)).toBe("1:24:13");
    expect(clock(59)).toBe("0:59");
  });
});

describe("weekStart", () => {
  it("snaps to the Monday of the ISO week", () => {
    // 2026-08-12 is a Wednesday.
    expect(weekStart("2026-08-12")).toBe("2026-08-10");
    expect(weekStart("2026-08-10")).toBe("2026-08-10");
  });

  it("keeps Sunday in the week that started six days earlier", () => {
    expect(weekStart("2026-08-16")).toBe("2026-08-10");
  });
});

describe("toSplits", () => {
  it("cuts a steady run into even kilometres", () => {
    const splits = toSplits(steadyStreams(5000, 300));
    expect(splits).toHaveLength(5);
    expect(splits.map((split) => split.pace_per_km)).toEqual([
      "5:00",
      "5:00",
      "5:00",
      "5:00",
      "5:00",
    ]);
    expect(splits.every((split) => split.partial_km === undefined)).toBe(true);
  });

  it("reports the trailing part kilometre as a partial", () => {
    const splits = toSplits(steadyStreams(5400, 300));
    expect(splits).toHaveLength(6);
    expect(splits.at(-1)).toMatchObject({ km: 6, partial_km: 0.4 });
  });

  it("ignores a sliver of GPS overshoot", () => {
    // 40 m past the last whole kilometre is noise, not a split.
    expect(toSplits(steadyStreams(5040, 300))).toHaveLength(5);
  });

  it("averages heart rate within each split", () => {
    const streams = steadyStreams(2000, 300);
    const samples = streams.distance?.data.length ?? 0;
    // 150 bpm for the first kilometre, 170 for the second.
    const heartrate = Array.from({ length: samples }, (_, i) =>
      i <= 10 ? 150 : 170,
    );
    const splits = toSplits({ ...streams, heartrate: { data: heartrate } });
    expect(splits.map((split) => split.avg_heartrate)).toEqual([150, 170]);
  });

  it("has no splits for a run recorded without streams", () => {
    expect(toSplits({})).toEqual([]);
    expect(toSplits({ distance: { data: [] }, time: { data: [] } })).toEqual(
      [],
    );
  });
});

describe("routePath", () => {
  // Google's own worked example from the encoded-polyline spec.
  const SPEC_EXAMPLE = "_p~iF~ps|U_ulLnnqC_mqNvxq`@";

  it("decodes an encoded polyline", () => {
    expect(decodePolyline(SPEC_EXAMPLE)).toEqual([
      [38.5, -120.2],
      [40.7, -120.95],
      [43.252, -126.453],
    ]);
  });

  it("fits the route inside the viewBox with north up", () => {
    const path = routePath(SPEC_EXAMPLE, 100, 6);
    const points = path!
      .split(/[ML]/)
      .filter(Boolean)
      .map((pair) => pair.trim().split(" ").map(Number));

    expect(points).toHaveLength(3);
    for (const [x, y] of points) {
      expect(x).toBeGreaterThanOrEqual(6);
      expect(x).toBeLessThanOrEqual(94);
      expect(y).toBeGreaterThanOrEqual(6);
      expect(y).toBeLessThanOrEqual(94);
    }
    // The northernmost point (43.252) must sit above the southernmost (38.5).
    expect(points[2][1]).toBeLessThan(points[0][1]);
  });

  it("has no path for a treadmill run", () => {
    expect(routePath(null)).toBeNull();
    expect(routePath("")).toBeNull();
  });
});

describe("weeklyVolume", () => {
  it("reports the ramp against the week before", () => {
    const weeks = weeklyVolume(
      [run("2026-08-10", 10), run("2026-08-12", 5), run("2026-08-05", 10)],
      2,
      "2026-08-13",
    );
    expect(weeks).toMatchObject([
      { week_starting: "2026-08-10", runs: 2, km: 15, ramp_pct: 50 },
      { week_starting: "2026-08-03", runs: 1, km: 10, ramp_pct: null },
    ]);
  });

  it("keeps a week off as a zero rather than closing the gap over it", () => {
    const weeks = weeklyVolume([run("2026-08-10", 10)], 3, "2026-08-13");
    expect(weeks.map((week) => week.km)).toEqual([10, 0, 0]);
    // Nothing to ramp from, rather than a division by zero.
    expect(weeks[0].ramp_pct).toBeNull();
  });
});

describe("loadRatio", () => {
  /** One run a day for `days` days, ending on 2026-08-13. */
  const daily = (days: number, km: number, endingDaysAgo = 0): Run[] =>
    Array.from({ length: days }, (_, i) => {
      const day = new Date("2026-08-13T00:00:00Z");
      day.setUTCDate(day.getUTCDate() - (i + endingDaysAgo));
      return run(day.toISOString().slice(0, 10), km);
    });

  it("sits at 1 when this week matches the four-week average", () => {
    expect(loadRatio(daily(28, 5), "2026-08-13")).toEqual({
      acute_km: 35,
      chronic_km: 35,
      ratio: 1,
    });
  });

  it("climbs out of the safe band when the week spikes", () => {
    const ratio = loadRatio(
      [...daily(7, 10), ...daily(21, 5, 7)],
      "2026-08-13",
    );
    expect(ratio?.acute_km).toBe(70);
    expect(ratio?.ratio).toBeGreaterThan(1.3);
  });

  it("says nothing until there are four weeks to average", () => {
    expect(loadRatio(daily(14, 5), "2026-08-13")).toBeNull();
    expect(loadRatio([], "2026-08-13")).toBeNull();
  });
});

describe("easyIntensity", () => {
  const runs: Run[] = [
    run("2026-08-01", 10, { average_heartrate: 140, max_heartrate: 190 }),
    run("2026-08-03", 10, { average_heartrate: 150, max_heartrate: 175 }),
    run("2026-08-05", 10, { average_heartrate: 160, max_heartrate: 180 }),
    // Tagged as a workout in Strava: supposed to be hard, so not evidence.
    run("2026-08-07", 10, {
      average_heartrate: 178,
      max_heartrate: 188,
      workout_type: "workout",
    }),
  ];

  it("measures easy runs against 77% of the highest heart rate seen", () => {
    expect(easyIntensity(runs)).toMatchObject({
      hr_max: 190,
      zone3_floor: 146,
      easy_runs: 3,
      hard_easy_runs: 2,
    });
  });

  it("has nothing to say without a heart-rate monitor", () => {
    expect(easyIntensity([run("2026-08-01", 10)])).toBeNull();
  });
});

describe("decoupling", () => {
  /** 40 minutes at a constant 3 m/s, with heart rate supplied per minute. */
  const fortyMinutes = (heartrate: number[]): RunStreams => ({
    time: { data: heartrate.map((_, i) => i * 60) },
    distance: { data: heartrate.map((_, i) => i * 180) },
    heartrate: { data: heartrate },
  });

  it("is flat when the same pace costs the same heart rate throughout", () => {
    expect(decoupling(fortyMinutes(Array(41).fill(150)))).toBe(0);
  });

  it("is positive when the second half costs more heart rate", () => {
    const drift = Array.from({ length: 41 }, (_, i) => (i <= 20 ? 150 : 165));
    const drifted = decoupling(fortyMinutes(drift));
    expect(drifted).toBeGreaterThan(8);
    expect(drifted).toBeLessThan(10);
  });

  it("needs a run long enough to drift", () => {
    expect(decoupling(fortyMinutes(Array(11).fill(150)))).toBeNull();
    expect(decoupling(steadyStreams(5000, 300))).toBeNull();
  });
});

describe("predictRaces", () => {
  const effort = (
    name: string,
    distance: number,
    seconds: number,
  ): BestEffort => ({
    name,
    distance,
    elapsed_time: seconds,
    pr_rank: 1,
    activity_id: 1,
    date: "2026-07-27",
  });

  it("predicts from the effort that gives the fastest equivalent", () => {
    const predictions = predictRaces([
      effort("5k", 5000, 1274),
      effort("10k", 10000, 2642),
    ]);
    expect(predictions.map((p) => p.name)).toEqual([
      "5K",
      "10K",
      "Half marathon",
    ]);
    // The 10k is the stronger run, so it sets the 10k and half predictions.
    expect(predictions[1]).toMatchObject({
      seconds: 2642,
      from: { name: "10k" },
    });
    expect(predictions[2].from.name).toBe("10k");
    expect(predictions[2].seconds).toBeGreaterThan(5700);
    expect(predictions[2].seconds).toBeLessThan(5950);
  });

  it("refuses to stretch a result more than four times its own distance", () => {
    const predictions = predictRaces([effort("5k", 5000, 1274)]);
    // A marathon off a 5k is eight times the distance, and a fantasy.
    expect(predictions.map((p) => p.name)).toEqual(["5K", "10K"]);
  });

  it("keeps the fastest effort at each distance", () => {
    const predictions = predictRaces([
      effort("5k", 5000, 1400),
      effort("5k", 5000, 1274),
    ]);
    expect(predictions[0].from.time).toBe("21:14");
  });

  it("has nothing to predict from a sprint", () => {
    expect(predictRaces([effort("400m", 400, 70)])).toEqual([]);
  });
});

describe("planProgress", () => {
  const week = [
    { day: 0, type: "Easy", km: 5, pace: "6:30 /km", key: false },
    { day: 1, type: "8 × 400", km: 9, pace: "4:35 /km", key: true },
    { day: 2, type: "Easy", km: 8, pace: "6:05 /km", key: false },
    { day: 3, type: "Rest", km: 0, pace: "legs up", key: false },
    { day: 4, type: "Easy", km: 6, pace: "6:05 /km", key: false },
    { day: 5, type: "Tempo", km: 10, pace: "5:15 /km", key: true },
    { day: 6, type: "Long", km: 18, pace: "6:00 /km", key: true },
  ];

  it("counts what was run against what was written, day by day", () => {
    const progress = planProgress(
      week,
      [run("2026-08-10", 5), run("2026-08-11", 9), run("2026-08-12", 6)],
      "2026-08-10",
      "2026-08-13",
    );
    expect(progress).toMatchObject({ planned_km: 56, actual_km: 20 });
    expect(progress.days[2]).toMatchObject({ planned_km: 8, actual_km: 6 });
    // Friday, Saturday and Sunday are still to come; Thursday was a rest day.
    expect(progress.remaining).toBe(3);
  });

  it("ignores runs from a neighbouring week", () => {
    const progress = planProgress(
      week,
      [run("2026-08-09", 20), run("2026-08-17", 20)],
      "2026-08-10",
      "2026-08-13",
    );
    expect(progress.actual_km).toBe(0);
  });
});

describe("toSignals", () => {
  const readout = {
    load: { acute_km: 70, chronic_km: 53.4, ratio: 1.31 },
    easy: {
      hr_max: 190,
      zone3_floor: 146,
      easy_runs: 12,
      hard_easy_runs: 5,
      share: 0.417,
    },
    drift: { percent: 6.2, run: run("2026-08-03", 15) },
    shoes: [{ name: "Vaporfly 3", km: 712 }],
    ramp_pct: 44,
  };

  it("reads every measurement it was given", () => {
    expect(
      toSignals(readout).map((signal) => [
        signal.id,
        signal.value,
        signal.tone,
      ]),
    ).toEqual([
      ["acwr", "1.31", "alert"],
      ["easy-intensity", "42%", "alert"],
      ["decoupling", "6.2%", "warn"],
      ["shoes", "712 km", "warn"],
    ]);
  });

  it("stays quiet about numbers inside their bands", () => {
    const calm = toSignals({
      ...readout,
      load: { acute_km: 48, chronic_km: 48, ratio: 1 },
      easy: { ...readout.easy, hard_easy_runs: 1, share: 0.083 },
      drift: { percent: 2.1, run: readout.drift.run },
      shoes: [],
    });
    expect(calm.every((signal) => signal.tone === "neutral")).toBe(true);
  });

  it("omits what it could not measure rather than showing a blank", () => {
    const bare = toSignals({
      load: null,
      easy: null,
      drift: null,
      shoes: [],
      ramp_pct: null,
    });
    expect(bare).toEqual([]);
  });
});

describe("toQueue", () => {
  const quiet = {
    load: { acute_km: 48, chronic_km: 48, ratio: 1 },
    easy: null,
    drift: null,
    shoes: [],
    ramp_pct: 2,
  };
  const noContext = {
    race_name: null,
    race_date: null,
    race_distance_m: null,
    target_seconds: null,
    long_run_day: null,
    notes: null,
    updated_at: null,
  };

  it("opens with the run that just landed", () => {
    const queue = toQueue(
      quiet,
      [run("2026-08-12", 8)],
      noContext,
      "2026-08-13",
    );
    expect(queue[0]).toMatchObject({
      id: "debrief",
      run_id: expect.any(Number),
    });
    expect(queue[0].when).toContain("YESTERDAY");
  });

  it("does not offer to debrief a run from a fortnight ago", () => {
    const queue = toQueue(
      quiet,
      [run("2026-07-28", 8)],
      noContext,
      "2026-08-13",
    );
    expect(queue.map((item) => item.id)).not.toContain("debrief");
  });

  it("raises a volume spike", () => {
    const queue = toQueue(
      {
        ...quiet,
        ramp_pct: 44,
        load: { acute_km: 70, chronic_km: 53, ratio: 1.32 },
      },
      [],
      noContext,
      "2026-08-13",
    );
    expect(queue.find((item) => item.id === "ramp")).toMatchObject({
      title: "Volume jumped 44% in one week",
      tone: "alert",
    });
  });

  it("asks for a goal race until there is one, then watches the taper", () => {
    expect(
      toQueue(quiet, [], noContext, "2026-08-13").map((item) => item.id),
    ).toContain("goal");

    const racing = toQueue(
      quiet,
      [],
      { ...noContext, race_name: "Casablanca Half", race_date: "2026-08-30" },
      "2026-08-13",
    );
    expect(racing.find((item) => item.id === "taper")).toMatchObject({
      title: "Casablanca Half in 3 weeks",
    });
  });
});

describe("weeksToRace", () => {
  const context = {
    race_name: "Casablanca Half",
    race_date: "2026-10-18",
    race_distance_m: 21097.5,
    target_seconds: 5880,
    long_run_day: 6,
    notes: null,
    updated_at: null,
  };

  it("rounds part weeks up, the way a training block counts them", () => {
    expect(weeksToRace(context, "2026-08-13")).toBe(10);
    expect(weeksToRace(context, "2026-10-18")).toBe(0);
  });

  it("has nothing to count once the race has been run", () => {
    expect(weeksToRace(context, "2026-10-19")).toBeNull();
    expect(
      weeksToRace({ ...context, race_date: null }, "2026-08-13"),
    ).toBeNull();
  });
});

describe("titleFrom", () => {
  it("names a thread after what was asked", () => {
    expect(
      titleFrom({
        id: "m1",
        role: "user",
        parts: [{ type: "text", text: "Half   marathon\nin October" }],
      }),
    ).toBe("Half marathon in October");
  });

  it("trims a long opener to fit the sidebar", () => {
    const title = titleFrom({
      id: "m1",
      role: "user",
      parts: [{ type: "text", text: "a".repeat(200) }],
    });
    expect(title).toHaveLength(61); // 60 characters plus the ellipsis
    expect(title?.endsWith("…")).toBe(true);
  });

  it("has no title for a message that is only an attachment", () => {
    expect(
      titleFrom({
        id: "m1",
        role: "user",
        parts: [
          {
            type: "file",
            mediaType: "image/png",
            url: "data:image/png;base64,x",
          },
        ],
      }),
    ).toBeNull();
  });
});

describe("buildQuestionnaire", () => {
  /** A choice question as the model would write one. */
  const pick = {
    question: "Which race are you training for?",
    kind: "single" as const,
    choices: [{ label: "5K" }, { label: "Half" }, { label: "Marathon" }],
  };

  it("names the fields itself, so two questions cannot collide", () => {
    const card = buildQuestionnaire(" Two things ", [
      pick,
      { question: "How many days a week?", kind: "number", unit: " days " },
    ]);

    expect(card).toMatchObject({
      card: "questionnaire",
      intro: "Two things",
      questions: [
        {
          id: "q1",
          choices: [
            { value: "c1", label: "5K" },
            { value: "c2", label: "Half" },
            { value: "c3", label: "Marathon" },
          ],
        },
        { id: "q2", unit: "days", choices: [] },
      ],
    });
  });

  it("drops a choice the athlete could not tell apart", () => {
    const card = buildQuestionnaire(null, [
      {
        ...pick,
        choices: [{ label: "Half" }, { label: "Half " }, { label: "5K" }],
      },
    ]);

    expect(card).toMatchObject({
      questions: [
        {
          choices: [
            { value: "c1", label: "Half" },
            { value: "c2", label: "5K" },
          ],
        },
      ],
    });
  });

  it("refuses a choice question that has nothing to choose between", () => {
    expect(
      buildQuestionnaire(null, [{ ...pick, choices: [{ label: "Half" }] }]),
    ).toMatchObject({ error: expect.stringContaining("Question 1") });
  });

  it("asks a whole week, which is the question the tool exists for", () => {
    // Seven weekdays used to be one choice over the cap, and the cap was on
    // the input schema — so the tool call never validated and the athlete's
    // turn died mid-answer instead of drawing the form.
    const card = buildQuestionnaire(null, [
      {
        question: "What days can you typically run this week?",
        kind: "multi",
        choices: [
          { label: "Monday" },
          { label: "Tuesday" },
          { label: "Wednesday" },
          { label: "Thursday" },
          { label: "Friday" },
          { label: "Saturday" },
          { label: "Sunday" },
        ],
      },
    ]);

    expect(card).not.toHaveProperty("error");
    expect((card as QuestionnaireCard).questions[0].choices).toHaveLength(7);
    expect(card).not.toHaveProperty("note");
  });

  it("trims what overflows instead of failing the turn", () => {
    const card = buildQuestionnaire(null, [
      { ...pick, choices: "12345678".split("").map((n) => ({ label: n })) },
      pick,
      pick,
      pick,
      pick,
      pick,
    ]) as QuestionnaireCard;

    expect(card.questions).toHaveLength(5);
    expect(card.questions[0].choices).toHaveLength(7);
    // The model is told what was cut — that is the sentence a rejected input
    // would have carried, delivered without killing the answer it was part of.
    expect(card.note).toContain("6 questions");
    expect(card.note).toContain("Question 1");
  });

  it("cuts writing to what the form can lay out", () => {
    const card = buildQuestionnaire("i".repeat(200), [
      {
        question: "q".repeat(200),
        hint: "h".repeat(200),
        kind: "single",
        choices: [{ label: "a".repeat(80) }, { label: "b" }],
      },
    ]) as QuestionnaireCard;

    expect(card.intro).toHaveLength(160);
    expect(card.questions[0].question).toHaveLength(140);
    expect(card.questions[0].hint).toHaveLength(160);
    expect(card.questions[0].choices[0].label).toHaveLength(60);
    expect(card.intro?.endsWith("…")).toBe(true);
  });

  it("reads two labels that differ past the cut as one option", () => {
    // Clamped first, then deduplicated: the athlete sees the same 60
    // characters twice, whatever the model wrote after them.
    const card = buildQuestionnaire(null, [
      {
        ...pick,
        choices: [
          { label: `${"a".repeat(60)} morning` },
          { label: `${"a".repeat(60)} evening` },
          { label: "Half" },
        ],
      },
    ]) as QuestionnaireCard;

    expect(card.questions[0].choices).toHaveLength(2);
  });

  it("drops a unit and a placeholder a choice question cannot use", () => {
    // The browser labels a choice question's free-text box itself, in the
    // athlete's language — the model's example answer has nowhere to go.
    const card = buildQuestionnaire(undefined, [
      { ...pick, unit: "km", placeholder: "e.g. 5K" },
    ]);

    expect(card).toMatchObject({
      intro: null,
      questions: [{ unit: null, placeholder: null }],
    });
  });

  it("leaves no question the athlete cannot get past", () => {
    const card = buildQuestionnaire(null, [pick, { ...pick, kind: "multi" }]);

    // No `required` anywhere in the shape: Skip is always a way on, which is
    // half of what lets the form stand where the composer does.
    for (const question of (card as { questions: object[] }).questions) {
      expect(question).not.toHaveProperty("required");
    }
  });
});

describe("mondayFirst", () => {
  /** A week the model wrote, as `day` numbers and nothing else. */
  function week(days: number[]) {
    return days.map((day) => ({ day, km: day }));
  }

  it("leaves a Monday-zero week alone, in order", () => {
    expect(mondayFirst(week([0, 1, 2, 3, 4, 5, 6])).map((s) => s.day)).toEqual([
      0, 1, 2, 3, 4, 5, 6,
    ]);
  });

  it("shifts the 1…7 week a model writes when asked for Monday first", () => {
    expect(mondayFirst(week([1, 2, 3, 4, 5, 6, 7])).map((s) => s.day)).toEqual([
      0, 1, 2, 3, 4, 5, 6,
    ]);
  });

  it("keeps each session's own values on the day it shifts", () => {
    expect(mondayFirst(week([7, 1])).map((s) => [s.day, s.km])).toEqual([
      [0, 1],
      [6, 7],
    ]);
  });

  it("sorts a week that arrived out of order", () => {
    expect(mondayFirst(week([6, 0, 3])).map((s) => s.day)).toEqual([0, 3, 6]);
  });

  it("moves only the 7 in a week that already counts from 0", () => {
    // Six days would move to fix one, and a 7 means Sunday under either
    // numbering — so it lands on Sunday and the rest are left where they are.
    expect(mondayFirst(week([0, 1, 2, 3, 4, 5, 7])).map((s) => s.day)).toEqual([
      0, 1, 2, 3, 4, 5, 6,
    ]);
  });

  it("never leaves 0…6, whatever the model counted in", () => {
    for (const days of [
      [0, 1, 2, 3, 4, 5, 6],
      [1, 2, 3, 4, 5, 6, 7],
      [0, 0, 7, 7],
      [7],
      [1],
    ]) {
      for (const session of mondayFirst(week(days))) {
        expect(session.day).toBeGreaterThanOrEqual(0);
        expect(session.day).toBeLessThanOrEqual(6);
      }
    }
  });
});

describe("coachSystemPrompt", () => {
  it("says nothing about language for an English athlete", () => {
    expect(coachSystemPrompt("2026-08-18", 6)).not.toContain(
      "askAthlete` draws",
    );
  });

  it("asks for the form in French, and for the prose in English", () => {
    const prompt = coachSystemPrompt("2026-08-18", 6, { language: "fr" });
    expect(prompt).toContain("reading the app in French");
    expect(prompt).toContain("Everything you write yourself stays in English");
  });
});

describe("coachFailure", () => {
  /** What the provider throws: a sentence written for the account holder. */
  function apiError(message: string, statusCode?: number): APICallError {
    return new APICallError({
      message,
      url: "https://api.llmgateway.io/v4/ai/language-model",
      requestBodyValues: {},
      statusCode,
    });
  }

  /** What the SDK throws once `maxRetries` is spent on that. */
  function afterRetries(last: Error): RetryError {
    return new RetryError({
      message: `Failed after 3 attempts. Last error: ${last.message}`,
      reason: "maxRetriesExceeded",
      errors: [last, last, last],
    });
  }

  const QUOTA =
    "You exceeded your current quota, please check your plan and billing " +
    "details at llmgateway.io/billing. Upstream quota exceeded for " +
    "deepseek/deepseek-v4-flash.";

  it("reads a spent quota through the retries wrapping it", () => {
    expect(coachFailure(afterRetries(apiError(QUOTA, 429)))).toBe(
      "rate_limited",
    );
  });

  it("reads a quota the provider did not answer 429 for", () => {
    expect(coachFailure(apiError(QUOTA, 400))).toBe("rate_limited");
  });

  it("calls an overloaded model unavailable", () => {
    expect(
      coachFailure(
        apiError("The model is overloaded. Please try again later.", 503),
      ),
    ).toBe("unavailable");
  });

  it("calls a request that never landed unavailable", () => {
    expect(coachFailure(apiError("fetch failed"))).toBe("unavailable");
  });

  it("falls back to failed for anything it cannot place", () => {
    expect(coachFailure(new Error("Cannot read properties of undefined"))).toBe(
      "failed",
    );
    expect(coachFailure("not an error at all")).toBe("failed");
  });

  it("never returns anything the provider wrote", () => {
    for (const error of [
      afterRetries(apiError(QUOTA, 429)),
      apiError("The model is overloaded. Please try again later.", 503),
      new Error("ECONNREFUSED 127.0.0.1:443"),
    ]) {
      expect([
        "not_configured",
        "rate_limited",
        "unavailable",
        "failed",
      ]).toContain(coachFailure(error));
    }
  });
});

describe("dropUnannouncedToolInput", () => {
  /** What the transform lets through, and what it told us about on the way. */
  async function through(parts: unknown[]) {
    const dropped: string[] = [];
    const transform = dropUnannouncedToolInput((id: string) => {
      dropped.push(id);
    })({ tools: {}, stopStream: () => {} });

    const written = (async () => {
      const writer = transform.writable.getWriter();
      for (const part of parts) await writer.write(part as never);
      await writer.close();
    })();

    const kept: unknown[] = [];
    for await (const part of transform.readable as unknown as AsyncIterable<unknown>) {
      kept.push(part);
    }
    await written;

    return { kept, dropped };
  }

  const START = { type: "tool-input-start", id: "call-1", toolName: "getRuns" };
  const DELTA = { type: "tool-input-delta", id: "call-1", delta: '{"weeks' };
  const CALL = {
    type: "tool-call",
    toolCallId: "call-1",
    toolName: "getRuns",
    input: { weeks: 4 },
  };

  it("leaves an announced tool call's arguments alone", async () => {
    const { kept, dropped } = await through([START, DELTA, CALL]);
    expect(kept).toEqual([START, DELTA, CALL]);
    expect(dropped).toEqual([]);
  });

  it("drops arguments for a tool call the stream never announced", async () => {
    const { kept, dropped } = await through([DELTA, CALL]);
    // The tool still runs: `tool-call` carries the whole input, and it is the
    // delta alone the SDK would have thrown on.
    expect(kept).toEqual([CALL]);
    expect(dropped).toEqual(["call-1"]);
  });

  it("reports one dropped tool call however many deltas it sent", async () => {
    const { kept, dropped } = await through([DELTA, DELTA, DELTA, CALL]);
    expect(kept).toEqual([CALL]);
    expect(dropped).toEqual(["call-1"]);
  });

  it("keeps the announced call while dropping the unannounced one", async () => {
    const other = { type: "tool-input-delta", id: "call-2", delta: "{}" };
    const { kept, dropped } = await through([START, DELTA, other]);
    expect(kept).toEqual([START, DELTA]);
    expect(dropped).toEqual(["call-2"]);
  });

  it("passes text through untouched", async () => {
    const text = { type: "text-delta", id: "t1", text: "You ran well." };
    const { kept } = await through([text]);
    expect(kept).toEqual([text]);
  });
});
