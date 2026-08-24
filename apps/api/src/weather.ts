import { logger } from "./logger.js";
import type { Run } from "./schemas.js";

/**
 * The weather a run was actually run in, from Open-Meteo — free, keyless, and
 * with a historical archive, which is why it needs no configuration to be on.
 *
 * A run is sampled twice: the start point at the start hour and the end point
 * at the end hour, averaged. A two-hour long run that leaves at dawn finishes
 * in different weather than it started in, and a single sample would pin the
 * whole session to whichever end it happened to read.
 */
export interface RunWeather {
  /** "Light rain", "Overcast", … — the WMO code as a short English phrase. */
  description: string;
  temperature_c: number;
  /** Feels-like: temperature corrected for wind and humidity. */
  apparent_c: number;
  humidity_pct: number;
  wind_kph: number;
  precipitation_mm: number;
}

/**
 * The archive is the durable source but it trails real time by a few days, so
 * a run fresher than a week reads from the forecast API's `past_days` window
 * instead. Both return the same hourly variables.
 */
const ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive";
const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
const ARCHIVE_LAG_DAYS = 7;

const HOURLY_VARS = [
  "temperature_2m",
  "apparent_temperature",
  "relative_humidity_2m",
  "wind_speed_10m",
  "precipitation",
  "weather_code",
].join(",");

/** A weather answer never stalls a debrief longer than this. */
const REQUEST_TIMEOUT_MS = 4_000;

/**
 * Past weather never changes, so the cache is about not asking twice rather
 * than freshness — same shape as the run-detail cache in strava.ts. Keys are
 * coordinate + day, so a loop run's two samples share one entry.
 */
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_MAX = 500;
const dayCache = new Map<string, { at: number; hours: HourlyDay }>();

interface HourlyDay {
  /** Local wall-clock hours, `YYYY-MM-DDTHH:00`. */
  time: string[];
  temperature_2m: (number | null)[];
  apparent_temperature: (number | null)[];
  relative_humidity_2m: (number | null)[];
  wind_speed_10m: (number | null)[];
  precipitation: (number | null)[];
  weather_code: (number | null)[];
}

/** The WMO weather interpretation codes Open-Meteo reports, as short phrases. */
const WMO_CODES: Record<number, string> = {
  0: "Clear sky",
  1: "Mainly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Fog",
  48: "Rime fog",
  51: "Light drizzle",
  53: "Drizzle",
  55: "Heavy drizzle",
  56: "Freezing drizzle",
  57: "Freezing drizzle",
  61: "Light rain",
  63: "Rain",
  65: "Heavy rain",
  66: "Freezing rain",
  67: "Freezing rain",
  71: "Light snow",
  73: "Snow",
  75: "Heavy snow",
  77: "Snow grains",
  80: "Light showers",
  81: "Showers",
  82: "Heavy showers",
  85: "Snow showers",
  86: "Snow showers",
  95: "Thunderstorm",
  96: "Thunderstorm with hail",
  99: "Thunderstorm with hail",
};

interface Sample {
  lat: number;
  lon: number;
  /** Local wall clock, `YYYY-MM-DDTHH:00` — the hour the point was passed. */
  hour: string;
}

/**
 * The two points worth sampling: start at the start hour, end at the end hour.
 * `start_date_local` is the athlete's wall clock with a fake Z suffix, which
 * pairs exactly with Open-Meteo's `timezone=auto` local timestamps — neither
 * side ever names the timezone.
 */
function samplePoints(run: Run): Sample[] {
  if (!run.start_latlng) return [];
  const start = new Date(run.start_date_local);
  const end = new Date(start.getTime() + run.moving_time * 1000);
  const [endLat, endLon] = run.end_latlng ?? run.start_latlng;
  return [
    { lat: run.start_latlng[0], lon: run.start_latlng[1], hour: toHour(start) },
    { lat: endLat, lon: endLon, hour: toHour(end) },
  ];
}

function toHour(date: Date): string {
  return `${date.toISOString().slice(0, 13)}:00`;
}

/**
 * Coordinates are rounded to ~1 km for the cache key — weather has no finer
 * resolution, and it makes a loop run's start and end the same lookup.
 */
function dayKey(sample: Sample): string {
  return `${sample.lat.toFixed(2)},${sample.lon.toFixed(2)},${sample.hour.slice(0, 10)}`;
}

function cachedDay(key: string): HourlyDay | null {
  const hit = dayCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    dayCache.delete(key);
    return null;
  }
  return hit.hours;
}

function cacheDay(key: string, hours: HourlyDay): void {
  if (dayCache.size >= CACHE_MAX) {
    const oldest = dayCache.keys().next().value;
    if (oldest !== undefined) dayCache.delete(oldest);
  }
  dayCache.set(key, { at: Date.now(), hours });
}

/** One point's hourly weather for one local day, cached. */
async function fetchDay(sample: Sample, today: Date): Promise<HourlyDay> {
  const key = dayKey(sample);
  const cached = cachedDay(key);
  if (cached) return cached;

  const day = sample.hour.slice(0, 10);
  const ageDays =
    (today.getTime() - new Date(`${day}T00:00:00Z`).getTime()) / 86_400_000;
  const recent = ageDays < ARCHIVE_LAG_DAYS;

  const url = new URL(recent ? FORECAST_URL : ARCHIVE_URL);
  url.searchParams.set("latitude", sample.lat.toFixed(4));
  url.searchParams.set("longitude", sample.lon.toFixed(4));
  url.searchParams.set("hourly", HOURLY_VARS);
  url.searchParams.set("timezone", "auto");
  if (recent) {
    url.searchParams.set("past_days", `${ARCHIVE_LAG_DAYS}`);
    url.searchParams.set("forecast_days", "1");
  } else {
    url.searchParams.set("start_date", day);
    url.searchParams.set("end_date", day);
  }

  const response = await fetch(url, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Open-Meteo responded ${response.status}`);

  const body = (await response.json()) as { hourly?: HourlyDay };
  if (!body.hourly?.time) throw new Error("Open-Meteo returned no hourly data");

  cacheDay(key, body.hourly);
  return body.hourly;
}

interface HourReading {
  temperature: number;
  apparent: number;
  humidity: number;
  wind: number;
  precipitation: number;
  code: number;
}

function readHour(hours: HourlyDay, hour: string): HourReading | null {
  const index = hours.time.indexOf(hour);
  if (index === -1) return null;
  const temperature = hours.temperature_2m[index];
  const apparent = hours.apparent_temperature[index];
  const humidity = hours.relative_humidity_2m[index];
  const wind = hours.wind_speed_10m[index];
  if (temperature == null || apparent == null) return null;
  return {
    temperature,
    apparent,
    humidity: humidity ?? 0,
    wind: wind ?? 0,
    precipitation: hours.precipitation[index] ?? 0,
    code: hours.weather_code[index] ?? 0,
  };
}

/**
 * The conditions over one run, or null when there is nothing honest to say —
 * no GPS, or Open-Meteo unreachable. Absence is a normal answer: the debrief
 * simply carries no weather line, the same way a treadmill run has no route.
 */
export async function fetchRunWeather(
  run: Run,
  now = new Date(),
): Promise<RunWeather | null> {
  const samples = samplePoints(run);
  if (samples.length === 0) return null;

  try {
    // A loop run's start and end share a key — one request, two hours read.
    const unique = new Map(samples.map((sample) => [dayKey(sample), sample]));
    const days = new Map(
      await Promise.all(
        [...unique].map(
          async ([key, sample]) => [key, await fetchDay(sample, now)] as const,
        ),
      ),
    );
    const readings = samples
      .map((sample) => {
        const day = days.get(dayKey(sample));
        return day ? readHour(day, sample.hour) : null;
      })
      .filter((reading): reading is HourReading => reading !== null);
    if (readings.length === 0) return null;

    const mean = (pick: (r: HourReading) => number) =>
      readings.reduce((sum, r) => sum + pick(r), 0) / readings.length;
    // Description follows the harshest sample — higher WMO codes are worse,
    // and "it started raining halfway" should read as rain.
    const code = Math.max(...readings.map((r) => r.code));

    return {
      description: WMO_CODES[code] ?? "Unknown",
      temperature_c: mean((r) => r.temperature),
      apparent_c: mean((r) => r.apparent),
      humidity_pct: mean((r) => r.humidity),
      wind_kph: mean((r) => r.wind),
      precipitation_mm: mean((r) => r.precipitation),
    };
  } catch (err) {
    // Best-effort by design: a debrief without weather beats no debrief.
    logger.warn(
      { event: "weather.request_failed", activityId: run.id, err },
      "Weather lookup failed",
    );
    return null;
  }
}
