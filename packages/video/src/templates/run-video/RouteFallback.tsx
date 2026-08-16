import { useMemo } from "react";
import { AbsoluteFill } from "remotion";
import { projectRoute, ROUTE_PADDING, sampleIndex, type LatLng } from "./data";
import { RunnerAvatar } from "./RunnerAvatar";

// DESIGN.md {colors.primary} — cobalt as illustration ink on the black canvas.
const ROUTE_COLOR = "#494fdf";

const toSvgPoints = (points: [number, number][]) =>
  points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");

/** No Mapbox token yet — or a film cut for keying, where a basemap is the one
 *  thing that must not be in the frame: draw the route on the bare plate so the
 *  video still tells the story. Same trace + runner-dot language as the map. */
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
  const projected = useMemo(
    () => projectRoute(points, width, height, ROUTE_PADDING),
    [points, width, height],
  );

  if (projected.length < 2) return null;

  const idx = sampleIndex(projected.length, progress);
  const partial = projected.slice(0, Math.max(idx + 1, 2));
  const [startX, startY] = projected[0];
  const [runnerX, runnerY] = projected[idx];

  return (
    <AbsoluteFill style={{ backgroundColor: plate }}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <polyline
          points={toSvgPoints(projected)}
          fill="none"
          stroke={trackColor}
          strokeWidth={5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <polyline
          points={toSvgPoints(partial)}
          fill="none"
          stroke={ROUTE_COLOR}
          strokeWidth={10}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle
          cx={startX}
          cy={startY}
          r={9}
          fill="#000000"
          stroke="#ffffff"
          strokeWidth={4}
        />
        {!avatarUrl && (
          <circle
            cx={runnerX}
            cy={runnerY}
            r={13}
            fill="#ffffff"
            stroke={ROUTE_COLOR}
            strokeWidth={7}
          />
        )}
      </svg>
      {/* Over the SVG rather than a <foreignObject> in it: the puck is a plain
          DOM image, and the route here is already projected into the same
          composition pixels it is positioned in. */}
      {avatarUrl && <RunnerAvatar src={avatarUrl} x={runnerX} y={runnerY} />}
    </AbsoluteFill>
  );
}
