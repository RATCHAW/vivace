import { useEffect, useRef, useState } from "react";
import { AbsoluteFill, interpolate, useDelayRender } from "remotion";
import mapboxgl, { type GeoJSONSource, type Map as MapboxMap } from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { sampleIndex, type LatLng } from "./data";

// DESIGN.md {colors.primary} — the cobalt stamp, used here as illustration ink.
const ROUTE_COLOR = "#494fdf";

const toLngLat = ([lat, lng]: LatLng): [number, number] => [lng, lat];

const lineString = (coordinates: [number, number][]) =>
  ({
    type: "Feature",
    properties: {},
    geometry: { type: "LineString", coordinates },
  }) as const;

const point = (coordinates: [number, number]) =>
  ({
    type: "Feature",
    properties: {},
    geometry: { type: "Point", coordinates },
  }) as const;

interface Camera {
  center: [number, number];
  zoom: number;
}

/** Deterministic Mapbox plate: the full route sits faint under a cobalt trace
 *  that draws with `progress`, while the camera eases from a tight shot on the
 *  start point out to the full route. */
export function RunMap({
  points,
  progress,
  token,
  width,
  height,
}: {
  points: LatLng[];
  progress: number;
  token: string;
  width: number;
  height: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cameraRef = useRef<{ start: Camera; end: Camera } | null>(null);
  const { delayRender, continueRender } = useDelayRender();
  const [map, setMap] = useState<MapboxMap | null>(null);
  const [loadingHandle] = useState(() => delayRender("Loading Mapbox map"));

  const coords = points.map(toLngLat);

  useEffect(() => {
    if (!containerRef.current) return;

    const bounds = coords.reduce(
      (b, coord) => b.extend(coord),
      new mapboxgl.LngLatBounds(coords[0], coords[0]),
    );

    const mapInstance = new mapboxgl.Map({
      accessToken: token,
      container: containerRef.current,
      style: "mapbox://styles/mapbox/dark-v11",
      center: coords[0],
      zoom: 13,
      interactive: false,
      // Attribution is rendered by the composition as story-legible text.
      attributionControl: false,
      fadeDuration: 0,
      preserveDrawingBuffer: true,
    });

    mapInstance.on("load", () => {
      // Leave room for the title band (top) and the metrics band (bottom).
      const fit = mapInstance.cameraForBounds(bounds, {
        padding: { top: 480, bottom: 660, left: 130, right: 130 },
      });
      const endCamera: Camera = {
        center: (fit?.center as mapboxgl.LngLat | undefined)?.toArray() as
          | [number, number]
          | undefined ?? coords[0],
        zoom: Math.min(fit?.zoom ?? 13, 16),
      };
      cameraRef.current = {
        start: { center: coords[0], zoom: Math.min(endCamera.zoom + 0.9, 16.5) },
        end: endCamera,
      };

      mapInstance.addSource("route-full", { type: "geojson", data: lineString(coords) });
      mapInstance.addLayer({
        id: "route-full-line",
        type: "line",
        source: "route-full",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#ffffff", "line-opacity": 0.25, "line-width": 5 },
      });

      mapInstance.addSource("route-trace", {
        type: "geojson",
        data: lineString(coords.slice(0, 2)),
      });
      mapInstance.addLayer({
        id: "route-trace-line",
        type: "line",
        source: "route-trace",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": ROUTE_COLOR, "line-width": 10 },
      });

      mapInstance.addSource("start-marker", { type: "geojson", data: point(coords[0]) });
      mapInstance.addLayer({
        id: "start-marker-dot",
        type: "circle",
        source: "start-marker",
        paint: {
          "circle-color": "#000000",
          "circle-radius": 9,
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 4,
        },
      });

      mapInstance.addSource("runner-marker", { type: "geojson", data: point(coords[0]) });
      mapInstance.addLayer({
        id: "runner-marker-dot",
        type: "circle",
        source: "runner-marker",
        paint: {
          "circle-color": "#ffffff",
          "circle-radius": 13,
          "circle-stroke-color": ROUTE_COLOR,
          "circle-stroke-width": 7,
        },
      });

      mapInstance.jumpTo(cameraRef.current.start);
      mapInstance.once("idle", () => {
        setMap(mapInstance);
        continueRender(loadingHandle);
      });
    });
    // The map mounts exactly once per composition; RunMap is keyed by activity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [continueRender, loadingHandle, token]);

  useEffect(() => {
    if (!map || !cameraRef.current) return;

    const handle = delayRender("Rendering Mapbox frame");
    const idx = sampleIndex(coords.length, progress);
    const trace = map.getSource("route-trace") as GeoJSONSource | undefined;
    const runner = map.getSource("runner-marker") as GeoJSONSource | undefined;
    trace?.setData(lineString(coords.slice(0, Math.max(idx + 1, 2))));
    runner?.setData(point(coords[idx]));

    const { start, end } = cameraRef.current;
    map.jumpTo({
      center: [
        interpolate(progress, [0, 1], [start.center[0], end.center[0]]),
        interpolate(progress, [0, 1], [start.center[1], end.center[1]]),
      ],
      zoom: interpolate(progress, [0, 1], [start.zoom, end.zoom]),
    });

    map.once("idle", () => continueRender(handle));
    // Force an idle event even when the camera is unchanged between frames.
    map.triggerRepaint();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [continueRender, delayRender, map, progress]);

  return (
    <AbsoluteFill>
      <div ref={containerRef} style={{ width, height, position: "absolute" }} />
    </AbsoluteFill>
  );
}
