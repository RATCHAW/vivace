import type { LatLng, RoutePadding } from "../../core/geo";
import { getTemplate } from "../../registry";
import type { VideoActivity, VideoStreams } from "../../types";

// The formatters and the projection are shared with every other template now;
// they are re-exported here so the replay's own maths — and its tests — still
// read as one module.
export {
  formatClock,
  formatKm,
  formatPace,
  formatStartDate,
} from "../../core/format";
export { projectRoute, type LatLng, type RoutePadding } from "../../core/geo";

// Story format: 9:16 at 30fps, 20 seconds. The registry is the source — it is
// what the <Composition>, the browser's <Player> and the Lambda render all read
// — and these are the names the composition's own maths is written in.
const TEMPLATE = getTemplate("run-video");
export const FPS = TEMPLATE.fps;
export const VIDEO_WIDTH = TEMPLATE.width;
export const VIDEO_HEIGHT = TEMPLATE.height;
export const DURATION_IN_FRAMES = TEMPLATE.durationInFrames;

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/** A trapezoid envelope over the timeline: 0 before `from`, ramping to 1 by
 *  `hold`, held until `release`, back to 0 at `to`. The overlay rides one of
 *  these, so it dissolves in over the opening beat rather than cutting. */
export function fadeAt(
  progress: number,
  from: number,
  hold: number,
  release: number,
  to: number,
): number {
  if (progress <= from || progress >= to) return 0;
  if (progress < hold) return (progress - from) / (hold - from);
  if (progress <= release) return 1;
  return 1 - (progress - release) / (to - release);
}

// The draw is the whole film. It opens holding on the start line for a beat and
// finishes early, so the completed route holds under the final live numbers —
// the frame a story is paused on.
export const DRAW_START = Math.round(0.06 * DURATION_IN_FRAMES);
export const DRAW_END = Math.round(0.92 * DURATION_IN_FRAMES);
// A whole run is compressed into the draw, so one video frame steps over many
// stream samples. Reading a single sample makes the instantaneous channels
// (pace, heart rate) jump between neighbouring frames; averaging this much
// video time's worth of samples into each frame settles them.
export const SMOOTHING_SECONDS = 0.5;

/** Map a 0–1 progress onto an index into a stream of `length` samples. */
export function sampleIndex(length: number, progress: number): number {
  if (length <= 0) return 0;
  return Math.min(length - 1, Math.floor(clamp01(progress) * (length - 1)));
}

/** Mean of `data` over `centre ± halfWidth`, clamped to the stream bounds.
 *  Null when the window holds nothing finite to average. */
export function windowMean(
  data: readonly number[] | undefined,
  centre: number,
  halfWidth: number,
): number | null {
  if (!data || data.length === 0) return null;
  const from = Math.max(0, centre - halfWidth);
  const to = Math.min(data.length - 1, centre + halfWidth);
  let sum = 0;
  let count = 0;
  for (let i = from; i <= to; i += 1) {
    const value = data[i];
    if (Number.isFinite(value)) {
      sum += value;
      count += 1;
    }
  }
  return count > 0 ? sum / count : null;
}

/** Half-width, in stream samples, of the moving average that covers
 *  `SMOOTHING_SECONDS` of video. The draw spreads `sampleCount` samples over
 *  `DRAW_END - DRAW_START` frames, which fixes the samples-per-frame rate. */
export function smoothingHalfWidth(sampleCount: number, fps: number): number {
  const drawFrames = DRAW_END - DRAW_START;
  if (drawFrames <= 0) return 0;
  const samplesPerFrame = sampleCount / drawFrames;
  return Math.round((samplesPerFrame * SMOOTHING_SECONDS * fps) / 2);
}

export interface LiveMetrics {
  distanceMeters: number;
  elapsedSeconds: number;
  paceSecondsPerKm: number | null;
  heartrate: number | null;
  elevationGainMeters: number;
}

/** What the overlay shows at a given route progress. Distance and time come
 *  straight off the streams — they only ever climb — while pace and heart rate
 *  are averaged over a half-second window so they read instead of flicker.
 *  Falls back to linearly scaled activity totals when there are no streams. */
export function metricsAtProgress(
  activity: VideoActivity,
  streams: VideoStreams,
  progress: number,
  fps: number = FPS,
): LiveMetrics {
  const p = clamp01(progress);
  const averagePace =
    activity.average_speed > 0 ? 1000 / activity.average_speed : null;

  const time = streams.time?.data;
  const distance = streams.distance?.data;
  const sampleCount = Math.max(time?.length ?? 0, distance?.length ?? 0);

  if (sampleCount < 2) {
    return {
      distanceMeters: activity.distance * p,
      elapsedSeconds: activity.moving_time * p,
      paceSecondsPerKm: averagePace,
      heartrate: activity.average_heartrate
        ? Math.round(activity.average_heartrate)
        : null,
      elevationGainMeters: activity.total_elevation_gain * p,
    };
  }

  const idx = sampleIndex(sampleCount, p);
  const halfWidth = smoothingHalfWidth(sampleCount, fps);
  const velocity = windowMean(streams.velocity_smooth?.data, idx, halfWidth);
  const heartrate =
    windowMean(streams.heartrate?.data, idx, halfWidth) ??
    activity.average_heartrate;
  return {
    distanceMeters: distance?.[idx] ?? activity.distance * p,
    elapsedSeconds: time?.[idx] ?? activity.moving_time * p,
    // Standing still produces absurd instantaneous paces — fall back to average.
    paceSecondsPerKm:
      velocity && velocity > 0.5 ? 1000 / velocity : averagePace,
    heartrate: heartrate ? Math.round(heartrate) : null,
    elevationGainMeters: activity.total_elevation_gain * p,
  };
}

/** The safe box: the title band sits above it, the metrics band below. Whatever
 *  the eye is following — the cobalt trace and the runner dot at its head — is
 *  kept inside it, on the Mapbox camera and on the fallback canvas alike. */
export const ROUTE_PADDING: RoutePadding = {
  top: 480,
  right: 130,
  bottom: 660,
  left: 130,
};

/* ---- Runner marker ------------------------------------------------------ */

/** Half the plain runner dot: a 13px circle under a 7px stroke. */
export const RUNNER_DOT_RADIUS = 20;

/** The avatar puck's diameter. A dot only has to be seen; a face has to be
 *  recognised — so it is three times the dot, and still a ninth of the frame's
 *  width, which is what keeps it riding the route rather than covering it. */
export const RUNNER_AVATAR_SIZE = 120;

/** The cobalt ring around the picture, in the same ink as the trace it heads. */
export const RUNNER_AVATAR_RING = 8;

/** Room between the marker's edge and the safe box. */
const RUNNER_MARGIN = 28;

/** Strava hands back a bare `"avatar/athlete/large.png"` — a sprite name, not a
 *  URL — for athletes who never set a picture, and an empty string is how the
 *  composition is told to keep the plain dot. Anything that isn't an absolute
 *  http(s) URL is therefore no avatar at all. */
export function avatarSource(profile: string | null | undefined): string {
  return profile && /^https?:\/\//.test(profile) ? profile : "";
}

/* ---- Map camera --------------------------------------------------------- */

/** Mapbox GL draws 512px tiles, so the whole world is 512px across at zoom 0
 *  and `512 * 2 ** zoom` — the *scale* below — at any other zoom. */
const WORLD_SIZE_AT_ZOOM_0 = 512;

/** Tightest shot the camera will take: about 900m across on a 1080px story.
 *  Closer than this and the opening frame, which holds a single GPS point,
 *  frames a doorway. */
export const MAX_CAMERA_ZOOM = 16;

/** Keyframes per camera track. The draw runs `DRAW_END - DRAW_START` frames, so
 *  this is a keyframe every frame or two — dense enough that reading between
 *  them is invisible. */
export const CAMERA_TRACK_SAMPLES = 240;

/** Half-width, in keyframes, of the low-pass filter applied to a track. */
export const CAMERA_SMOOTHING_SAMPLES = 12;

/** Pixels of safe box the head of the trace is never allowed to sit within.
 *  A marker grazing the boundary reads as one about to leave — the trace behind
 *  it may touch, the head may not. */
export const RUNNER_CLEARANCE = RUNNER_DOT_RADIUS + RUNNER_MARGIN;

/** The same, for the avatar puck: three times the dot needs its own berth, or
 *  the shot the dot fitted crops the athlete's face at the frame's edge. */
export const RUNNER_AVATAR_CLEARANCE = RUNNER_AVATAR_SIZE / 2 + RUNNER_MARGIN;

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

/** A camera path for the draw. At every point of it, everything the trace has
 *  drawn — and the runner dot at its head — sits inside the safe box. Framing
 *  the *drawn* part rather than the whole route is what makes it a follow shot
 *  instead of a de-zoom: it opens tight on the start line, widens only as far
 *  as the run has actually gone, and settles on the whole route at progress 1.
 *
 *  The raw fit alone would kink — a bounding box that stops growing north and
 *  starts growing east swings the camera without warning — so the path is
 *  sampled into keyframes and low-pass filtered, with the window closing to
 *  nothing at both ends to leave the opening and closing shots exact. Filtering
 *  moves the anchor off the fit, so each keyframe's scale is then capped by what
 *  its filtered anchor can actually hold: the filter may loosen a shot, never
 *  crop it. Each keyframe holds the *next* one's box too, which is what keeps
 *  the frames read between keyframes inside the box as well, and the shot only
 *  ever widens. */
export function buildCameraTrack(
  points: LatLng[],
  viewport: Viewport,
  {
    samples = CAMERA_TRACK_SAMPLES,
    smoothing = CAMERA_SMOOTHING_SAMPLES,
    maxZoom = MAX_CAMERA_ZOOM,
    clearance = RUNNER_CLEARANCE,
  }: {
    samples?: number;
    smoothing?: number;
    maxZoom?: number;
    clearance?: number;
  } = {},
): Camera[] {
  if (points.length === 0) return [];
  const mercator = points.map(toMercator);
  const count = Math.max(2, Math.floor(samples));
  const maxScale = WORLD_SIZE_AT_ZOOM_0 * 2 ** maxZoom;

  // The drawn part only ever grows, so one walk along the route fills every box.
  const boxes: MercatorBox[] = [];
  const heads: Mercator[] = [];
  const box: MercatorBox = {
    minX: mercator[0][0],
    minY: mercator[0][1],
    maxX: mercator[0][0],
    maxY: mercator[0][1],
  };
  let drawn = 0;
  for (let i = 0; i < count; i += 1) {
    const head = sampleIndex(points.length, i / (count - 1));
    for (; drawn <= head; drawn += 1) {
      const [x, y] = mercator[drawn];
      box.minX = Math.min(box.minX, x);
      box.maxX = Math.max(box.maxX, x);
      box.minY = Math.min(box.minY, y);
      box.maxY = Math.max(box.maxY, y);
    }
    boxes.push({ ...box });
    heads.push(mercator[head]);
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
    const [headX, headY] = heads[ahead];
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
        containScale(
          { minX: headX, maxX: headX, minY: headY, maxY: headY },
          anchor,
          viewport,
          clearance,
        ),
      ),
    );
    track.push(cameraAt(anchor, widest, viewport));
  }
  return track;
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
