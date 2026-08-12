import { useMemo } from "react";
import { AbsoluteFill } from "remotion";
import { projectRoute, ROUTE_PADDING, sampleIndex, type LatLng } from "./data";

// DESIGN.md {colors.primary} — cobalt as illustration ink on the black canvas.
const ROUTE_COLOR = "#494fdf";

const toSvgPoints = (points: [number, number][]) =>
  points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");

/** No Mapbox token yet: draw the route on the bare canvas-dark plate so the
 *  video still tells the story. Same trace + runner-dot language as the map. */
export function RouteFallback({
  points,
  progress,
  width,
  height,
}: {
  points: LatLng[];
  progress: number;
  width: number;
  height: number;
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
    <AbsoluteFill style={{ backgroundColor: "#000000" }}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <polyline
          points={toSvgPoints(projected)}
          fill="none"
          stroke="rgba(255,255,255,0.22)"
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
        <circle cx={startX} cy={startY} r={9} fill="#000000" stroke="#ffffff" strokeWidth={4} />
        <circle cx={runnerX} cy={runnerY} r={13} fill="#ffffff" stroke={ROUTE_COLOR} strokeWidth={7} />
      </svg>
    </AbsoluteFill>
  );
}
