import { useEffect, useMemo, useRef, useState } from "react";
import { AbsoluteFill, getRemotionEnvironment, useDelayRender } from "remotion";
import mapboxgl, { type GeoJSONSource, type Map as MapboxMap } from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import {
  buildCameraTrack,
  cameraAtProgress,
  ROUTE_PADDING,
  sampleIndex,
  type LatLng,
} from "./data";

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

/** Deterministic Mapbox plate: the full route sits faint under a cobalt trace
 *  that draws with `progress`, while the camera follows the head of that trace
 *  — see `buildCameraTrack` for how it stays framed. */
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
  const { delayRender, continueRender } = useDelayRender();
  const [map, setMap] = useState<MapboxMap | null>(null);
  const [loadingHandle] = useState(() => delayRender("Loading Mapbox map"));
  // A headless render and the <Player> want opposite things from this map — see
  // the two effects below. Everything that differs hangs off this one flag.
  const { isRendering } = getRemotionEnvironment();

  const coords = points.map(toLngLat);
  // Pure geometry — the path exists before the first tile does, so the map can
  // open on the right shot instead of easing into one once the style lands.
  const track = useMemo(
    () => buildCameraTrack(points, { width, height, padding: ROUTE_PADDING }),
    [points, width, height],
  );

  useEffect(() => {
    if (!containerRef.current) return;

    let disposed = false;
    const opening = cameraAtProgress(track, progress);

    const mapInstance = new mapboxgl.Map({
      accessToken: token,
      container: containerRef.current,
      style: "mapbox://styles/mapbox/dark-v11",
      center: opening?.center ?? coords[0],
      zoom: opening?.zoom ?? 13,
      interactive: false,
      // Attribution is rendered by the composition as story-legible text.
      attributionControl: false,
      fadeDuration: 0,
      preserveDrawingBuffer: true,
    });

    mapInstance.on("load", () => {
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

      mapInstance.once("idle", () => {
        if (disposed) return;
        setMap(mapInstance);
        continueRender(loadingHandle);
      });
    });

    return () => {
      // Remotion keeps the tree mounted for the whole of a headless render, so
      // this only fires under the <Player> — and there an undisposed map is a
      // leaked WebGL context per run plus, under StrictMode's double-mount, a
      // second map stacked in the same container. Both maps load in parallel,
      // whichever idled last won `setMap`, and when that was the hidden one the
      // runner dot sat frozen while the player played.
      if (isRendering) return;
      disposed = true;
      mapInstance.remove();
    };
    // The map is built once per mount; RunMap is keyed by activity upstream.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [continueRender, isRendering, loadingHandle, token]);

  useEffect(() => {
    if (!map) return;

    const idx = sampleIndex(coords.length, progress);
    const trace = map.getSource("route-trace") as GeoJSONSource | undefined;
    const runner = map.getSource("runner-marker") as GeoJSONSource | undefined;
    trace?.setData(lineString(coords.slice(0, Math.max(idx + 1, 2))));
    runner?.setData(point(coords[idx]));

    // The camera is framed on the same drawn prefix, so the dot it is tracking
    // cannot walk off the plate.
    const camera = cameraAtProgress(track, progress);
    if (camera) map.jumpTo(camera);

    // Holding the frame until the map settles is what makes a headless render
    // deterministic. The <Player> can't wait — delayRender() is inert there and
    // playback runs on regardless — and a moving camera keeps requesting tiles,
    // so one `once("idle")` per frame queues up faster than Mapbox drains it.
    // Push the frame and let the next one land instead.
    if (isRendering) {
      const handle = delayRender("Rendering Mapbox frame");
      map.once("idle", () => continueRender(handle));
    }
    // Force a repaint even when the camera is unchanged between frames.
    map.triggerRepaint();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [continueRender, delayRender, isRendering, map, progress, track]);

  return (
    <AbsoluteFill>
      <div ref={containerRef} style={{ width, height, position: "absolute" }} />
    </AbsoluteFill>
  );
}
