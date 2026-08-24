import { afterEach, describe, expect, it, vi } from "vitest";
import type { Run } from "./schemas.js";
import { fetchRunWeather } from "./weather.js";

/** A run with GPS, one hour long, leaving at 07:12 local. */
function run(over: Partial<Run> = {}): Run {
  return {
    id: 1,
    name: "Morning Run",
    distance: 12_000,
    moving_time: 3_600,
    total_elevation_gain: 40,
    sport_type: "Run",
    start_date_local: "2026-08-01T07:12:00Z",
    start_latlng: [48.8566, 2.3522],
    end_latlng: [48.8566, 2.3522],
    average_speed: 3.33,
    average_heartrate: null,
    max_heartrate: null,
    workout_type: "default",
    ...over,
  };
}

/** An Open-Meteo hourly payload for one day, built from per-hour values. */
function hourlyDay(
  day: string,
  values: Record<number, { temp: number; code?: number; wind?: number }>,
) {
  const hours = Object.keys(values).map(Number);
  return {
    hourly: {
      time: hours.map((h) => `${day}T${`${h}`.padStart(2, "0")}:00`),
      temperature_2m: hours.map((h) => values[h].temp),
      apparent_temperature: hours.map((h) => values[h].temp - 2),
      relative_humidity_2m: hours.map(() => 80),
      wind_speed_10m: hours.map((h) => values[h].wind ?? 10),
      precipitation: hours.map(() => 0),
      weather_code: hours.map((h) => values[h].code ?? 0),
    },
  };
}

function stubFetch(payload: unknown) {
  const mock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(payload), {
      headers: { "Content-Type": "application/json" },
    }),
  );
  vi.stubGlobal("fetch", mock);
  return mock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchRunWeather", () => {
  it("answers null without a network call when the run has no GPS", async () => {
    const mock = stubFetch({});
    const weather = await fetchRunWeather(
      run({ start_latlng: null, end_latlng: null }),
    );
    expect(weather).toBeNull();
    expect(mock).not.toHaveBeenCalled();
  });

  it("averages the start hour and the end hour", async () => {
    // 07:12 start + 1 h moving lands the finish in the 08:00 slot.
    stubFetch(hourlyDay("2026-08-01", { 7: { temp: 14 }, 8: { temp: 18 } }));

    const weather = await fetchRunWeather(
      run({ id: 2, start_latlng: [10.01, 10.01], end_latlng: [10.01, 10.01] }),
      new Date("2026-09-01T00:00:00Z"),
    );

    expect(weather?.temperature_c).toBe(16);
    expect(weather?.apparent_c).toBe(14);
  });

  it("describes the harshest of the two samples", async () => {
    // Clear at the start, rain by the finish — the line should say rain.
    stubFetch(
      hourlyDay("2026-08-01", {
        7: { temp: 14, code: 0 },
        8: { temp: 14, code: 63 },
      }),
    );

    const weather = await fetchRunWeather(
      run({ id: 3, start_latlng: [20.01, 20.01], end_latlng: [20.01, 20.01] }),
      new Date("2026-09-01T00:00:00Z"),
    );

    expect(weather?.description).toBe("Rain");
  });

  it("reads a week-old run from the archive and a fresh one from the forecast", async () => {
    const mock = stubFetch(hourlyDay("2026-08-01", { 7: { temp: 14 } }));

    await fetchRunWeather(
      run({ id: 4, start_latlng: [30.01, 30.01], end_latlng: null }),
      new Date("2026-09-01T00:00:00Z"),
    );
    expect(`${mock.mock.calls[0][0]}`).toContain("archive-api.open-meteo.com");

    mock.mockClear();
    await fetchRunWeather(
      run({ id: 5, start_latlng: [40.01, 40.01], end_latlng: null }),
      new Date("2026-08-02T00:00:00Z"),
    );
    expect(`${mock.mock.calls[0][0]}`).toContain(
      "api.open-meteo.com/v1/forecast",
    );
  });

  it("caches a day per location, so a loop run costs one request", async () => {
    const mock = stubFetch(
      hourlyDay("2026-08-01", { 7: { temp: 14 }, 8: { temp: 18 } }),
    );

    await fetchRunWeather(
      run({
        id: 6,
        start_latlng: [50.01, 50.01],
        end_latlng: [50.011, 50.011],
      }),
      new Date("2026-09-01T00:00:00Z"),
    );
    expect(mock).toHaveBeenCalledTimes(1);

    // A second read of the same run comes straight out of the cache.
    await fetchRunWeather(
      run({
        id: 6,
        start_latlng: [50.01, 50.01],
        end_latlng: [50.011, 50.011],
      }),
      new Date("2026-09-01T00:00:00Z"),
    );
    expect(mock).toHaveBeenCalledTimes(1);
  });

  it("answers null rather than throwing when Open-Meteo is down", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("nope", { status: 503 })),
    );

    const weather = await fetchRunWeather(
      run({ id: 7, start_latlng: [60.01, 60.01], end_latlng: null }),
      new Date("2026-09-01T00:00:00Z"),
    );
    expect(weather).toBeNull();
  });
});
