/**
 * The follow shot: where the camera is, keyframe by keyframe, so that everything
 * drawn so far — and whoever is at the head of it — stays inside the safe box.
 *
 * This moved out of `templates/run-video/data.ts` when the duo replay needed to
 * frame two routes at once. It is the same maths, generalised from one route to
 * a list of them; the replay's own module re-exports the single-route form, so
 * its film is unchanged and its tests still read as the replay's.
 *
 * React-free like the rest of core: it is pure projection, and the tests assert
 * it without rendering a frame.
 */
import type { LatLng, RoutePadding } from "./geo";
import { RUNNER_CLEARANCE } from "./marker";
import { clamp01, sampleIndex } from "./timing";

/** Mapbox GL draws 512px tiles, so the whole world is 512px across at zoom 0
 *  and `512 * 2 ** zoom` — the *scale* below — at any other zoom. */
const WORLD_SIZE_AT_ZOOM_0 = 512;

/** Tightest shot the camera will take: about 900m across on a 1080px story.
 *  Closer than this and the opening frame, which holds a single GPS point,
 *  frames a doorway. */
export const MAX_CAMERA_ZOOM = 16;

/** Keyframes per camera track. A draw of a few hundred frames makes this a
 *  keyframe every frame or two — dense enough that reading between them is
 *  invisible. */
export const CAMERA_TRACK_SAMPLES = 240;

/** Half-width, in keyframes, of the low-pass filter applied to a track. */
export const CAMERA_SMOOTHING_SAMPLES = 12;

export interface Viewport {
  width: number;
  height: number;
  padding: RoutePadding;
}

/** A Mapbox camera. `center` is in Mapbox's [lng, lat] order, not Strava's. */
export interface Camera {
  center: [number, number];
  zoom: number;
}

/** Web Mercator on the unit square. Mapbox's convention: x runs east, y runs
 *  *south*. */
type Mercator = [number, number];

interface MercatorBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** [lat, lng] -> Mercator. Latitude is clamped to the projection's limit. */
export function toMercator([lat, lng]: LatLng): Mercator {
  const s = Math.sin(
    (Math.min(85.051129, Math.max(-85.051129, lat)) * Math.PI) / 180,
  );
  return [(lng + 180) / 360, 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)];
}

/** Inverse of `toMercator`, in Mapbox's [lng, lat] order. */
export function fromMercator([x, y]: Mercator): [number, number] {
  const lat =
    (2 * Math.atan(Math.exp((0.5 - y) * 2 * Math.PI)) - Math.PI / 2) *
    (180 / Math.PI);
  return [x * 360 - 180, lat];
}

const safeWidth = (viewport: Viewport) =>
  viewport.width - viewport.padding.left - viewport.padding.right;

const safeHeight = (viewport: Viewport) =>
  viewport.height - viewport.padding.top - viewport.padding.bottom;

/** Pixels from the viewport's centre to the safe box's centre. The two bands
 *  are not the same height, so what the eye reads as the middle of the shot is
 *  not where Mapbox puts `center`. */
const safeBoxOffset = (viewport: Viewport): [number, number] => [
  (viewport.padding.left - viewport.padding.right) / 2,
  (viewport.padding.top - viewport.padding.bottom) / 2,
];

/** Widest scale that fits `box` in the safe box, framed on the box's centre. */
const fitScale = (box: MercatorBox, viewport: Viewport): number =>
  Math.min(
    box.maxX > box.minX
      ? safeWidth(viewport) / (box.maxX - box.minX)
      : Infinity,
    box.maxY > box.minY
      ? safeHeight(viewport) / (box.maxY - box.minY)
      : Infinity,
  );

/** Widest scale that still holds `box` — `inset` pixels clear of the safe box's
 *  edges — when the shot is anchored somewhere other than the box's centre.
 *  Every side is its own limit, and an anchor three-quarters along the box is
 *  bound by the far one. */
const containScale = (
  box: MercatorBox,
  anchor: Mercator,
  viewport: Viewport,
  inset = 0,
): number => {
  const halfWidth = safeWidth(viewport) / 2 - inset;
  const halfHeight = safeHeight(viewport) / 2 - inset;
  const limits: number[] = [
    [halfWidth, anchor[0] - box.minX],
    [halfWidth, box.maxX - anchor[0]],
    [halfHeight, anchor[1] - box.minY],
    [halfHeight, box.maxY - anchor[1]],
  ]
    .filter(([, reach]) => reach > 0)
    .map(([room, reach]) => room / reach);
  return Math.min(...limits, Infinity);
};

/** The camera that puts `anchor` at the centre of the safe box. */
const cameraAt = (
  anchor: Mercator,
  scale: number,
  viewport: Viewport,
): Camera => {
  const [offsetX, offsetY] = safeBoxOffset(viewport);
  return {
    center: fromMercator([
      anchor[0] - offsetX / scale,
      anchor[1] - offsetY / scale,
    ]),
    zoom: Math.log2(scale / WORLD_SIZE_AT_ZOOM_0),
  };
};

const grow = (box: MercatorBox | null, [x, y]: Mercator): MercatorBox =>
  box
    ? {
        minX: Math.min(box.minX, x),
        maxX: Math.max(box.maxX, x),
        minY: Math.min(box.minY, y),
        maxY: Math.max(box.maxY, y),
      }
    : { minX: x, maxX: x, minY: y, maxY: y };

/** Where a [lat, lng] lands on the composition, in pixels, under `camera` —
 *  the same projection Mapbox applies to a north-up, unpitched map. */
export function projectPoint(
  point: LatLng,
  camera: Camera,
  viewport: Pick<Viewport, "width" | "height">,
): [number, number] {
  const scale = WORLD_SIZE_AT_ZOOM_0 * 2 ** camera.zoom;
  const [x, y] = toMercator(point);
  const [centreX, centreY] = toMercator([camera.center[1], camera.center[0]]);
  return [
    viewport.width / 2 + (x - centreX) * scale,
    viewport.height / 2 + (y - centreY) * scale,
  ];
}

export interface CameraTrackOptions {
  samples?: number;
  smoothing?: number;
  maxZoom?: number;
  /** Pixels of safe box the head of a trace may not sit within. Defaults to the
   *  plain dot's berth; an avatar riding the head is three times the dot and
   *  says so. */
  clearance?: number;
}

/**
 * How many points of each route are on the plate at a 0–1 film progress.
 *
 * One number per route, in the order they were handed over. Zero means the
 * runner has not set off yet: their start marker is still framed — it is drawn
 * from frame one — but nothing owes their dot a gutter, because there is no dot.
 */
export type DrawnAt = (progress: number) => readonly number[];

/**
 * A camera path for the draw, framing every route at once.
 *
 * At every point of it, everything the traces have drawn — and the runners at
 * their heads — sits inside the safe box. Framing the *drawn* part rather than
 * the whole route is what makes it a follow shot instead of a de-zoom: it opens
 * tight on the start line, widens only as far as the run has actually gone, and
 * settles on everything at progress 1.
 *
 * The raw fit alone would kink — a bounding box that stops growing north and
 * starts growing east swings the camera without warning — so the path is
 * sampled into keyframes and low-pass filtered, with the window closing to
 * nothing at both ends to leave the opening and closing shots exact. Filtering
 * moves the anchor off the fit, so each keyframe's scale is then capped by what
 * its filtered anchor can actually hold: the filter may loosen a shot, never
 * crop it. Each keyframe holds the *next* one's box too, which is what keeps
 * the frames read between keyframes inside the box as well, and the shot only
 * ever widens.
 *
 * With two runners it is the union that is framed, which is the whole point of
 * the duo cut: the shot has to widen as they come apart, and a gap you can see
 * opening is the film.
 */
export function buildRoutesCameraTrack(
  routes: readonly LatLng[][],
  drawnAt: DrawnAt,
  viewport: Viewport,
  {
    samples = CAMERA_TRACK_SAMPLES,
    smoothing = CAMERA_SMOOTHING_SAMPLES,
    maxZoom = MAX_CAMERA_ZOOM,
    clearance = RUNNER_CLEARANCE,
  }: CameraTrackOptions = {},
): Camera[] {
  const mercator = routes.map((points) => points.map(toMercator));
  if (mercator.every((points) => points.length === 0)) return [];

  const count = Math.max(2, Math.floor(samples));
  const maxScale = WORLD_SIZE_AT_ZOOM_0 * 2 ** maxZoom;

  // The drawn part only ever grows, so one walk along each route fills every
  // box — the cursors below never go backwards, whatever `drawnAt` says.
  const boxes: MercatorBox[] = [];
  const headBoxes: Array<MercatorBox | null> = [];
  const consumed = mercator.map(() => 0);
  let box: MercatorBox | null = null;

  for (let i = 0; i < count; i += 1) {
    const drawn = drawnAt(i / (count - 1));
    let heads: MercatorBox | null = null;
    for (let r = 0; r < mercator.length; r += 1) {
      const points = mercator[r];
      if (points.length === 0) continue;
      // A runner who hasn't set off is still standing on their start line, and
      // that marker is on the plate from frame one — so the shot holds it.
      const upTo = Math.min(
        points.length,
        Math.max(1, Math.floor(drawn[r] ?? 0)),
      );
      for (; consumed[r] < upTo; consumed[r] += 1) {
        box = grow(box, points[consumed[r]]);
      }
      if ((drawn[r] ?? 0) >= 1) heads = grow(heads, points[upTo - 1]);
    }
    // Unreachable — at least one route has a point, and its first one is always
    // consumed — but the box's type says otherwise and this is cheaper than a
    // cast that would hide a real regression.
    if (!box) return [];
    boxes.push({ ...box });
    headBoxes.push(heads);
  }

  const anchors = boxes.map((b): Mercator => [
    (b.minX + b.maxX) / 2,
    (b.minY + b.maxY) / 2,
  ]);
  // Averaged as zoom, not as scale: halfway between z12 and z16 should read as
  // z14, not as the shot that is 8× closer than the wide one.
  const zooms = boxes.map((b) =>
    Math.log2(Math.min(fitScale(b, viewport), maxScale)),
  );

  const track: Camera[] = [];
  let widest = maxScale;
  for (let i = 0; i < count; i += 1) {
    const half = Math.min(smoothing, i, count - 1 - i);
    let x = 0;
    let y = 0;
    let zoom = 0;
    for (let j = i - half; j <= i + half; j += 1) {
      x += anchors[j][0];
      y += anchors[j][1];
      zoom += zooms[j];
    }
    const window = 2 * half + 1;
    const anchor: Mercator = [x / window, y / window];
    // Holding the *next* keyframe's box, not this one's, is what keeps the
    // frames read between two keyframes inside the safe box as well.
    const ahead = Math.min(i + 1, count - 1);
    const heads = headBoxes[ahead];
    // Never tighter than a shot already taken: a runner rounding a corner back
    // into the middle of the box would otherwise let the camera creep in, and a
    // shot that widens, narrows and widens again reads as hesitation.
    widest = Math.max(
      // Zoom 0 is the whole world: no route needs a wider shot, and the floor
      // keeps a viewport too small for its own padding out of nonsense zooms.
      WORLD_SIZE_AT_ZOOM_0,
      Math.min(
        widest,
        2 ** (zoom / window),
        containScale(boxes[ahead], anchor, viewport),
        // One box over every head on the plate: its extremes are the binding
        // ones, so a single constraint covers both runners.
        heads ? containScale(heads, anchor, viewport, clearance) : Infinity,
      ),
    );
    track.push(cameraAt(anchor, widest, viewport));
  }
  return track;
}

/** The single-route form: one trace, drawn by `progress`. */
export function buildCameraTrack(
  points: LatLng[],
  viewport: Viewport,
  options: CameraTrackOptions = {},
): Camera[] {
  return buildRoutesCameraTrack(
    [points],
    (progress) => [sampleIndex(points.length, progress) + 1],
    viewport,
    options,
  );
}

/** Read a camera track at a 0–1 progress, easing between its keyframes. */
export function cameraAtProgress(
  track: Camera[],
  progress: number,
): Camera | null {
  if (track.length === 0) return null;
  const at = clamp01(progress) * (track.length - 1);
  const index = Math.min(track.length - 1, Math.floor(at));
  const from = track[index];
  const to = track[Math.min(track.length - 1, index + 1)];
  const t = at - index;
  return {
    center: [
      from.center[0] + (to.center[0] - from.center[0]) * t,
      from.center[1] + (to.center[1] - from.center[1]) * t,
    ],
    zoom: from.zoom + (to.zoom - from.zoom) * t,
  };
}
