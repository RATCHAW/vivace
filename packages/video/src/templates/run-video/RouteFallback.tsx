import { RouteCanvas } from "../../core/RouteCanvas";
import { ROUTE_COLOR, ROUTE_PADDING, sampleIndex, type LatLng } from "./data";

/** No Mapbox token yet: the replay's route on the bare canvas-dark plate, so the
 *  video still tells the story. One layer of `core/RouteCanvas`. */
export function RouteFallback({
  points,
  progress,
  width,
  height,
  avatarUrl,
}: {
  points: LatLng[];
  progress: number;
  width: number;
  height: number;
  avatarUrl: string;
}) {
  return (
    <RouteCanvas
      layers={[
        {
          key: "run",
          points,
          drawn: sampleIndex(points.length, progress) + 1,
          color: ROUTE_COLOR,
          avatarUrl,
        },
      ]}
      width={width}
      height={height}
      padding={ROUTE_PADDING}
    />
  );
}
