/**
 * What a route is before it is drawn: cleaned, simplified, projected.
 *
 * `projectRoute` and its padding moved here from `templates/run-video/data.ts`
 * when the poster needed the same projection; that module re-exports both, so
 * the replay's maths is unchanged.
 *
 * React-free — the eligibility rules count points through `cleanRoute`.
 */

/** Strava streams deliver [latitude, longitude] pairs. */
export type LatLng = number[];

export interface RoutePadding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** Metres per degree of latitude. Good to a tenth of a percent at any latitude
 *  a person runs at, and the alternative is a geodesy library on Lambda. */
const METERS_PER_DEGREE = 111_320;

/** East–west scale at this latitude, relative to north–south. */
const lngScale = (lat: number) => Math.cos((lat * Math.PI) / 180);

/**
 * The speed above which a jump between two samples is the receiver, not the
 * athlete.
 *
 * The spec that asked for this said 6 m/s; that is 2:47/km, which is *inside*
 * the marathon world record (5.72 m/s) and would clip the fastest thing a real
 * athlete uploads. 12 m/s — 43 km/h, a hundred metres in 8.3 seconds — is the
 * threshold that only a GPS fix bouncing off a building can cross.
 */
const MAX_PLAUSIBLE_SPEED = 12;

/** A sample gap longer than this is a tunnel or a paused watch, not a stride;
 *  the jump across it is real, so it is kept rather than filtered. */
const DROPOUT_SECONDS = 20;

/**
 * Drop the fixes that didn't happen.
 *
 * A spike is a single sample that implies an impossible speed to reach *and*
 * an impossible speed to come back from — which is what separates it from a
 * dropout, where the athlete really did cross the gap while the watch was deaf.
 * Non-finite coordinates and exact repeats go too: the first crash a projection
 * finds, the second makes the stroke furry for nothing.
 */
export function cleanRoute(
  points: LatLng[],
  timeSeconds?: readonly number[],
): LatLng[] {
  const finite = points
    .map((point, index) => ({ point, index }))
    .filter(
      ({ point }) =>
        point.length >= 2 &&
        Number.isFinite(point[0]) &&
        Number.isFinite(point[1]),
    );
  if (finite.length === 0) return [];

  const at = (i: number) => finite[i].point;
  const gapSeconds = (a: number, b: number) => {
    const t = timeSeconds;
    if (!t) return finite[b].index - finite[a].index; // 1 Hz is Strava's default
    const dt = (t[finite[b].index] ?? 0) - (t[finite[a].index] ?? 0);
    return Number.isFinite(dt) && dt > 0 ? dt : 1;
  };

  const kept: LatLng[] = [at(0)];
  let lastKept = 0;
  for (let i = 1; i < finite.length; i += 1) {
    const previous = at(lastKept);
    const current = at(i);
    const step = distanceMeters(previous, current);
    const seconds = gapSeconds(lastKept, i);
    const implausible =
      seconds < DROPOUT_SECONDS && step / seconds > MAX_PLAUSIBLE_SPEED;

    if (implausible && i + 1 < finite.length) {
      // Only a spike if the route comes straight back: a fix that flies out and
      // stays out is the athlete getting in a car, and we'd rather draw that
      // than silently delete the second half of a run.
      const next = at(i + 1);
      const returns = distanceMeters(previous, next) < step / 2;
      if (returns) continue;
    }
    if (step === 0 && kept.length > 1) continue;

    kept.push(current);
    lastKept = i;
  }
  return kept;
}

/** Great-circle-enough distance between two [lat, lng] points, in metres. */
export function distanceMeters(a: LatLng, b: LatLng): number {
  const dLat = (b[0] - a[0]) * METERS_PER_DEGREE;
  const dLng = (b[1] - a[1]) * METERS_PER_DEGREE * lngScale((a[0] + b[0]) / 2);
  return Math.hypot(dLat, dLng);
}

/** Perpendicular distance from `point` to the segment `a`–`b`, in metres. */
function segmentDistance(point: LatLng, a: LatLng, b: LatLng): number {
  const k = lngScale(a[0]);
  const px = (point[1] - a[1]) * k;
  const py = point[0] - a[0];
  const bx = (b[1] - a[1]) * k;
  const by = b[0] - a[0];
  const lengthSquared = bx * bx + by * by;
  const t =
    lengthSquared === 0
      ? 0
      : Math.max(0, Math.min(1, (px * bx + py * by) / lengthSquared));
  return Math.hypot(px - bx * t, py - by * t) * METERS_PER_DEGREE;
}

/**
 * Douglas–Peucker: keep the points that carry the shape, in metres of tolerance.
 *
 * Raw GPS at 1 Hz gives a 10 km run ~6000 points, and a stroke drawn through all
 * of them is furry — every metre of receiver noise becomes a kink at 10px wide.
 */
export function simplifyRoute(
  points: LatLng[],
  toleranceMeters: number,
): LatLng[] {
  if (points.length <= 2 || toleranceMeters <= 0) return points.slice();

  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;

  // Iterative rather than recursive: a 40 km route is deep enough to blow the
  // stack on the one runtime we can't attach a debugger to.
  const stack: Array<[number, number]> = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [first, last] = stack.pop() as [number, number];
    let worst = 0;
    let worstIndex = -1;
    for (let i = first + 1; i < last; i += 1) {
      const distance = segmentDistance(points[i], points[first], points[last]);
      if (distance > worst) {
        worst = distance;
        worstIndex = i;
      }
    }
    if (worstIndex >= 0 && worst > toleranceMeters) {
      keep[worstIndex] = 1;
      stack.push([first, worstIndex], [worstIndex, last]);
    }
  }

  return points.filter((_, index) => keep[index] === 1);
}

/**
 * Simplify until the route is inside `[min, max]` points, by bisecting the
 * tolerance.
 *
 * A fixed tolerance can't serve both a 2 km loop and a 42 km route — one comes
 * back with 90 points and the other with 4000. A target count can, and it is
 * also what makes the stroke weight below mean the same thing on both.
 */
export function simplifyToTarget(
  points: LatLng[],
  min = 300,
  max = 600,
): LatLng[] {
  if (points.length <= max) return points.slice();

  let low = 0.5;
  let high = 200;
  let best = simplifyRoute(points, low);
  // Bisection on a monotonic count: 18 halvings takes 200 m down to under a
  // millimetre, so this terminates on the tolerance long before it runs out.
  for (let i = 0; i < 18 && high - low > 0.01; i += 1) {
    const mid = (low + high) / 2;
    const candidate = simplifyRoute(points, mid);
    if (candidate.length > max) {
      low = mid;
    } else {
      best = candidate;
      high = mid;
      if (candidate.length >= min) break;
    }
  }
  return best;
}

export interface RouteBounds {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

export function routeBounds(points: LatLng[]): RouteBounds | null {
  if (points.length === 0) return null;
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;
  for (const [lat, lng] of points) {
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
    minLng = Math.min(minLng, lng);
    maxLng = Math.max(maxLng, lng);
  }
  return { minLat, maxLat, minLng, maxLng };
}

/**
 * Project [lat, lng] onto composition pixels — equirectangular with latitude
 * correction, which is plenty at running distances — fitted inside `padding`
 * and **north up**. Rotating a route to fill the frame better is the one thing
 * that makes a local say "that isn't my park".
 */
export function projectRoute(
  points: LatLng[],
  width: number,
  height: number,
  padding: RoutePadding,
): [number, number][] {
  if (points.length === 0) return [];
  const bounds = routeBounds(points) as RouteBounds;
  const { minLat, maxLat, minLng, maxLng } = bounds;
  const kx = lngScale((minLat + maxLat) / 2);

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

/** Total length of a projected path, in pixels — what a stroke reveal is timed
 *  against so an out-and-back and a loop draw at the same speed. */
export function pathLength(points: [number, number][]): number {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    total += Math.hypot(
      points[i][0] - points[i - 1][0],
      points[i][1] - points[i - 1][1],
    );
  }
  return total;
}

/**
 * Stroke weight for a route, scaled to how much of the frame it fills.
 *
 * A 2 km loop drawn at a 30 km route's weight is a fat scribble; the same weight
 * on the long one disappears. Scaling to the drawn box's diagonal keeps both
 * looking like the same pen.
 */
export function routeStrokeWidth(projected: [number, number][]): number {
  if (projected.length < 2) return 14;
  const xs = projected.map(([x]) => x);
  const ys = projected.map(([, y]) => y);
  const diagonal = Math.hypot(
    Math.max(...xs) - Math.min(...xs),
    Math.max(...ys) - Math.min(...ys),
  );
  return Math.round(Math.min(22, Math.max(10, diagonal / 60)));
}
