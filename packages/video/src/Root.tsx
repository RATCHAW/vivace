import type { ComponentType } from "react";
import { Composition } from "remotion";
import { DEFAULT_THEME } from "./core/theme";
import { estimateDurationInFrames } from "./duration";
import { VIDEO_TEMPLATES, type TemplateId } from "./registry";
import type { VideoActivity, VideoStreams } from "./types";

/**
 * Every template in the catalogue, registered as a `<Composition>`.
 *
 * The site bundle is one upload holding all of them — `renderMediaOnLambda`
 * picks one by `compositionId` — so a new template costs a chunk, not a
 * deployment. `lazyComponent` is what keeps that true: each template's code is
 * a separate webpack chunk, and a render only downloads the one it asked for.
 * Lambda re-fetches the bundle on every cold start, so a template that imported
 * its dependencies eagerly would slow down every *other* template's render.
 *
 * The component map is here rather than in `registry.ts` because that module has
 * to stay React-free for apps/api — `registry.test.ts` fails if the two drift.
 */

// Remotion infers a composition's props from its component; the catalogue is
// heterogeneous, so the map is typed loosely and each entry casts once, here.
type AnyVideo = ComponentType<Record<string, unknown>>;

export const TEMPLATE_COMPONENTS: Record<
  TemplateId,
  () => Promise<{ default: AnyVideo }>
> = {
  "run-video": () =>
    import("./templates/run-video/RunVideo").then((module) => ({
      default: module.RunVideo as AnyVideo,
    })),
  "duo-replay": () =>
    import("./templates/duo-replay/DuoReplay").then((module) => ({
      default: module.DuoReplay as AnyVideo,
    })),
  "split-rush": () =>
    import("./templates/split-rush/SplitRush").then((module) => ({
      default: module.SplitRush as AnyVideo,
    })),
  "living-poster": () =>
    import("./templates/living-poster/LivingPoster").then((module) => ({
      default: module.LivingPoster as AnyVideo,
    })),
  "minimal-numbers": () =>
    import("./templates/minimal-numbers/MinimalNumbers").then((module) => ({
      default: module.MinimalNumbers as AnyVideo,
    })),
};

/** Only ever seen in Remotion Studio; real renders get their props from the API,
 *  which passes the run and its streams as inputProps. */
const placeholderRun: VideoActivity = {
  id: 0,
  name: "Morning Run",
  distance: 5021.4,
  moving_time: 1724,
  total_elevation_gain: 42,
  sport_type: "Run",
  start_date_local: "2026-08-09T07:12:00Z",
  average_speed: 2.91,
  average_heartrate: 152,
  max_heartrate: 171,
  workout_type: "default",
};

export const TEMPLATE_DEFAULT_PROPS: Record<
  TemplateId,
  Record<string, unknown>
> = {
  "run-video": {
    activity: placeholderRun,
    streams: {},
    mapboxToken: "",
    avatarUrl: "",
    greenscreen: false,
  },
  "split-rush": {
    activity: placeholderRun,
    streams: {},
    theme: DEFAULT_THEME,
    greenscreen: false,
  },
  // No partner: Studio has no invitation to read, and the composition draws the
  // second bar dimmed and empty rather than refusing to open.
  "duo-replay": {
    activity: placeholderRun,
    streams: {},
    mapboxToken: "",
    avatarUrl: "",
    partner: null,
    athleteName: "You",
    greenscreen: false,
  },
  "living-poster": {
    activity: placeholderRun,
    streams: {},
    theme: DEFAULT_THEME,
    greenscreen: false,
  },
  "minimal-numbers": {
    activity: placeholderRun,
    streams: {},
    theme: DEFAULT_THEME,
    greenscreen: false,
  },
};

/**
 * The run and its streams out of a composition's untyped `inputProps`.
 *
 * `calculateMetadata` runs before the component does — on Lambda it runs against
 * whatever the API sent — so this is the one place that has to survive props
 * that aren't what we think they are, rather than crash the render at frame
 * zero and bill for it.
 */
function videoInput(props: Record<string, unknown>): {
  activity: VideoActivity;
  streams: VideoStreams;
} {
  return {
    activity: (props.activity ?? placeholderRun) as VideoActivity,
    streams: (props.streams ?? {}) as VideoStreams,
  };
}

export function RemotionRoot() {
  return (
    <>
      {VIDEO_TEMPLATES.map((template) => (
        <Composition
          key={template.id}
          id={template.compositionId}
          lazyComponent={TEMPLATE_COMPONENTS[template.id]}
          durationInFrames={template.durationInFrames}
          fps={template.fps}
          width={template.width}
          height={template.height}
          defaultProps={TEMPLATE_DEFAULT_PROPS[template.id]}
          // The length of the film is a property of the run, not of the
          // catalogue: a marathon's Split Rush is longer than a parkrun's, and a
          // run with three numbers in it is a shorter Minimal Numbers than one
          // with five. The browser's <Player> calls the same function.
          calculateMetadata={({ props }) => ({
            durationInFrames: estimateDurationInFrames(
              template.id,
              videoInput(props),
            ),
          })}
        />
      ))}
    </>
  );
}
