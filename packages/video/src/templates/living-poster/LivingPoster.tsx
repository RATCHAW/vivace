import { useMemo } from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { formatDay } from "../../core/format";
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  PAGE_INSET,
  SAFE_TOP,
  TYPE,
} from "../../core/layout";
import { MetricValue } from "../../core/numerals";
import { hashSeed } from "../../core/seed";
import { MetricLabel, Stage } from "../../core/Stage";
import { getTheme, type Theme } from "../../core/theme";
import {
  easeInOutCubic,
  easeOutBack,
  easeOutCubic,
  findBeat,
  ramp,
  secondsToFrames,
} from "../../core/timing";
import type { VideoActivity, VideoStreams } from "../../types";
import {
  posterGrid,
  posterPlan,
  STATS_TOP,
  TYPE_BLOCK_TOP,
  type PosterPlan,
} from "./poster";

export type LivingPosterProps = {
  activity: VideoActivity;
  streams: VideoStreams;
  /** One of `THEME_NAMES`; anything else falls back to the default. */
  theme: string;
};

/**
 * Living Run Poster — the calm one.
 *
 * The route draws itself on a bare plate, the markers stamp, the type sets, and
 * then nothing moves for two and a half seconds. That held frame is the actual
 * deliverable: if a screenshot of it isn't worth posting on its own, the film
 * hasn't worked, however good the draw looked.
 *
 * Pure geometry — no basemap, no tiles, no labels. Overlapping out-and-back
 * segments stay opaque, because that is what a real route looks like.
 */
export function LivingPoster({
  activity,
  streams,
  theme: themeName,
}: LivingPosterProps) {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const theme = getTheme(themeName);
  const plan = useMemo(
    () => posterPlan(activity, streams, fps, durationInFrames),
    [activity, streams, fps, durationInFrames],
  );

  const canvas = findBeat(plan.beats, "canvas");
  const route = findBeat(plan.beats, "route");
  const markers = findBeat(plan.beats, "markers");
  const title = findBeat(plan.beats, "title");
  const stats = findBeat(plan.beats, "stats");

  const gridIn = canvas
    ? easeOutCubic(ramp(frame, canvas.from, canvas.to - canvas.from))
    : 1;
  // Ease-in-out with the settle at the end that a hand-drawn line has: it leaves
  // the start line, travels, and arrives — it does not scroll past at a rate.
  const draw = route
    ? easeInOutCubic(ramp(frame, route.from, route.to - route.from))
    : 1;
  const markerIn = markers
    ? ramp(frame, markers.from, secondsToFrames(0.45, fps))
    : 0;
  const finishIn = markers
    ? ramp(
        frame,
        markers.from + secondsToFrames(0.3, fps),
        secondsToFrames(0.45, fps),
      )
    : 0;
  const titleIn = title
    ? easeOutCubic(ramp(frame, title.from, title.to - title.from))
    : 0;

  return (
    <Stage theme={theme} seed={hashSeed(activity.id, "living-poster")}>
      <Grid theme={theme} opacity={gridIn * 0.5} />
      <Route
        plan={plan}
        theme={theme}
        draw={draw}
        markerIn={markerIn}
        finishIn={finishIn}
      />
      <Title activity={activity} theme={theme} reveal={titleIn} />
      <Stats
        plan={plan}
        theme={theme}
        frame={frame}
        fps={fps}
        from={stats?.from ?? 0}
      />
    </Stage>
  );
}

/** The lines the poster is set on. Hairline-faint: this is stock texture, not a
 *  chart, and if you notice it before you notice the route it is too strong. */
function Grid({ theme, opacity }: { theme: Theme; opacity: number }) {
  const { columns, rows } = posterGrid();
  return (
    <AbsoluteFill style={{ opacity }}>
      <svg width={CANVAS_WIDTH} height={CANVAS_HEIGHT}>
        {columns.map((x) => (
          <line
            key={`c${x}`}
            x1={x}
            y1={SAFE_TOP}
            x2={x}
            y2={rows[rows.length - 1]}
            stroke={theme.hairline}
            strokeWidth={1}
          />
        ))}
        {rows.map((y) => (
          <line
            key={`r${y}`}
            x1={PAGE_INSET}
            y1={y}
            x2={CANVAS_WIDTH - PAGE_INSET}
            y2={y}
            stroke={theme.hairline}
            strokeWidth={1}
          />
        ))}
      </svg>
    </AbsoluteFill>
  );
}

/** The route, revealed along its own length, then stamped at both ends. */
function Route({
  plan,
  theme,
  draw,
  markerIn,
  finishIn,
}: {
  plan: PosterPlan;
  theme: Theme;
  draw: number;
  markerIn: number;
  finishIn: number;
}) {
  if (plan.projected.length < 2) return null;
  const path = plan.projected
    .map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`)
    .join(" ");
  const [startX, startY] = plan.projected[0];
  const [endX, endY] = plan.projected[plan.projected.length - 1];
  const startScale = easeOutBack(markerIn);
  const finishScale = easeOutBack(finishIn);

  return (
    <AbsoluteFill>
      <svg width={CANVAS_WIDTH} height={CANVAS_HEIGHT}>
        <polyline
          points={path}
          fill="none"
          stroke={theme.accent}
          strokeWidth={plan.strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          // The dash *is* the reveal: one dash as long as the whole path, walked
          // back to nothing. No mask, no second copy of the geometry.
          strokeDasharray={plan.length}
          strokeDashoffset={plan.length * (1 - draw)}
        />
        {markerIn > 0 && (
          <circle
            cx={startX}
            cy={startY}
            r={Math.max(0, plan.strokeWidth * 1.15 * startScale)}
            fill={theme.canvas}
            stroke={theme.ink}
            strokeWidth={plan.strokeWidth * 0.55}
          />
        )}
        {finishIn > 0 && (
          <circle
            cx={endX}
            cy={endY}
            r={Math.max(0, plan.strokeWidth * 1.3 * finishScale)}
            fill={theme.accentStrong}
            stroke={theme.canvas}
            strokeWidth={plan.strokeWidth * 0.4}
          />
        )}
      </svg>
    </AbsoluteFill>
  );
}

/** Name and date, revealed from their own baseline — the type sets rather than
 *  fades. */
function Title({
  activity,
  theme,
  reveal,
}: {
  activity: VideoActivity;
  theme: Theme;
  reveal: number;
}) {
  if (reveal <= 0) return null;
  return (
    <div
      style={{
        position: "absolute",
        top: TYPE_BLOCK_TOP,
        left: PAGE_INSET,
        right: PAGE_INSET,
        // A mask, not an opacity: the words rise out of the baseline they will
        // sit on, which is the one gesture in this template that has any speed.
        overflow: "hidden",
      }}
    >
      <div style={{ transform: `translateY(${(1 - reveal) * 100}%)` }}>
        <h1
          style={{
            margin: 0,
            fontSize: TYPE.title,
            fontWeight: 500,
            lineHeight: 1.08,
            letterSpacing: "-0.01em",
            color: theme.ink,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {activity.name}
        </h1>
        <div style={{ marginTop: 18 }}>
          <MetricLabel theme={theme}>{formatDay(activity)}</MetricLabel>
        </div>
      </div>
    </div>
  );
}

/** The stat row: each column stamps in, one at a time, landing with a short
 *  scale-down rather than sliding. */
function Stats({
  plan,
  theme,
  frame,
  fps,
  from,
}: {
  plan: PosterPlan;
  theme: Theme;
  frame: number;
  fps: number;
  from: number;
}) {
  const step = secondsToFrames(0.28, fps);
  return (
    <div
      style={{
        position: "absolute",
        top: STATS_TOP,
        left: PAGE_INSET,
        right: PAGE_INSET,
        display: "grid",
        gridTemplateColumns: `repeat(${plan.stats.length}, 1fr)`,
        gap: 20,
      }}
    >
      {plan.stats.map((stat, index) => {
        const enter = easeOutCubic(
          ramp(frame, from + index * step, secondsToFrames(0.4, fps)),
        );
        if (enter <= 0) return null;
        return (
          <div
            key={stat.label}
            style={{
              opacity: enter,
              // Down onto the page from just above it — a stamp, not a zoom.
              transform: `scale(${1.14 - 0.14 * enter})`,
              transformOrigin: "left top",
            }}
          >
            <MetricValue
              theme={theme}
              label={stat.label}
              value={stat.value}
              unit={stat.unit}
              size={plan.stats.length > 3 ? 58 : 68}
              labelSize={24}
            />
          </div>
        );
      })}
    </div>
  );
}
