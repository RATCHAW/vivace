/**
 * How a number is spelled, everywhere.
 *
 * These are the app's formatters as much as the video's — a pace in the run list
 * and a pace in a video are the same string, and this is the one implementation
 * of it. They lived in `templates/run-video/data.ts` until there was a second
 * template; that module re-exports them, so nothing that imported them moved.
 *
 * Metric only, deliberately: nothing in the product carries a unit preference
 * yet (the run list says `/km`, the athlete profile we store has no
 * `measurement_preference`), and a formatter that can say miles while every
 * other surface says kilometres is a bug waiting for its first American.
 */
import type { VideoActivity } from "../types";

/** 5021.4 -> "5.02" */
export function formatKm(meters: number): string {
  return (meters / 1000).toFixed(2);
}

/** 5021.4 -> "5.0" — the poster's stat row, where two decimals read as a receipt. */
export function formatKmShort(meters: number): string {
  return (meters / 1000).toFixed(1);
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
  if (
    secondsPerKm == null ||
    !Number.isFinite(secondsPerKm) ||
    secondsPerKm <= 0
  ) {
    return "–:––";
  }
  const s = Math.round(secondsPerKm);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * The run's average pace, in seconds per kilometre.
 *
 * Not a division at each call site, because `average_speed` is 0 on a manual
 * upload and on plenty of treadmill imports — and a run that carries a distance
 * and a time knows its pace whatever the field says. Null only when there is
 * genuinely nothing to derive it from.
 */
export function averagePace(activity: VideoActivity): number | null {
  if (activity.average_speed > 0) return 1000 / activity.average_speed;
  if (activity.distance > 0 && activity.moving_time > 0) {
    return (activity.moving_time * 1000) / activity.distance;
  }
  return null;
}

/** Whole metres, never a decimal: nobody climbs 42.3 m. */
export function formatElevation(meters: number): string {
  return String(Math.max(0, Math.round(meters)));
}

/** "SAT · AUG 9 · 7:12 AM" — start_date_local carries the local clock with a
 *  Z suffix, so format it in UTC to preserve the athlete's wall time. */
export function formatStartDate(activity: VideoActivity): string {
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

/** "SAT 9 AUG 2026" — the poster's date line, where the clock is noise. */
export function formatDay(activity: VideoActivity): string {
  const date = new Date(activity.start_date_local);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  })
    .format(date)
    .replace(/,/g, "")
    .toUpperCase();
}

/** The split's own label: `1`, `2`, … and `0.4` for a partial one. */
export function formatSplitLabel(
  distanceMeters: number,
  index: number,
  partial: boolean,
): string {
  if (!partial) return String(index + 1);
  const km = distanceMeters / 1000;
  return km >= 0.1 ? km.toFixed(1) : "0.1";
}
