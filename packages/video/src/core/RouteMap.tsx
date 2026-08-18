import { useEffect, useRef, useState } from "react";
import { AbsoluteFill, getRemotionEnvironment, useDelayRender } from "remotion";
import mapboxgl, { type GeoJSONSource, type Map as MapboxMap } from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { projectPoint, type Camera } from "./camera";
import type { LatLng } from "./geo";
import { RunnerAvatar } from "./RunnerAvatar";

/** One runner's line on the plate. */
export interface RouteLayer {
  /** Names this runner's Mapbox sources and layers. Stable across frames, and
   *  unique within one plate — two layers sharing a key would draw one trace. */
  key: string;
  points: LatLng[];
  /**
   * How many of those points are drawn on this frame.
   *
   * 0 is a runner who hasn't set off: their start marker is on the plate, but
   * there is no trace behind them and no dot to draw. That is the state the duo
   * replay opens on when one of them started later.
   */
  drawn: number;
  /** The ink of this trace and of the marker at its head. */
  color: string;
  /** The picture riding that head, in place of the dot. Empty keeps the dot. */
  avatarUrl: string;
}

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

/** The prefix of `layer` that is on the plate, in Mapbox's coordinate order.
 *  Two points minimum, because a one-point LineString is not a line — and
 *  nothing at all before the runner has set off. */
function traceCoords(layer: RouteLayer): [number, number][] {
  if (layer.drawn < 1) return [];
  return layer.points.slice(0, Math.max(layer.drawn, 2)).map(toLngLat);
}

/** Where the head of `layer` is, or null before it has one. */
function headPoint(layer: RouteLayer): LatLng | null {
  if (layer.drawn < 1 || layer.points.length === 0) return null;
  return layer.points[Math.min(layer.drawn, layer.points.length) - 1];
}

export interface RouteMapProps {
  layers: RouteLayer[];
  /** The shot this frame is drawn with, from the template's camera track. */
  camera: Camera | null;
  token: string;
  width: number;
  height: number;
}

/**
 * Which routes a plate was built for.
 *
 * The name each runner's sources are under, how many points they have and
 * where those points begin and end — enough to tell one runner's route from
 * another's, and cheap enough to compute on every frame. Two runs that agree on
 * all of it draw the same line, so a collision costs nothing: the plate already
 * shows what it would have been remounted to show.
 */
function plateOf(layers: RouteLayer[]): string {
  return layers
    .map((layer) => {
      const first = layer.points[0];
      const last = layer.points[layer.points.length - 1];
      return `${layer.key}:${layer.points.length}:${first ?? ""}:${last ?? ""}`;
    })
    .join("|");
}

/**
 * The plate, remounted when the runners on it change.
 *
 * `RouteMapPlate` builds its Mapbox sources once, from the frame it opens on,
 * and every frame after that only pushes new data into the sources that already
 * exist — which is what keeps a moving film cheap. It is also why a runner who
 * arrives *later* would otherwise never get a line, and one taken back out
 * would leave theirs painted there for good: an invitation accepted or removed
 * while the player is open changes the cast of a film that is already running.
 *
 * A headless render never sees this — its props are fixed for the whole render,
 * so Lambda mounts exactly one map, as before.
 */
export function RouteMap(props: RouteMapProps) {
  return <RouteMapPlate key={plateOf(props.layers)} {...props} />;
}

/**
 * A deterministic Mapbox plate: every route's full line sits faint under a
 * coloured trace that draws with it, and the camera is handed in rather than
 * worked out here — the template owns the shot, this owns the tiles.
 *
 * The avatar pucks are DOM layers over the plate rather than Mapbox symbols:
 * the images never have to be decoded into the GL context, and a frame can be
 * held on their load.
 *
 * One mount per set of routes: `layers` may change every frame, but the sources
 * are built once, so adding or removing a runner is a remount — see `RouteMap`
 * above, which is what everything else uses.
 */
function RouteMapPlate({
  layers,
  camera,
  token,
  width,
  height,
}: RouteMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { delayRender, continueRender } = useDelayRender();
  const [map, setMap] = useState<MapboxMap | null>(null);
  const [loadingHandle] = useState(() => delayRender("Loading Mapbox map"));
  // A headless render and the <Player> want opposite things from this map — see
  // the two effects below. Everything that differs hangs off this one flag.
  const { isRendering } = getRemotionEnvironment();

  // The map is built once, from what the first frame said; every frame after it
  // updates the sources instead. Held in state rather than read off the props so
  // the builder below can stay out of the per-frame dependency list — and so it
  // is the *opening* frame it builds from, not whichever one it happened to run
  // on.
  const [opening] = useState(() => ({ layers, camera }));

  useEffect(() => {
    if (!containerRef.current) return;

    let disposed = false;
    const first = opening.layers.find((layer) => layer.points.length > 0);

    const mapInstance = new mapboxgl.Map({
      accessToken: token,
      container: containerRef.current,
      style: "mapbox://styles/mapbox/dark-v11",
      center: opening.camera?.center ?? toLngLat(first?.points[0] ?? [0, 0]),
      zoom: opening.camera?.zoom ?? 13,
      interactive: false,
      // Attribution is rendered by the composition as story-legible text.
      attributionControl: false,
      fadeDuration: 0,
      preserveDrawingBuffer: true,
    });

    mapInstance.on("load", () => {
      // A style can finish loading after the player has already switched to a
      // different template. The cleanup below removes the map, but Mapbox may
      // still deliver this queued callback; touching the removed style then
      // throws outside React and takes the whole replay page with it. Mobile is
      // where the race is easiest to hit because style and tile loads are
      // slower. The idle callback already had this guard, and the load callback
      // needs the same one before its first mutation.
      if (disposed) return;

      const drawn = opening.layers.filter((layer) => layer.points.length > 0);

      // Four passes rather than four layers per runner: Mapbox paints in the
      // order things were added, so one runner's faint full route would
      // otherwise sit on top of the other's live trace.
      for (const layer of drawn) {
        mapInstance.addSource(`${layer.key}-route-full`, {
          type: "geojson",
          data: lineString(layer.points.map(toLngLat)),
        });
        mapInstance.addLayer({
          id: `${layer.key}-route-full-line`,
          type: "line",
          source: `${layer.key}-route-full`,
          layout: { "line-cap": "round", "line-join": "round" },
          paint: {
            "line-color": "#ffffff",
            "line-opacity": 0.25,
            "line-width": 5,
          },
        });
      }

      for (const layer of drawn) {
        mapInstance.addSource(`${layer.key}-route-trace`, {
          type: "geojson",
          data: lineString(traceCoords(layer)),
        });
        mapInstance.addLayer({
          id: `${layer.key}-route-trace-line`,
          type: "line",
          source: `${layer.key}-route-trace`,
          layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-color": layer.color, "line-width": 10 },
        });
      }

      for (const layer of drawn) {
        // Deliberately not the runner's colour: a start line is a place, not a
        // person, and two of them a stride apart should read as one spot.
        mapInstance.addSource(`${layer.key}-start-marker`, {
          type: "geojson",
          data: point(toLngLat(layer.points[0])),
        });
        mapInstance.addLayer({
          id: `${layer.key}-start-marker-dot`,
          type: "circle",
          source: `${layer.key}-start-marker`,
          paint: {
            "circle-color": "#000000",
            "circle-radius": 9,
            "circle-stroke-color": "#ffffff",
            "circle-stroke-width": 4,
          },
        });
      }

      for (const layer of drawn) {
        mapInstance.addSource(`${layer.key}-runner-marker`, {
          type: "geojson",
          data: point(toLngLat(headPoint(layer) ?? layer.points[0])),
        });
        mapInstance.addLayer({
          id: `${layer.key}-runner-marker-dot`,
          type: "circle",
          source: `${layer.key}-runner-marker`,
          paint: {
            "circle-color": "#ffffff",
            "circle-radius": 13,
            "circle-stroke-color": layer.color,
            "circle-stroke-width": 7,
          },
        });
      }

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
    // The map is built once per mount; the plate is keyed by activity upstream.
  }, [continueRender, isRendering, loadingHandle, opening, token]);

  // Its own effect, not a branch in the map builder: the option is toggled from
  // the player's panel, where the map is already mounted and must stay that way.
  // A runner who hasn't set off has no dot either — theirs comes back the frame
  // they start.
  const visibility = layers
    .map(
      (layer) =>
        `${layer.key}:${layer.avatarUrl ? 1 : 0}${layer.drawn > 0 ? 1 : 0}`,
    )
    .join("|");
  useEffect(() => {
    if (!map) return;
    for (const layer of layers) {
      if (layer.points.length === 0) continue;
      map.setLayoutProperty(
        `${layer.key}-runner-marker-dot`,
        "visibility",
        layer.avatarUrl || layer.drawn < 1 ? "none" : "visible",
      );
    }
    // Keyed on what actually changes: `layers` is a fresh array every frame.
  }, [layers, map, visibility]);

  useEffect(() => {
    if (!map) return;

    for (const layer of layers) {
      if (layer.points.length === 0) continue;
      const trace = map.getSource(`${layer.key}-route-trace`) as
        GeoJSONSource | undefined;
      const runner = map.getSource(`${layer.key}-runner-marker`) as
        GeoJSONSource | undefined;
      trace?.setData(lineString(traceCoords(layer)));
      const head = headPoint(layer);
      if (head) runner?.setData(point(toLngLat(head)));
    }

    // The camera is framed on the same drawn prefixes, so the dots it is
    // tracking cannot walk off the plate.
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
  }, [continueRender, delayRender, isRendering, map, layers, camera]);

  return (
    <AbsoluteFill>
      <div ref={containerRef} style={{ width, height, position: "absolute" }} />
      {camera &&
        layers.map((layer) => {
          const head = layer.avatarUrl ? headPoint(layer) : null;
          if (!head) return null;
          // The camera the frame is being drawn with projects the runner onto
          // the plate — the same maths the track was built with, so the puck
          // lands exactly where the dot it replaces would have.
          const [x, y] = projectPoint(head, camera, { width, height });
          return (
            <RunnerAvatar
              key={layer.key}
              src={layer.avatarUrl}
              x={x}
              y={y}
              ring={layer.color}
            />
          );
        })}
    </AbsoluteFill>
  );
}
