import { useMemo } from "react";
import { RouteMap } from "../../core/RouteMap";
import {
  buildCameraTrack,
  cameraAtProgress,
  ROUTE_COLOR,
  ROUTE_PADDING,
  RUNNER_AVATAR_CLEARANCE,
  RUNNER_CLEARANCE,
  sampleIndex,
  type LatLng,
} from "./data";

/** The replay's plate: one route, drawing under a camera that follows the head
 *  of it. Everything about the map itself lives in `core/RouteMap` — this is the
 *  single-runner shot, and the duo cut builds the same plate with two layers. */
export function RunMap({
  points,
  progress,
  token,
  width,
  height,
  avatarUrl,
}: {
  points: LatLng[];
  progress: number;
  token: string;
  width: number;
  height: number;
  avatarUrl: string;
}) {
  // Pure geometry — the path exists before the first tile does, so the map can
  // open on the right shot instead of easing into one once the style lands. The
  // avatar is the wider marker, so it is also the wider shot.
  const clearance = avatarUrl ? RUNNER_AVATAR_CLEARANCE : RUNNER_CLEARANCE;
  const track = useMemo(
    () =>
      buildCameraTrack(
        points,
        { width, height, padding: ROUTE_PADDING },
        { clearance },
      ),
    [points, width, height, clearance],
  );

  return (
    <RouteMap
      layers={[
        {
          key: "run",
          points,
          drawn: sampleIndex(points.length, progress) + 1,
          color: ROUTE_COLOR,
          avatarUrl,
        },
      ]}
      camera={cameraAtProgress(track, progress)}
      token={token}
      width={width}
      height={height}
    />
  );
}
