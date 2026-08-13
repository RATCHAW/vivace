import { Composition } from "remotion";
import type { Run } from "@/api";
import {
  DURATION_IN_FRAMES,
  FPS,
  VIDEO_HEIGHT,
  VIDEO_WIDTH,
} from "./run-video/data";
import { RunVideo } from "./run-video/RunVideo";

/** Also hard-coded in apps/api/src/render.ts — the API can't import web source. */
export const RUN_VIDEO_COMPOSITION_ID = "run-video";

// Only ever seen in Remotion Studio; real renders get their props from the API,
// which passes the run and its streams as inputProps.
const placeholderRun: Run = {
  id: 0,
  name: "Morning Run",
  distance: 5021.4,
  moving_time: 1724,
  total_elevation_gain: 42,
  sport_type: "Run",
  start_date_local: "2026-08-09T07:12:00Z",
  average_speed: 2.91,
  average_heartrate: 152,
};

export function RemotionRoot() {
  return (
    <Composition
      id={RUN_VIDEO_COMPOSITION_ID}
      component={RunVideo}
      durationInFrames={DURATION_IN_FRAMES}
      fps={FPS}
      width={VIDEO_WIDTH}
      height={VIDEO_HEIGHT}
      defaultProps={{
        activity: placeholderRun,
        streams: {},
        mapboxToken: "",
        avatarUrl: "",
      }}
    />
  );
}
