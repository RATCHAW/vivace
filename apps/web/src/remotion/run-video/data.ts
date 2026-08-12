import type { Run, RunStreams } from "@/api";

// Story format: 9:16 at 30fps, 15 seconds.
export const FPS = 30;
export const VIDEO_WIDTH = 1080;
export const VIDEO_HEIGHT = 1920;
export const DURATION_IN_FRAMES = 15 * FPS;
// The route draws between these frames; the last 2s hold the settled totals.
export const DRAW_START = 2 * FPS;
export const DRAW_END = 13 * FPS;

/** Strava streams deliver [latitude, longitude] pairs. */
export type LatLng = number[];

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/** Map a 0–1 progress onto an index into a stream of `length` samples. */
export function sampleIndex(length: number, progress: number): number {
  if (length <= 0) return 0;
  return Math.min(length - 1, Math.floor(clamp01(progress) * (length - 1)));
}

export function formatKm(meters: number): string {
  return (meters / 1000).toFixed(2);
}

/** 3723 -> "1:02:03", 754 -> "12:34" */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;
  const mm = hours > 0 ? String(minutes).padStart(2, "0") : String(minutes);
  const ss = String(seconds).padStart(2, "0");
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Seconds-per-km -> "5:12". Returns "–:––" when pace is unknown. */
export function formatPace(secondsPerKm: number | null): string {
  if (secondsPerKm == null || !Number.isFinite(secondsPerKm) || secondsPerKm <= 0) {
    return "–:––";
  }
  const s = Math.round(secondsPerKm);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** "SAT · AUG 9 · 7:12 AM" — start_date_local carries the local clock with a
 *  Z suffix, so format it in UTC to preserve the athlete's wall time. */
export function formatStartDate(activity: Run): string {
  const date = new Date(activity.start_date_local);
  if (Number.isNaN(date.getTime())) return "";
  const day = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    timeZone: "UTC",
  }).format(date);
  const monthDay = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
  const time = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(date);
  return `${day} · ${monthDay} · ${time}`.toUpperCase();
}

export interface LiveMetrics {
  distanceMeters: number;
  elapsedSeconds: number;
  paceSecondsPerKm: number | null;
  heartrate: number | null;
  elevationGainMeters: number;
}

/** What the overlay shows at a given route progress. Falls back to linearly
 *  scaled activity totals when the activity has no usable streams. */
export function metricsAtProgress(
  activity: Run,
  streams: RunStreams,
  progress: number,
): LiveMetrics {
  const p = clamp01(progress);
  const averagePace =
    activity.average_speed > 0 ? 1000 / activity.average_speed : null;

  const time = streams.time?.data;
  const distance = streams.distance?.data;
  const sampleCount = Math.max(time?.length ?? 0, distance?.length ?? 0);

  if (sampleCount < 2) {
    return {
      distanceMeters: activity.distance * p,
      elapsedSeconds: activity.moving_time * p,
      paceSecondsPerKm: averagePace,
      heartrate: activity.average_heartrate ? Math.round(activity.average_heartrate) : null,
      elevationGainMeters: activity.total_elevation_gain * p,
    };
  }

  const idx = sampleIndex(sampleCount, p);
  const velocity = streams.velocity_smooth?.data[idx];
  const heartrate = streams.heartrate?.data[idx] ?? activity.average_heartrate;
  return {
    distanceMeters: distance?.[idx] ?? activity.distance * p,
    elapsedSeconds: time?.[idx] ?? activity.moving_time * p,
    // Standing still produces absurd instantaneous paces — fall back to average.
    paceSecondsPerKm: velocity && velocity > 0.5 ? 1000 / velocity : averagePace,
    heartrate: heartrate ? Math.round(heartrate) : null,
    elevationGainMeters: activity.total_elevation_gain * p,
  };
}

export interface RoutePadding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** Project [lat, lng] points onto composition pixels (equirectangular with
 *  latitude correction — plenty accurate at running distances). Used by the
 *  no-Mapbox-token fallback canvas. */
export function projectRoute(
  points: LatLng[],
  width: number,
  height: number,
  padding: RoutePadding,
): [number, number][] {
  if (points.length === 0) return [];
  const lats = points.map((p) => p[0]);
  const lngs = points.map((p) => p[1]);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const kx = Math.cos(((minLat + maxLat) / 2) * (Math.PI / 180));

  const spanX = Math.max((maxLng - minLng) * kx, 1e-9);
  const spanY = Math.max(maxLat - minLat, 1e-9);
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const scale = Math.min(innerWidth / spanX, innerHeight / spanY);

  const offsetX = padding.left + (innerWidth - spanX * scale) / 2;
  const offsetY = padding.top + (innerHeight - spanY * scale) / 2;
  return points.map(([lat, lng]) => [
    offsetX + (lng - minLng) * kx * scale,
    offsetY + (maxLat - lat) * scale,
  ]);
}
