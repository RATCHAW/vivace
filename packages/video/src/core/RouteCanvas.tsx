import { Fragment, useMemo } from "react";
import { AbsoluteFill } from "remotion";
import { projectRoute, type RoutePadding } from "./geo";
import type { RouteLayer } from "./RouteMap";
import { RunnerAvatar } from "./RunnerAvatar";
import { RunnerLabel, RUNNER_LABEL_PLATE } from "./RunnerLabel";

const toSvgPoints = (points: [number, number][]) =>
  points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");

/**
 * No Mapbox token: draw the routes on the bare canvas-dark plate so the video
 * still tells the story. Same trace and runner-dot language as the map.
 *
 * Every layer is projected through *one* fit of the combined route, which is
 * the whole reason this takes a list rather than being called twice: two
 * runners each fitted to the frame would be drawn on top of each other however
 * far apart they actually ran.
 */
export function RouteCanvas({
  layers,
  width,
  height,
  padding,
  plate = "#000000",
  trackColor = "rgba(255,255,255,0.22)",
  labelPlate = RUNNER_LABEL_PLATE,
}: {
  layers: RouteLayer[];
  width: number;
  height: number;
  padding: RoutePadding;
  /** What the routes are drawn on: canvas-dark, or the chroma key colour. */
  plate?: string;
  /**
   * The unrun part of each route.
   *
   * A prop rather than the constant it used to be, because it has to be opaque
   * on the key plate: 22% white over chroma green composites to pale green and
   * is cut away with the background, taking the route the athlete has not
   * reached yet with it. See `overlayInk` in `core/greenscreen.ts`.
   */
  trackColor?: string;
  /** The plate a runner's name sits on, for the same reason and flattened the
   *  same way. Only drawn for a layer that carries a name. */
  labelPlate?: string;
}) {
  const projected = useMemo(() => {
    const all = projectRoute(
      layers.flatMap((layer) => layer.points),
      width,
      height,
      padding,
    );
    // Cut back into one run of points each, in the order they went in.
    const slices: [number, number][][] = [];
    let at = 0;
    for (const layer of layers) {
      slices.push(all.slice(at, at + layer.points.length));
      at += layer.points.length;
    }
    return slices;
  }, [layers, width, height, padding]);

  if (projected.every((points) => points.length < 2)) return null;

  return (
    <AbsoluteFill style={{ backgroundColor: plate }}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        {projected.map((points, index) =>
          points.length < 2 ? null : (
            <polyline
              key={layers[index].key}
              points={toSvgPoints(points)}
              fill="none"
              stroke={trackColor}
              strokeWidth={5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ),
        )}
        {projected.map((points, index) => {
          const layer = layers[index];
          if (points.length < 2 || layer.drawn < 1) return null;
          return (
            <polyline
              key={layer.key}
              points={toSvgPoints(points.slice(0, Math.max(layer.drawn, 2)))}
              fill="none"
              stroke={layer.color}
              strokeWidth={10}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          );
        })}
        {projected.map((points, index) =>
          points.length < 2 ? null : (
            <circle
              key={layers[index].key}
              cx={points[0][0]}
              cy={points[0][1]}
              r={9}
              fill="#000000"
              stroke="#ffffff"
              strokeWidth={4}
            />
          ),
        )}
        {projected.map((points, index) => {
          const layer = layers[index];
          const head = runnerAt(points, layer.drawn);
          if (!head || layer.avatarUrl) return null;
          return (
            <circle
              key={layer.key}
              cx={head[0]}
              cy={head[1]}
              r={13}
              fill="#ffffff"
              stroke={layer.color}
              strokeWidth={7}
            />
          );
        })}
      </svg>
      {/* Over the SVG rather than in a <foreignObject>: the puck and the name
          plate are plain DOM, and the route here is already projected into the
          same composition pixels they are positioned in. */}
      {projected.map((points, index) => {
        const layer = layers[index];
        const head = runnerAt(points, layer.drawn);
        if (!head) return null;
        return (
          <Fragment key={layer.key}>
            {layer.avatarUrl !== "" && (
              <RunnerAvatar
                src={layer.avatarUrl}
                x={head[0]}
                y={head[1]}
                ring={layer.color}
              />
            )}
            {layer.label !== undefined && (
              <RunnerLabel
                name={layer.label}
                x={head[0]}
                y={head[1]}
                avatar={layer.avatarUrl !== ""}
                above={layer.labelAbove}
                plate={labelPlate}
              />
            )}
          </Fragment>
        );
      })}
    </AbsoluteFill>
  );
}

/** Where this layer's runner is on the plate, or null before they set off. */
function runnerAt(
  points: [number, number][],
  drawn: number,
): [number, number] | null {
  if (points.length < 2 || drawn < 1) return null;
  return points[Math.min(drawn, points.length) - 1];
}
