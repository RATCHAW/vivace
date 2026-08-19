import { type ReactElement } from "react";
import { act, render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RouteLayer } from "./RouteMap";

/** The same stand-in `RunMap.test.tsx` drives, cut down to what a plate asks
 *  of a map: which sources it was built with, and whether it is still alive. */
const { instances, FakeMap } = vi.hoisted(() => {
  const instances: FakeMap[] = [];

  class FakeMap {
    handlers: Record<string, Array<() => void>> = {};
    onceHandlers: Record<string, Array<() => void>> = {};
    sources: Record<string, { data: unknown }> = {};
    removed = false;
    /** How many frames actually reached the map — see the pushing tests. */
    repaints = 0;
    jumps = 0;
    /** What `devicePixelRatio` read while this map sized its canvas, which is
     *  the only moment Mapbox looks at it. */
    pixelRatio: number;

    constructor() {
      this.pixelRatio = window.devicePixelRatio;
      instances.push(this);
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
      if (this.removed) throw new Error("Cannot mutate a removed map");
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

    setLayoutProperty() {}

    jumpTo() {
      this.jumps += 1;
    }

    triggerRepaint() {
      this.repaints += 1;
    }

    remove() {
      this.removed = true;
    }
  }

  return { instances, FakeMap };
});

vi.mock("mapbox-gl", () => ({ default: { Map: FakeMap } }));

// After the mock, like `RunMap.test.tsx`: the component reaches for mapbox-gl
// at module scope, so it must not be imported before the fake is in place.
const { RouteMap } = await import("./RouteMap");

const YOU = [
  [47.37, 8.54],
  [47.39, 8.54],
  [47.39, 8.57],
] as [number, number][];
const THEM = [
  [47.38, 8.55],
  [47.4, 8.55],
  [47.4, 8.58],
] as [number, number][];
// Somebody else entirely, under the same name: the second athlete to accept an
// invitation is the `partner` layer just as the first one was.
const SOMEBODY_ELSE = [
  [40.71, -74.01],
  [40.73, -74.01],
] as [number, number][];

const layer = (key: string, points: [number, number][]): RouteLayer => ({
  key,
  points,
  drawn: points.length,
  color: "#ffffff",
  avatarUrl: "",
});

const plate = (
  layers: RouteLayer[],
  camera = { center: [8.54, 47.37] as [number, number], zoom: 13 },
): ReactElement => (
  <RouteMap
    layers={layers}
    camera={camera}
    token="pk.test"
    width={1080}
    height={1920}
  />
);

/** Run `body` with the window reporting a phone's pixel ratio. */
function atPixelRatio(ratio: number, body: () => void) {
  const own = Object.getOwnPropertyDescriptor(window, "devicePixelRatio");
  Object.defineProperty(window, "devicePixelRatio", {
    configurable: true,
    get: () => ratio,
  });
  try {
    body();
  } finally {
    if (own) Object.defineProperty(window, "devicePixelRatio", own);
    else delete (window as { devicePixelRatio?: number }).devicePixelRatio;
  }
}

const live = () => instances.filter((map) => !map.removed);

/** Walk a freshly-constructed map through style load and first paint. */
function settle() {
  const [map] = live();
  act(() => {
    map.emit("load");
  });
  act(() => {
    map.emit("idle");
  });
  return map;
}

beforeEach(() => {
  instances.length = 0;
  // Remotion reads NODE_ENV to decide whether it is rendering, and vitest sets
  // it to "test" — the <Player> path is the one where the cast can change.
  vi.stubEnv("NODE_ENV", "development");
});

describe("RouteMap when the cast changes", () => {
  it("gives a runner who arrives mid-film their line", () => {
    // An invitation accepted in somebody else's browser reaches this one as a
    // second layer on a plate that is already running. The sources are built
    // once, so without a remount the newcomer is a set of live numbers under a
    // map that never draws them.
    const { rerender } = render(plate([layer("you", YOU)]));
    const solo = settle();
    expect(solo.sources["partner-route-trace"]).toBeUndefined();

    act(() => {
      rerender(plate([layer("you", YOU), layer("partner", THEM)]));
    });
    const duo = settle();

    expect(solo.removed).toBe(true);
    expect(live()).toHaveLength(1);
    expect(duo.sources["partner-route-trace"]).toBeDefined();
    expect(duo.sources["you-route-trace"]).toBeDefined();
  });

  it("takes the line away with the runner", () => {
    const { rerender } = render(
      plate([layer("you", YOU), layer("partner", THEM)]),
    );
    settle();

    act(() => {
      rerender(plate([layer("you", YOU)]));
    });
    const alone = settle();

    // Not merely absent from the props: the trace an athlete removed is off the
    // map, rather than left painted on it at whatever it last drew.
    expect(alone.sources["partner-route-trace"]).toBeUndefined();
    expect(live()).toHaveLength(1);
  });

  it("redraws when one partner is swapped for another", () => {
    // Both are the `partner` layer, so the key alone cannot tell them apart —
    // remove somebody, invite somebody else, and the first one's route would
    // otherwise stay on the plate under the second one's numbers.
    const { rerender } = render(
      plate([layer("you", YOU), layer("partner", THEM)]),
    );
    settle();

    act(() => {
      rerender(plate([layer("you", YOU), layer("partner", SOMEBODY_ELSE)]));
    });
    const swapped = settle();

    expect(swapped.sources["partner-route-full"]).toMatchObject({
      data: {
        geometry: {
          coordinates: SOMEBODY_ELSE.map(([lat, lng]) => [lng, lat]),
        },
      },
    });
  });

  it("keeps one map across the frames of a film", () => {
    // The plate is rebuilt for a change of cast and for nothing else: `drawn`
    // moves on every frame of every film, and a remount there would reload the
    // tiles twenty-five times a second.
    const { rerender } = render(plate([layer("you", YOU)]));
    const map = settle();

    for (const drawn of [1, 2, 3]) {
      act(() => {
        rerender(plate([{ ...layer("you", YOU), drawn }]));
      });
    }

    expect(instances).toHaveLength(1);
    expect(map.removed).toBe(false);
  });
});

describe("RouteMap in the browser", () => {
  it("sizes its canvas in composition pixels, whatever the screen is", () => {
    // The plate is laid out at the film's own size — 1080×1920 — and Mapbox
    // multiplies that by the window's pixel ratio, with no option to cap it. A
    // phone at ratio 3 would build a 3240×5760 drawing buffer, and keep a
    // second one of those because `preserveDrawingBuffer` is on, to fill a
    // picture a few hundred pixels wide. That is what kills the tab.
    atPixelRatio(3, () => {
      render(plate([layer("you", YOU)]));
    });

    expect(instances[0].pixelRatio).toBe(1);
  });

  it("gives the window its pixel ratio back", () => {
    // The cap is a patch over one synchronous constructor call. Anything else
    // that reads the ratio — an avatar picking a source, a test after this one
    // — has to see the real screen again.
    atPixelRatio(3, () => {
      render(plate([layer("you", YOU)]));
      expect(window.devicePixelRatio).toBe(3);
    });
  });

  it("draws a frame once, however many times it is handed over", () => {
    // Every template's draw finishes before its film does, so the closing beats
    // hand the plate the shot it is already showing — a quarter of the duo
    // replay, whose card is a blur over this canvas, so each needless repaint
    // is a full-frame blur recomputed for a picture that did not move.
    const { rerender } = render(plate([{ ...layer("you", YOU), drawn: 2 }]));
    const map = settle();
    const [pushed, jumped] = [map.repaints, map.jumps];

    for (let i = 0; i < 5; i += 1) {
      act(() => {
        rerender(plate([{ ...layer("you", YOU), drawn: 2 }]));
      });
    }

    expect(map.repaints).toBe(pushed);
    expect(map.jumps).toBe(jumped);
  });

  it("still draws a frame that moved", () => {
    const { rerender } = render(plate([{ ...layer("you", YOU), drawn: 2 }]));
    const map = settle();
    const [pushed, jumped] = [map.repaints, map.jumps];

    // The trace grew…
    act(() => {
      rerender(plate([{ ...layer("you", YOU), drawn: 3 }]));
    });
    expect(map.repaints).toBe(pushed + 1);

    // …and, on a held trace, the camera moved.
    act(() => {
      rerender(
        plate([{ ...layer("you", YOU), drawn: 3 }], {
          center: [8.55, 47.38],
          zoom: 14,
        }),
      );
    });
    expect(map.repaints).toBe(pushed + 2);
    expect(map.jumps).toBe(jumped + 2);
  });
});
