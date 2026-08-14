/**
 * Living Run Poster's maths: the route, cleaned and simplified and projected,
 * and where the type block sits under it.
 *
 * Pure and React-free — the eligibility rule counts the same cleaned points the
 * poster would draw, so a route that survives the picker is one that draws.
 */
import {
  averagePace,
  formatClock,
  formatElevation,
  formatKm,
  formatPace,
} from "../../core/format";
import { CANVAS_HEIGHT, CANVAS_WIDTH, LOGO_TOP, PAGE_INSET, SAFE_TOP } from "../../core/layout";
import {
  cleanRoute,
  pathLength,
  projectRoute,
  routeStrokeWidth,
  simplifyToTarget,
  type LatLng,
  type RoutePadding,
} from "../../core/geo";
import { buildBeats, type Beat } from "../../core/timing";
import type { VideoActivity, VideoStreams } from "../../types";

/** Fewer points than this and there is no shape to frame. */
export const MIN_ROUTE_POINTS = 20;

/** Elevation earns a column only when there was a hill. */
export const ELEVATION_THRESHOLD = 100;

/**
 * The box the route is drawn in: the upper ~60% of the safe band, with the 12%
 * padding that keeps a route from touching its own frame. North up, always —
 * rotating a route to fill the box better is what makes a local say "that isn't
 * my park".
 */
export const POSTER_PADDING: RoutePadding = {
  top: SAFE_TOP + 90,
  right: 130,
  bottom: CANVAS_HEIGHT - 1000,
  left: 130,
};

/** Where the type block starts, under the route. */
export const TYPE_BLOCK_TOP = 1120;
/** …and where its stat row sits, clear of the lockup. */
export const STATS_TOP = 1300;

export interface PosterStat {
  label: string;
  value: string;
  unit?: string;
}

export interface PosterPlan {
  /** Composition-pixel path, ready for a polyline. */
  projected: [number, number][];
  /** Length of that path in pixels — what the stroke reveal is timed against,
   *  so an out-and-back and a loop draw at the same speed. */
  length: number;
  strokeWidth: number;
  stats: PosterStat[];
  beats: Beat[];
}

/** The route as it will be drawn: spikes dropped, then simplified to a few
 *  hundred points so the stroke reads as a drawn line and not as fur. */
export function posterRoute(streams: VideoStreams): LatLng[] {
  const points = streams.latlng?.data ?? [];
  if (points.length === 0) return [];
  return simplifyToTarget(cleanRoute(points, streams.time?.data));
}

export function posterStats(activity: VideoActivity): PosterStat[] {
  const stats: PosterStat[] = [
    { label: "Distance", value: formatKm(activity.distance), unit: "km" },
    { label: "Time", value: formatClock(activity.moving_time) },
    { label: "Pace", value: formatPace(averagePace(activity)), unit: "/km" },
  ];
  // A fourth column only when there is a fourth thing worth reading. A 3 m gain
  // printed as large as the distance is a column apologising for itself.
  if (activity.total_elevation_gain > ELEVATION_THRESHOLD) {
    stats.push({
      label: "Elevation",
      value: formatElevation(activity.total_elevation_gain),
      unit: "m",
    });
  }
  return stats;
}

/** 10 seconds, of which the last 2.5 is a held frame — the poster itself. */
export const POSTER_SECONDS = 10;

const SPANS = [
  { id: "canvas", seconds: 0.5 },
  { id: "route", seconds: 3.5 },
  { id: "markers", seconds: 0.8 },
  { id: "title", seconds: 0.8 },
  { id: "stats", seconds: 1.9 },
  { id: "hold", seconds: 2.5 },
];

export function posterPlan(
  activity: VideoActivity,
  streams: VideoStreams,
  fps: number,
  durationInFrames: number,
): PosterPlan {
  const points = posterRoute(streams);
  const projected = projectRoute(points, CANVAS_WIDTH, CANVAS_HEIGHT, POSTER_PADDING);
  return {
    projected,
    length: pathLength(projected),
    strokeWidth: routeStrokeWidth(projected),
    stats: posterStats(activity),
    beats: buildBeats(SPANS, fps, durationInFrames),
  };
}

/** The faint baseline grid behind the route — the lines a poster is set on.
 *  Returned as plain numbers so the component draws and does not decide. */
export function posterGrid(): { columns: number[]; rows: number[] } {
  const columns: number[] = [];
  const rows: number[] = [];
  const left = PAGE_INSET;
  const right = CANVAS_WIDTH - PAGE_INSET;
  for (let x = left; x <= right; x += (right - left) / 6) columns.push(Math.round(x));
  for (let y = SAFE_TOP; y <= LOGO_TOP - 60; y += (LOGO_TOP - 60 - SAFE_TOP) / 8) {
    rows.push(Math.round(y));
  }
  return { columns, rows };
}
