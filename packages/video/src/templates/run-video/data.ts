import {
  buildCameraTrack as buildTrack,
  type Camera,
  type CameraTrackOptions,
  type Viewport,
} from "../../core/camera";
import type { LatLng, RoutePadding } from "../../core/geo";
import {
  liveMetrics,
  smoothingHalfWidth as smoothingWindow,
} from "../../core/metrics";
import type { LiveMetrics } from "../../core/metrics";
import { clamp01 } from "../../core/timing";
import { getTemplate } from "../../registry";
import type { VideoActivity, VideoStreams } from "../../types";

// The formatters, the projection, the camera and the marker geometry are shared
// with the duo cut and the poster now; they are re-exported here so the replay's
// own maths — and its tests — still read as one module.
export {
  formatClock,
  formatKm,
  formatPace,
  formatStartDate,
} from "../../core/format";
export { projectRoute, type LatLng, type RoutePadding } from "../../core/geo";
export {
  cameraAtProgress,
  fromMercator,
  projectPoint,
  toMercator,
  CAMERA_SMOOTHING_SAMPLES,
  CAMERA_TRACK_SAMPLES,
  MAX_CAMERA_ZOOM,
  type Camera,
  type Viewport,
} from "../../core/camera";
export {
  avatarSource,
  RUNNER_AVATAR_CLEARANCE,
  RUNNER_AVATAR_RING,
  RUNNER_AVATAR_SIZE,
  RUNNER_CLEARANCE,
  RUNNER_DOT_RADIUS,
} from "../../core/marker";
export { sampleIndex } from "../../core/timing";
export {
  windowMean,
  SMOOTHING_SECONDS,
  type LiveMetrics,
} from "../../core/metrics";

// Story format: 9:16 at 30fps, 15 seconds. The registry is the source — it is
// what the <Composition>, the browser's <Player> and the Lambda render all read
// — and these are the names the composition's own maths is written in.
const TEMPLATE = getTemplate("run-video");
export const FPS = TEMPLATE.fps;
export const VIDEO_WIDTH = TEMPLATE.width;
export const VIDEO_HEIGHT = TEMPLATE.height;
export const DURATION_IN_FRAMES = TEMPLATE.durationInFrames;

/** A trapezoid envelope over the timeline: 0 before `from`, ramping to 1 by
 *  `hold`, held until `release`, back to 0 at `to`. The overlay rides one of
 *  these, so it dissolves in over the opening beat rather than cutting. */
export function fadeAt(
  progress: number,
  from: number,
  hold: number,
  release: number,
  to: number,
): number {
  if (progress <= from || progress >= to) return 0;
  if (progress < hold) return (progress - from) / (hold - from);
  if (progress <= release) return 1;
  return 1 - (progress - release) / (to - release);
}

// The draw is the whole film. It opens holding on the start line for a beat and
// finishes early, so the completed route holds under the final live numbers —
// the frame a story is paused on.
export const DRAW_START = Math.round(0.06 * DURATION_IN_FRAMES);
export const DRAW_END = Math.round(0.92 * DURATION_IN_FRAMES);

/** Constant-speed progress through the route draw. A run is continuous motion,
 *  so easing here would make the athlete surge off the line and crawl home. */
export function routeProgressAtFrame(frame: number): number {
  return clamp01((frame - DRAW_START) / (DRAW_END - DRAW_START));
}

/** Half-width, in stream samples, of the moving average that settles pace and
 *  heart rate — the replay's draw window bound into `core/metrics`. */
export function smoothingHalfWidth(sampleCount: number, fps: number): number {
  return smoothingWindow(sampleCount, fps, DRAW_END - DRAW_START);
}

/** What the overlay shows at a given route progress. */
export function metricsAtProgress(
  activity: VideoActivity,
  streams: VideoStreams,
  progress: number,
  fps: number = FPS,
): LiveMetrics {
  return liveMetrics(activity, streams, progress, fps, DRAW_END - DRAW_START);
}

/** The safe box: the title band sits above it, the metrics band below. Whatever
 *  the eye is following — the cobalt trace and the runner dot at its head — is
 *  kept inside it, on the Mapbox camera and on the fallback canvas alike. */
export const ROUTE_PADDING: RoutePadding = {
  top: 480,
  right: 130,
  bottom: 660,
  left: 130,
};

// DESIGN.md {colors.primary} — the cobalt stamp, used here as illustration ink.
export const ROUTE_COLOR = "#494fdf";

/** A camera path for the draw, framing the trace and the runner at its head.
 *  The maths is `core/camera`'s, over this template's single route. */
export function buildCameraTrack(
  points: LatLng[],
  viewport: Viewport,
  options: CameraTrackOptions = {},
): Camera[] {
  return buildTrack(points, viewport, options);
}
