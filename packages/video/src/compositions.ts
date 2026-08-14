/**
 * The React half: the composition components, for the browser's `<Player>`.
 *
 * Kept behind its own export so apps/api can import the catalogue from
 * `@repo/video` without React, Remotion and Mapbox coming with it. The Lambda
 * bundle doesn't come through here either — it enters at `./lambda-entry`, which
 * loads each template lazily.
 */
import type { ComponentType } from "react";
import type { TemplateId } from "./registry";
import { LivingPoster } from "./templates/living-poster/LivingPoster";
import { MinimalNumbers } from "./templates/minimal-numbers/MinimalNumbers";
import { RunVideo } from "./templates/run-video/RunVideo";
import { SplitRush } from "./templates/split-rush/SplitRush";

export { RunVideo, type RunVideoProps } from "./templates/run-video/RunVideo";
export {
  SplitRush,
  type SplitRushProps,
} from "./templates/split-rush/SplitRush";
export {
  LivingPoster,
  type LivingPosterProps,
} from "./templates/living-poster/LivingPoster";
export {
  MinimalNumbers,
  type MinimalNumbersProps,
} from "./templates/minimal-numbers/MinimalNumbers";
// Exported for the drift test in apps/web, not for the app to render — the app
// has its own copy, and this is the one the watermark is stamped with.
export { VivaceMark } from "./brand/vivace-mark";

/**
 * What plays a given template in the browser.
 *
 * The props are the same envelope the API sends as `inputProps`, so the film in
 * the player and the file that comes off Lambda are the same cut. Every template
 * takes what it needs from it and ignores the rest — `usesMap`,
 * `supportsAvatar` and `supportsTheme` on the catalogue entry say which of them
 * that is.
 */
export interface VideoProps extends Record<string, unknown> {
  activity: unknown;
  streams: unknown;
  mapboxToken: string;
  avatarUrl: string;
  /** One of `THEME_NAMES`. A template that doesn't support themes ignores it. */
  theme: string;
}

export const VIDEO_COMPONENTS: Record<TemplateId, ComponentType<VideoProps>> = {
  // Each template narrows this envelope's `activity` and `streams` to what it
  // actually reads; React components are contravariant in props, so the
  // catalogue's common type costs one cast per entry.
  "run-video": RunVideo as ComponentType<VideoProps>,
  "split-rush": SplitRush as ComponentType<VideoProps>,
  "living-poster": LivingPoster as ComponentType<VideoProps>,
  "minimal-numbers": MinimalNumbers as ComponentType<VideoProps>,
};
