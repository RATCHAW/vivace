import { StrictMode, type ReactElement } from "react";
import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** Minimal stand-in for a Mapbox GL map: records what the component asks of it
 *  and lets the test drive `load` / `idle` by hand, the way the network would. */
const { instances, FakeMap } = vi.hoisted(() => {
  const instances: FakeMap[] = [];

  class FakeMap {
    handlers: Record<string, Array<() => void>> = {};
    onceHandlers: Record<string, Array<() => void>> = {};
    sources: Record<string, { data: unknown }> = {};
    layout: Record<string, Record<string, unknown>> = {};
    cameras: Array<{ center: [number, number]; zoom: number }> = [];
    removed = false;

    constructor(readonly options: { center: [number, number]; zoom: number }) {
      instances.push(this);
      this.cameras.push({ center: options.center, zoom: options.zoom });
    }

    on(event: string, cb: () => void) {
      (this.handlers[event] ??= []).push(cb);
    }

    once(event: string, cb: () => void) {
      (this.onceHandlers[event] ??= []).push(cb);
    }

    emit(event: string) {
      const once = this.onceHandlers[event] ?? [];
      this.onceHandlers[event] = [];
      for (const cb of [...(this.handlers[event] ?? []), ...once]) cb();
    }

    addSource(id: string, source: { data: unknown }) {
      this.sources[id] = { data: source.data };
    }

    addLayer() {}

    getSource(id: string) {
      const source = this.sources[id];
      if (!source) return undefined;
      return {
        setData: (data: unknown) => {
          source.data = data;
        },
      };
    }

    setLayoutProperty(layer: string, key: string, value: unknown) {
      (this.layout[layer] ??= {})[key] = value;
    }

    jumpTo(camera: { center: [number, number]; zoom: number }) {
      this.cameras.push(camera);
    }

    triggerRepaint() {}

    remove() {
      this.removed = true;
    }
  }

  return { instances, FakeMap };
});

vi.mock("mapbox-gl", () => ({ default: { Map: FakeMap } }));

const {
  MAX_CAMERA_ZOOM,
  projectPoint,
  ROUTE_PADDING,
  RUNNER_AVATAR_CLEARANCE,
  RUNNER_CLEARANCE,
  sampleIndex,
} = await import("./data");
const { RunMap } = await import("./RunMap");

const WIDTH = 1080;
const HEIGHT = 1920;
const AVATAR =
  "https://dgalywyr863hv.cloudfront.net/pictures/athletes/1/large.jpg";

// A short route that turns, so following it is not the same as pointing at it.
const POINTS = [
  [47.37, 8.54],
  [47.39, 8.54],
  [47.39, 8.57],
  [47.37, 8.57],
];

const live = () => instances.filter((map) => !map.removed);

const mapAt = (progress: number, avatarUrl = "") => (
  <RunMap
    points={POINTS}
    progress={progress}
    token="pk.test"
    width={WIDTH}
    height={HEIGHT}
    avatarUrl={avatarUrl}
  />
);

const strict = (node: ReactElement) => <StrictMode>{node}</StrictMode>;

/** The progresses at which the head of the trace lands outside the safe box,
 *  once the marker riding it is given the clearance its size demands. */
function strandedFrames(
  rerender: (node: ReactElement) => void,
  map: InstanceType<typeof FakeMap>,
  avatarUrl: string,
  clearance: number,
): number[] {
  return [0.25, 0.5, 0.75, 1].filter((progress) => {
    act(() => {
      rerender(strict(mapAt(progress, avatarUrl)));
    });
    const camera = map.cameras[map.cameras.length - 1];
    const runner = POINTS[sampleIndex(POINTS.length, progress)];
    const [x, y] = projectPoint(runner, camera, {
      width: WIDTH,
      height: HEIGHT,
    });
    return (
      x < ROUTE_PADDING.left + clearance - 1 ||
      x > WIDTH - ROUTE_PADDING.right - clearance + 1 ||
      y < ROUTE_PADDING.top + clearance - 1 ||
      y > HEIGHT - ROUTE_PADDING.bottom - clearance + 1
    );
  });
}

/** Walk a freshly-constructed map through style load and first paint. */
function settle(map: InstanceType<typeof FakeMap>) {
  act(() => {
    map.emit("load");
  });
  act(() => {
    map.emit("idle");
  });
}

beforeEach(() => {
  instances.length = 0;
});

afterEach(() => {
  vi.unstubAllEnvs();
});

// Remotion reads NODE_ENV to decide whether it is rendering, and vitest sets it
// to "test" — so the <Player> path has to be asked for explicitly.
describe("RunMap in the Player", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "development");
  });

  it("keeps a single live map through StrictMode's double mount", () => {
    render(strict(mapAt(0)));

    // StrictMode mounts, tears down and remounts. Leaving the first map running
    // stacks two canvases in one container, and whichever loads last wins the
    // state — half the time that was the one nobody can see.
    expect(live()).toHaveLength(1);
  });

  it("moves the runner dot on the map the player is showing", () => {
    const { rerender } = render(strict(mapAt(0)));
    const [map] = live();
    settle(map);

    act(() => {
      rerender(strict(mapAt(1)));
    });

    // Strava streams are [lat, lng]; Mapbox wants [lng, lat].
    expect(map.sources["runner-marker"].data).toMatchObject({
      geometry: { coordinates: [8.57, 47.37] },
    });
    expect(map.sources["route-trace"].data).toMatchObject({
      geometry: { coordinates: POINTS.map(([lat, lng]) => [lng, lat]) },
    });
  });

  it("frames the runner instead of easing out to the whole route", () => {
    const { rerender } = render(strict(mapAt(0)));
    const [map] = live();
    settle(map);

    // The opening shot is the tightest one, on the start line.
    expect(map.cameras[0].zoom).toBe(MAX_CAMERA_ZOOM);

    // The old camera ran a straight line from the start point to the whole
    // route's fit, so a route that turned left the dot outside the frame.
    expect(strandedFrames(rerender, map, "", RUNNER_CLEARANCE)).toEqual([]);
  });

  it("swaps the dot for the athlete's avatar and widens the shot to hold it", () => {
    const { container, rerender } = render(strict(mapAt(0, AVATAR)));
    const [map] = live();
    settle(map);

    act(() => {
      rerender(strict(mapAt(0.5, AVATAR)));
    });

    // Two runners on one map: the Mapbox dot goes out as the puck comes in.
    expect(map.layout["runner-marker-dot"]).toMatchObject({
      visibility: "none",
    });

    // The puck is a DOM layer, so it has to be projected onto the plate with
    // the same camera Mapbox was just jumped to — otherwise it drifts off the
    // head of the trace it is supposed to be leading.
    const camera = map.cameras[map.cameras.length - 1];
    const runner = POINTS[sampleIndex(POINTS.length, 0.5)];
    const [x, y] = projectPoint(runner, camera, {
      width: WIDTH,
      height: HEIGHT,
    });
    const avatar = container.querySelector("img");
    expect(avatar?.src).toBe(AVATAR);
    expect(Math.round(parseFloat(avatar?.style.left ?? "NaN"))).toBe(
      Math.round(x),
    );
    expect(Math.round(parseFloat(avatar?.style.top ?? "NaN"))).toBe(
      Math.round(y),
    );

    // A puck framed like a dot would have the athlete's face cropped by the
    // edge of the frame, so the camera owes it a wider berth.
    expect(
      strandedFrames(rerender, map, AVATAR, RUNNER_AVATAR_CLEARANCE),
    ).toEqual([]);
  });

  it("does not gate playback on the map going idle", () => {
    const { rerender } = render(strict(mapAt(0)));
    const [map] = live();
    settle(map);

    act(() => {
      rerender(strict(mapAt(0.5)));
    });

    // A per-frame `once("idle")` piles up while the moving camera keeps the map
    // busy — playback never waits for it, so the dot stops tracking.
    expect(map.onceHandlers.idle ?? []).toHaveLength(0);
  });

  it("disposes the map when the player unmounts", () => {
    const { unmount } = render(strict(mapAt(0)));
    settle(live()[0]);

    unmount();

    // Selecting another run remounts the whole composition; without this every
    // click leaks a WebGL context until the browser starts dropping them.
    expect(live()).toHaveLength(0);
  });
});

describe("RunMap during a headless render", () => {
  it("holds each frame until the map settles and keeps the map mounted", () => {
    // No StrictMode here: Remotion's render bundle mounts the tree once.
    const { rerender, unmount } = render(mapAt(0));
    const [map] = live();
    settle(map);
    // Frame 0 opens its own gate as soon as the map lands in state; the
    // renderer paints and the map idles before it asks for the next frame.
    act(() => {
      map.emit("idle");
    });

    act(() => {
      rerender(mapAt(0.5));
    });

    expect(map.onceHandlers.idle ?? []).toHaveLength(1);
    act(() => {
      map.emit("idle");
    });

    // Removing the map mid-render would interfere with Remotion's lifecycle.
    unmount();
    expect(map.removed).toBe(false);
  });
});
