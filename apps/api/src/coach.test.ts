import { describe, expect, it } from "vitest";
import { clock, pace, toSplits, weekStart } from "./coach.js";
import { titleFrom } from "./chat-store.js";
import type { RunStreams } from "./schemas.js";

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
    expect(toSplits({ distance: { data: [] }, time: { data: [] } })).toEqual([]);
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
          { type: "file", mediaType: "image/png", url: "data:image/png;base64,x" },
        ],
      }),
    ).toBeNull();
  });
});
