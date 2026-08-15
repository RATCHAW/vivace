import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import type { VideoActivity, VideoStreams } from "../../types";
import {
  avatarSource,
  fadeAt,
  metricsAtProgress,
  routeProgressAtFrame,
} from "./data";
import { RouteOverlay, StoryProgress, TYPE, Watermark } from "./overlay";
import { RunMap } from "./RunMap";
import { RouteFallback } from "./RouteFallback";

// A type alias, not an interface — Remotion's <Composition> needs props
// assignable to Record<string, unknown>, which interfaces never are.
export type RunVideoProps = {
  activity: VideoActivity;
  streams: VideoStreams;
  mapboxToken: string;
  /** The athlete's Strava picture, riding the head of the trace in place of the
   *  dot. Empty — the default — keeps the dot. */
  avatarUrl: string;
};

/** The replay is one shot: the route drawing under live metrics, with the camera
 *  following the runner. It opens on the start line and closes on the whole
 *  route — no title card, no cut away from the map. */
export function RunVideo({
  activity,
  streams,
  mapboxToken,
  avatarUrl,
}: RunVideoProps) {
  const frame = useCurrentFrame();
  const { fps, width, height, durationInFrames } = useVideoConfig();

  // Where the film is, 0–1. The story bar reads the same value.
  const t = Math.min(1, frame / Math.max(1, durationInFrames - 1));

  // One progress value drives the trace, the camera and the live numbers, so
  // the dot on the map and the metrics always agree.
  const routeProgress = routeProgressAtFrame(frame);

  const points = streams.latlng?.data ?? [];
  const hasRoute = points.length >= 2;
  const hasMap = hasRoute && mapboxToken !== "";
  // An athlete with no Strava picture gets the dot, whatever the option said.
  const avatar = avatarSource(avatarUrl);
  const live = metricsAtProgress(activity, streams, routeProgress, fps);

  // The type dissolves up over the opening beat rather than being there on frame
  // one; released past 1, so the closing frame still holds the final numbers.
  const hudOpacity = fadeAt(t, 0, 0.03, 1.01, 1.02);

  return (
    <AbsoluteFill style={{ backgroundColor: "#000000", color: "#ffffff" }}>
      {/* The map plate is the film — it stays mounted and lit for every frame;
          remounting it would cost a Mapbox style load mid-video. */}
      <AbsoluteFill>
        {hasMap ? (
          <RunMap
            points={points}
            progress={routeProgress}
            token={mapboxToken}
            width={width}
            height={height}
            avatarUrl={avatar}
          />
        ) : hasRoute ? (
          <RouteFallback
            points={points}
            progress={routeProgress}
            width={width}
            height={height}
            avatarUrl={avatar}
          />
        ) : null}

        {/* Scrims keep type legible over the map without breaking the
            no-drop-shadow rule — elevation via canvas luminance only. */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 560,
            background:
              "linear-gradient(to bottom, rgba(0,0,0,0.88), rgba(0,0,0,0))",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: 780,
            background:
              "linear-gradient(to top, rgba(0,0,0,0.92), rgba(0,0,0,0))",
          }}
        />

        {hasMap && (
          <div
            style={{
              position: "absolute",
              bottom: 26,
              right: 32,
              fontSize: TYPE.credit,
              color: "rgba(255,255,255,0.45)",
            }}
          >
            © Mapbox © OpenStreetMap
          </div>
        )}
      </AbsoluteFill>

      <RouteOverlay activity={activity} live={live} opacity={hudOpacity} />
      <Watermark />
      <StoryProgress progress={t} />
    </AbsoluteFill>
  );
}
