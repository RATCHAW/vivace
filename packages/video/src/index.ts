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

// Which templates a given run can be cut with, and how long each one's film is.
// The picker reads the first, the browser's <Player> reads the second, and
// Remotion's `calculateMetadata` reads the second on Lambda.
export {
  recommendTemplate,
  templateEligibilities,
  templateEligibility,
  type Eligibility,
  type TemplateInput,
} from "./eligibility";
export { estimateDurationInFrames, MAX_STORY_SECONDS } from "./duration";

// The three looks a video can be cut in. apps/api validates the athlete's
// choice against `THEME_NAMES`; the picker renders `THEMES`.
export {
  DEFAULT_THEME,
  getTheme,
  isThemeName,
  THEME_NAMES,
  THEMES,
  type Theme,
  type ThemeName,
} from "./core/theme";

// The formatters double as the app's: a pace in the run list and a pace in the
// video are the same string, and this is the one implementation of it.
export {
  formatClock,
  formatDay,
  formatElevation,
  formatKm,
  formatPace,
  formatStartDate,
} from "./core/format";
export {
  avatarSource,
  metricsAtProgress,
  type LiveMetrics,
} from "./templates/run-video/data";
