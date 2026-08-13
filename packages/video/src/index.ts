/**
 * The React-free half of the package: the template catalogue, the props
 * contract, and the pure maths and formatters the compositions are built from.
 *
 * apps/api imports this and only this — nothing reachable from here may pull in
 * React, Remotion or Mapbox, or the server starts bundling a video renderer it
 * never runs. The compositions themselves are `@repo/video/compositions`.
 */
export * from "./registry";
export type { VideoActivity, VideoStreams } from "./types";

// The formatters double as the app's: a pace in the run list and a pace in the
// video are the same string, and this is the one implementation of it.
export {
  avatarSource,
  formatClock,
  formatKm,
  formatPace,
  formatStartDate,
  metricsAtProgress,
  type LiveMetrics,
} from "./templates/run-video/data";
