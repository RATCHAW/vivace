import type { ComponentType } from "react";
import { Composition } from "remotion";
import { VIDEO_TEMPLATES, type TemplateId } from "./registry";
import type { VideoActivity } from "./types";

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

export const TEMPLATE_DEFAULT_PROPS: Record<TemplateId, Record<string, unknown>> = {
  "run-video": {
    activity: placeholderRun,
    streams: {},
    mapboxToken: "",
    avatarUrl: "",
  },
};

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
        />
      ))}
    </>
  );
}
