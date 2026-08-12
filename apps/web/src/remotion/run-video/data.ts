import type { Run, RunStreams } from "@/api";

// Story format: 9:16 at 30fps, 20 seconds.
export const FPS = 30;
export const VIDEO_WIDTH = 1080;
export const VIDEO_HEIGHT = 1920;
export const DURATION_IN_FRAMES = 20 * FPS;

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/* ---- Chapters ----------------------------------------------------------- *
 * The replay is a four-act film, not a single shot: a title card, the route
 * drawing under live metrics, the effort read (heart rate and splits), and the
 * shareable summary. Boundaries are fractions of the whole so the timeline can
 * be retimed in one place — the player's chapter bar reads the same table.    */

export type ChapterId = "title" | "route" | "effort" | "summary";

export interface Chapter {
  id: ChapterId;
  /** Shown under the player's scrubber, e.g. "02 · ROUTE". */
  label: string;
  /** Fractions of the whole video, 0–1. */
  start: number;
  end: number;
}

export const CHAPTERS: readonly Chapter[] = [
  { id: "title", label: "01 · TITLE", start: 0, end: 0.1 },
  { id: "route", label: "02 · ROUTE", start: 0.1, end: 0.66 },
  { id: "effort", label: "03 · EFFORT", start: 0.66, end: 0.85 },
  { id: "summary", label: "04 · SUMMARY", start: 0.85, end: 1 },
];

/** The chapter containing `progress` (0–1); the last one at and past the end. */
export function chapterAtProgress(progress: number): Chapter {
  const p = clamp01(progress);
  return CHAPTERS.find((c) => p < c.end) ?? CHAPTERS[CHAPTERS.length - 1];
}

/** How far `progress` has moved through `chapter`, as 0–1. Drives the segmented
 *  chapter bar: chapters behind read 1, chapters ahead read 0. */
export function chapterProgress(chapter: Chapter, progress: number): number {
  return clamp01((clamp01(progress) - chapter.start) / (chapter.end - chapter.start));
}

/** A trapezoid envelope over the timeline: 0 before `from`, ramping to 1 by
 *  `hold`, held until `release`, back to 0 at `to`. Chapters overlap on these,
 *  so one is always dissolving into the next rather than cutting. */
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

// The route draws inside the route chapter, finishing before the chapter ends so
// the completed trace holds for a beat under the final live numbers.
export const DRAW_START = Math.round(0.13 * DURATION_IN_FRAMES);
export const DRAW_END = Math.round(0.63 * DURATION_IN_FRAMES);
// A whole run is compressed into the draw, so one video frame steps over many
// stream samples. Reading a single sample makes the instantaneous channels
// (pace, heart rate) jump between neighbouring frames; averaging this much
// video time's worth of samples into each frame settles them.
export const SMOOTHING_SECONDS = 0.5;

/** Strava streams deliver [latitude, longitude] pairs. */
export type LatLng = number[];

/** Map a 0–1 progress onto an index into a stream of `length` samples. */
export function sampleIndex(length: number, progress: number): number {
  if (length <= 0) return 0;
  return Math.min(length - 1, Math.floor(clamp01(progress) * (length - 1)));
}

export function formatKm(meters: number): string {
  return (meters / 1000).toFixed(2);
}

/** 3723 -> "1:02:03", 754 -> "12:34" */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;
  const mm = hours > 0 ? String(minutes).padStart(2, "0") : String(minutes);
  const ss = String(seconds).padStart(2, "0");
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Seconds-per-km -> "5:12". Returns "–:––" when pace is unknown. */
export function formatPace(secondsPerKm: number | null): string {
  if (secondsPerKm == null || !Number.isFinite(secondsPerKm) || secondsPerKm <= 0) {
    return "–:––";
  }
  const s = Math.round(secondsPerKm);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** "SAT · AUG 9 · 7:12 AM" — start_date_local carries the local clock with a
 *  Z suffix, so format it in UTC to preserve the athlete's wall time. */
export function formatStartDate(activity: Run): string {
  const date = new Date(activity.start_date_local);
  if (Number.isNaN(date.getTime())) return "";
  const day = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    timeZone: "UTC",
  }).format(date);
  const monthDay = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
  const time = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(date);
  return `${day} · ${monthDay} · ${time}`.toUpperCase();
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
  activity: Run,
  streams: RunStreams,
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
      heartrate: activity.average_heartrate ? Math.round(activity.average_heartrate) : null,
      elevationGainMeters: activity.total_elevation_gain * p,
    };
  }

  const idx = sampleIndex(sampleCount, p);
  const halfWidth = smoothingHalfWidth(sampleCount, fps);
  const velocity = windowMean(streams.velocity_smooth?.data, idx, halfWidth);
  const heartrate =
    windowMean(streams.heartrate?.data, idx, halfWidth) ?? activity.average_heartrate;
  return {
    distanceMeters: distance?.[idx] ?? activity.distance * p,
    elapsedSeconds: time?.[idx] ?? activity.moving_time * p,
    // Standing still produces absurd instantaneous paces — fall back to average.
    paceSecondsPerKm: velocity && velocity > 0.5 ? 1000 / velocity : averagePace,
    heartrate: heartrate ? Math.round(heartrate) : null,
    elevationGainMeters: activity.total_elevation_gain * p,
  };
}

/* ---- Effort ------------------------------------------------------------- *
 * What the effort chapter charts: one channel plotted as a sparkline, and the
 * run's splits as a bar per segment. Both are pure geometry over the streams —
 * the chapter component only positions and paints them.                       */

export interface Sparkline {
  /** An SVG path laid out in the `width` × `height` box asked for. */
  d: string;
  /** Its length, so the same path can draw on with a stroke dash offset. */
  length: number;
  min: number;
  max: number;
}

/** Fraction of the plot height kept clear above and below the trace, so the
 *  peak of a run reads as a peak instead of grazing the ceiling. */
const SPARKLINE_HEADROOM = 0.08;

/** Downsample a stream to `samples` bucket means and lay it out as a polyline.
 *  Null when there is nothing plottable — a stream that is missing, too short,
 *  or entirely flat has no shape to show, and a dead-flat line reads as broken.  */
export function buildSparkline(
  data: readonly number[] | undefined,
  width: number,
  height: number,
  samples = 56,
): Sparkline | null {
  const finite = data?.filter((v) => Number.isFinite(v)) ?? [];
  if (finite.length < 2 || samples < 2) return null;

  const buckets: number[] = [];
  for (let i = 0; i < samples; i += 1) {
    const from = Math.floor((i * finite.length) / samples);
    const to = Math.max(from + 1, Math.floor(((i + 1) * finite.length) / samples));
    let sum = 0;
    for (let j = from; j < to; j += 1) sum += finite[j];
    buckets.push(sum / (to - from));
  }

  const min = Math.min(...buckets);
  const max = Math.max(...buckets);
  if (max - min < 1e-9) return null;

  const pad = (max - min) * SPARKLINE_HEADROOM;
  const lo = min - pad;
  const span = max - min + 2 * pad;

  const points = buckets.map((v, i): [number, number] => [
    (i / (samples - 1)) * width,
    height - ((v - lo) / span) * height,
  ]);

  let length = 0;
  for (let i = 1; i < points.length; i += 1) {
    length += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
  }

  return {
    d: points
      .map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`)
      .join(" "),
    length,
    min,
    max,
  };
}

export interface Split {
  /** Cumulative kilometres at the end of the segment — "1", "2", "5", "10". */
  label: string;
  paceSecondsPerKm: number | null;
  /** 0–1 against the fastest split, which reads 1. Sizes the bar. */
  weight: number;
}

/** Beyond this the rows stop being readable at 9:16, so a long run is grouped
 *  into wider segments rather than scrolled or truncated. */
export const MAX_SPLIT_ROWS = 8;

/** A trailing segment shorter than this fraction of a full one is absorbed into
 *  the one before it — a 60m "split" is noise, and its pace is wild. */
const MIN_TRAILING_SPLIT = 0.25;

/** Seconds elapsed at `metres` into the run. Interpolated off the distance and
 *  time streams; falls back to the run's average speed without them. */
function elapsedAtDistance(activity: Run, streams: RunStreams, metres: number): number {
  const distance = streams.distance?.data;
  const time = streams.time?.data;
  if (!distance || !time || distance.length < 2 || time.length < distance.length) {
    return activity.distance > 0
      ? (metres / activity.distance) * activity.moving_time
      : 0;
  }

  // The distance stream is monotonic, so the first sample at or past the target
  // brackets it with the one before.
  let i = 0;
  while (i < distance.length && distance[i] < metres) i += 1;
  if (i === 0) return time[0];
  if (i >= distance.length) return time[time.length - 1];

  const span = distance[i] - distance[i - 1];
  const f = span > 0 ? (metres - distance[i - 1]) / span : 0;
  return time[i - 1] + (time[i] - time[i - 1]) * f;
}

/** The run cut into at most `maxRows` equal-distance segments, each with the
 *  pace actually run over it. Kilometre splits for anything up to `maxRows` km;
 *  longer runs step in whole kilometres so the labels stay round numbers. */
export function buildSplits(
  activity: Run,
  streams: RunStreams,
  maxRows: number = MAX_SPLIT_ROWS,
): Split[] {
  const totalKm = activity.distance / 1000;
  // Under two kilometres there is no split to compare against another.
  if (!Number.isFinite(totalKm) || totalKm < 2 || maxRows < 1) return [];

  const stepKm = Math.max(1, Math.ceil(Math.floor(totalKm) / maxRows));

  const ends: number[] = [];
  for (let km = stepKm; km < totalKm; km += stepKm) ends.push(km);
  const trailing = totalKm - (ends[ends.length - 1] ?? 0);
  if (ends.length === 0 || trailing >= stepKm * MIN_TRAILING_SPLIT) {
    ends.push(totalKm);
  } else {
    ends[ends.length - 1] = totalKm;
  }
  // Rounding the step up can leave one row over the budget; the overflow is
  // always the trailing partial, so fold it into the segment before it.
  if (ends.length > maxRows) ends.splice(ends.length - 2, 1);

  const rows = ends.map((endKm, i) => {
    const startKm = i === 0 ? 0 : ends[i - 1];
    const seconds =
      elapsedAtDistance(activity, streams, endKm * 1000) -
      elapsedAtDistance(activity, streams, startKm * 1000);
    const km = endKm - startKm;
    const pace = km > 0 && seconds > 0 ? seconds / km : null;
    const whole = Math.round(endKm);
    return {
      label: Math.abs(endKm - whole) < 0.05 ? String(whole) : endKm.toFixed(1),
      paceSecondsPerKm: pace,
      weight: 1,
    };
  });

  const paces = rows
    .map((r) => r.paceSecondsPerKm)
    .filter((p): p is number => p != null);
  const fastest = paces.length > 0 ? Math.min(...paces) : null;

  return rows.map((row) => ({
    ...row,
    weight:
      fastest != null && row.paceSecondsPerKm != null
        ? fastest / row.paceSecondsPerKm
        : 1,
  }));
}

export interface RoutePadding {
  top: number;
  right: number;
  bottom: number;
  left: number;
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

/** Project [lat, lng] points onto composition pixels (equirectangular with
 *  latitude correction — plenty accurate at running distances). Used by the
 *  no-Mapbox-token fallback canvas. */
export function projectRoute(
  points: LatLng[],
  width: number,
  height: number,
  padding: RoutePadding,
): [number, number][] {
  if (points.length === 0) return [];
  const lats = points.map((p) => p[0]);
  const lngs = points.map((p) => p[1]);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const kx = Math.cos(((minLat + maxLat) / 2) * (Math.PI / 180));

  const spanX = Math.max((maxLng - minLng) * kx, 1e-9);
  const spanY = Math.max(maxLat - minLat, 1e-9);
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const scale = Math.min(innerWidth / spanX, innerHeight / spanY);

  const offsetX = padding.left + (innerWidth - spanX * scale) / 2;
  const offsetY = padding.top + (innerHeight - spanY * scale) / 2;
  return points.map(([lat, lng]) => [
    offsetX + (lng - minLng) * kx * scale,
    offsetY + (maxLat - lat) * scale,
  ]);
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
 *  The runner dot is 40px across, and a dot grazing the boundary reads as one
 *  about to leave — the trace behind it may touch, the head may not. */
export const RUNNER_CLEARANCE = 48;

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
  const s = Math.sin((Math.min(85.051129, Math.max(-85.051129, lat)) * Math.PI) / 180);
  return [(lng + 180) / 360, 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)];
}

/** Inverse of `toMercator`, in Mapbox's [lng, lat] order. */
export function fromMercator([x, y]: Mercator): [number, number] {
  const lat =
    (2 * Math.atan(Math.exp((0.5 - y) * 2 * Math.PI)) - Math.PI / 2) * (180 / Math.PI);
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
    box.maxX > box.minX ? safeWidth(viewport) / (box.maxX - box.minX) : Infinity,
    box.maxY > box.minY ? safeHeight(viewport) / (box.maxY - box.minY) : Infinity,
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
const cameraAt = (anchor: Mercator, scale: number, viewport: Viewport): Camera => {
  const [offsetX, offsetY] = safeBoxOffset(viewport);
  return {
    center: fromMercator([anchor[0] - offsetX / scale, anchor[1] - offsetY / scale]),
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

  const anchors = boxes.map(
    (b): Mercator => [(b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2],
  );
  // Averaged as zoom, not as scale: halfway between z12 and z16 should read as
  // z14, not as the shot that is 8× closer than the wide one.
  const zooms = boxes.map((b) => Math.log2(Math.min(fitScale(b, viewport), maxScale)));

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
export function cameraAtProgress(track: Camera[], progress: number): Camera | null {
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
