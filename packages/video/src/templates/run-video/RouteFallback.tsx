import { RouteCanvas } from "../../core/RouteCanvas";
import { ROUTE_COLOR, ROUTE_PADDING, sampleIndex, type LatLng } from "./data";

/** No Mapbox token yet — or a film cut for keying, where a basemap is the one
 *  thing that must not be in the frame: draw the route on the bare plate so the
 *  video still tells the story. One layer of `core/RouteCanvas`. */
export function RouteFallback({
  points,
  progress,
  width,
  height,
  avatarUrl,
  plate,
  trackColor,
}: {
  points: LatLng[];
  progress: number;
  width: number;
  height: number;
  avatarUrl: string;
  /** What the route is drawn on: canvas-dark, or the chroma key colour. */
  plate: string;
  /** The unrun part of the route. Opaque on the key plate — a 22%-white over
   *  chroma green composites to pale green and is cut away with it. */
  trackColor: string;
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
      plate={plate}
      trackColor={trackColor}
    />
  );
}
