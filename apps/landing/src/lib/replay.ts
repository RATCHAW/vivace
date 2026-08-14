/**
 * The maths behind the hero replay: one 14-second loop of the same film the app
 * renders for real — title card, the route drawing itself with live metrics,
 * then the summary. Everything here is a pure function of `t` (0 → 1) so the
 * server and the first client frame agree, and so it can be tested without a
 * DOM.
 */

/** Seconds for one full loop. */
export const LOOP_SECONDS = 14;

/**
 * Where the loop starts. Mid-route rather than at 0: it is the frame the page
 * is served with, so a reader who never gets JS — or who asks for reduced
 * motion — still sees a running replay instead of an empty black plate.
 */
export const START_PHASE = 0.4;

/** The run being replayed. The same 3.16 km evening run as the app's mock. */
const RUN = { km: 3.16, seconds: 1169, hr: 140 };

/** The phone's SVG canvas, in the units the route path is drawn in. */
export const CANVAS = { width: 340, height: 604 };

export type Route = {
  /** SVG path data. */
  d: string;
  points: Array<[number, number]>;
  /** Cumulative arc length at each point. */
  cumulative: number[];
  length: number;
};

/**
 * A closed loop that reads like a real GPS trace: a circle wobbled by three
 * out-of-phase harmonics, so no two stretches curve the same way.
 */
export function buildRoute(): Route {
  const points: Array<[number, number]> = [];
  const segments = 150;

  for (let i = 0; i <= segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    const wobble =
      1 +
      0.2 * Math.sin(3 * angle + 1.7) +
      0.1 * Math.sin(7 * angle + 3.4) +
      0.05 * Math.sin(13 * angle + 5.1);
    points.push([
      CANVAS.width / 2 + Math.cos(angle) * 96 * wobble,
      CANVAS.height / 2 - 2 + Math.sin(angle) * 128 * wobble,
    ]);
  }

  const cumulative = [0];
  for (let i = 1; i < points.length; i++) {
    cumulative.push(
      cumulative[i - 1] +
        Math.hypot(
          points[i][0] - points[i - 1][0],
          points[i][1] - points[i - 1][1],
        ),
    );
  }

  return {
    d: points
      .map(
        (p, i) =>
          (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1),
      )
      .join(" "),
    points,
    cumulative,
    length: cumulative[cumulative.length - 1],
  };
}

/** The point `progress` (0 → 1) of the way along the route, by arc length. */
export function pointAt(route: Route, progress: number): [number, number] {
  const target = route.length * clamp01(progress);
  let i = 1;
  while (i < route.cumulative.length && route.cumulative[i] < target) i++;
  const a = route.points[i - 1];
  const b = route.points[i] ?? a;
  const segment = route.cumulative[i] - route.cumulative[i - 1] || 1;
  const f = (target - route.cumulative[i - 1]) / segment;
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
}

/** Seconds as `m:ss` — the app's clock, never zero-padded on the minutes. */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
}

/** A trapezoid: 0 before `a`, up to 1 by `b`, held to `c`, back to 0 at `d`. */
export function fade(
  t: number,
  a: number,
  b: number,
  c: number,
  d: number,
): number {
  if (t < a || t > d) return 0;
  if (t < b) return (t - a) / (b - a);
  if (t <= c) return 1;
  return 1 - (t - c) / (d - c);
}

/** How far a chapter's progress bar has filled, as a CSS width. */
export function chapterWidth(t: number, from: number, to: number): string {
  return Math.round(clamp01((t - from) / (to - from)) * 100) + "%";
}

function clamp01(n: number) {
  return Math.min(1, Math.max(0, n));
}

export type ReplayFrame = ReturnType<typeof replayFrame>;

/** Everything the phone needs to draw itself at time `t`. */
export function replayFrame(t: number, route: Route) {
  // The route chapter runs from 8% to 70% of the loop; the title card and the
  // summary take the ends.
  const progress = clamp01((t - 0.08) / 0.62);
  const [dotX, dotY] = pointAt(route, progress);
  const basePace = RUN.seconds / RUN.km;
  const started = progress > 0.02;

  return {
    routeLength: route.length.toFixed(1),
    routeOffset: (route.length * (1 - progress)).toFixed(1),
    dotX: dotX.toFixed(1),
    dotY: dotY.toFixed(1),
    mapOpacity: fade(t, 0.04, 0.09, 0.7, 0.75).toFixed(3),
    hudOpacity: fade(t, 0.04, 0.09, 0.7, 0.75).toFixed(3),
    summaryOpacity: fade(t, 0.74, 0.79, 1.01, 1.02).toFixed(3),
    chapters: {
      title: chapterWidth(t, 0, 0.08),
      route: chapterWidth(t, 0.08, 0.74),
      summary: chapterWidth(t, 0.74, 1),
    },
    live: {
      distance: (RUN.km * progress).toFixed(2),
      time: clock(RUN.seconds * progress),
      // Pace and heart rate wander the way they do on a real watch: a slow
      // drift up over the run, plus a small oscillation.
      pace: started ? clock(basePace * (1 + Math.sin(t * 22) * 0.05)) : "—",
      hr: started
        ? String(Math.round(RUN.hr - 12 + 24 * progress + Math.sin(t * 30) * 3))
        : "—",
    },
  };
}

/** The finished run, as the summary card states it. */
/**
 * The numbers on the summary card. The date and the run's name used to sit
 * here too; they are words, so they moved to the message catalogue and reach
 * the plate as props — see `hero.replay` in `src/i18n/messages/en.ts`.
 */
export const RUN_SUMMARY = {
  distance: RUN.km.toFixed(2),
  time: "19:29",
  pace: "6:10",
  elevation: "24 m",
};
