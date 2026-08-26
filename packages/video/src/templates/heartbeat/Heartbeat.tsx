import { Fragment, useMemo } from "react";
import { Audio, Sequence, useCurrentFrame, useVideoConfig } from "remotion";
import { heartbeatClip, HEARTBEAT_SECONDS } from "../../core/audio";
import { formatDay } from "../../core/format";
import {
  fitFontSize,
  LABEL_TRACKING,
  SAFE_WIDTH,
  TYPE,
} from "../../core/layout";
import { countUpValue, MetricValue, Numeral, Unit } from "../../core/numerals";
import { hashSeed } from "../../core/seed";
import { MetricLabel, Rule, Stage } from "../../core/Stage";
import { videoTheme } from "../../core/greenscreen";
import type { Theme } from "../../core/theme";
import {
  beatProgress,
  clamp01,
  easeOutCubic,
  findBeat,
  ramp,
  secondsToFrames,
} from "../../core/timing";
import type { VideoActivity, VideoStreams } from "../../types";
import {
  clampBpm,
  getPulseMode,
  heartbeatPlan,
  runProgress,
  traceHead,
  tracePath,
  type Box,
  type HeartbeatPlan,
} from "./pulse";

// A type alias, not an interface — Remotion's <Composition> needs props
// assignable to Record<string, unknown>, which interfaces never are.
export type HeartbeatProps = {
  activity: VideoActivity;
  streams: VideoStreams;
  /** One of `THEME_NAMES`; anything else falls back to the default. */
  theme: string;
  /** Cut the canvas as a chroma key plate — see `core/greenscreen.ts`. */
  greenscreen?: boolean;
  /** One of `PULSE_MODES`; anything else falls back to the default. */
  pulse?: string;
};

/**
 * Heartbeat — the one you can hear.
 *
 * The run's heart rate drawn as a curve and played as a pulse, at the rate the
 * athlete's heart was actually going. It is the only template in the catalogue
 * with an audio track, and the whole thing is arranged around keeping the three
 * channels honest with each other: the numeral, the point on the curve and the
 * thud in the ear are all read from one `runProgress`, so what you see is what
 * you hear is what the watch recorded.
 *
 * `pulse` decides what the tempo follows — the run as it happened, its average,
 * or its peak — and it is the only option this template adds. Everything else
 * about the sound is fixed, because a heartbeat that could be tuned would stop
 * being a measurement.
 */
export function Heartbeat({
  activity,
  streams,
  theme: themeName,
  greenscreen,
  pulse,
}: HeartbeatProps) {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const theme = videoTheme(themeName, greenscreen);
  const mode = getPulseMode(pulse);
  const plan = useMemo(
    () => heartbeatPlan(activity, streams, fps, durationInFrames, mode),
    [activity, streams, fps, durationInFrames, mode],
  );
  // Eight thousand bytes of arithmetic, and the same eight thousand bytes on
  // every beat of every render — see `core/audio.ts`.
  const clip = useMemo(() => heartbeatClip(), []);

  const open = findBeat(plan.beats, "open");
  const trace = findBeat(plan.beats, "trace");
  const hold = findBeat(plan.beats, "hold");
  const progress = runProgress(plan, frame);

  const enter = easeOutCubic(ramp(frame, 0, secondsToFrames(0.5, fps)));
  const settling = hold
    ? easeOutCubic(ramp(frame, hold.from, secondsToFrames(0.7, fps)))
    : 0;
  // The chart arrives just before it has anything to draw. Held back rather
  // than faded in with everything else because at `runProgress` 0 the curve is
  // a single point: opening on it puts a lone dot on an empty rule for a second
  // and a half, which reads as a chart that failed to load.
  const charted = trace
    ? easeOutCubic(
        ramp(
          frame,
          trace.from - secondsToFrames(0.3, fps),
          secondsToFrames(0.5, fps),
        ),
      )
    : 1;

  // What the numeral reads: one number, counted up to during the opening and
  // then held for the rest of the film — because it is also the tempo, and the
  // tempo does not move. It arrives from the run's own trough, so the film
  // opens on a heart at rest and climbs to the rate it is about to keep.
  const { bpm: held, label } = plan.headline;
  const bpm = Math.round(
    open
      ? countUpValue(
          held,
          beatProgress(frame, open),
          Math.min(held, plan.series.min),
        )
      : held,
  );

  const pulseEnvelope = beatEnvelope(plan.pulses, frame, fps);

  return (
    <Stage theme={theme} seed={hashSeed(activity.id, "heartbeat")}>
      {plan.pulses.map((beat) => (
        <Sequence
          key={beat.frame}
          // No wrapper: a <Sequence> draws an <AbsoluteFill> by default, and
          // thirty of them stacked over the frame is thirty layers of nothing
          // between the film and the athlete.
          layout="none"
          from={beat.frame}
          durationInFrames={Math.ceil(HEARTBEAT_SECONDS * fps)}
        >
          {/* One level, every beat. It used to ride the effort, which meant
              something while the tempo climbed through the run; at a constant
              rate every beat is the same beat, and a volume that drifted
              anyway would be an effect rather than a measurement. A plain
              number, too, not a function: a volume curve is evaluated and
              shipped out of the browser on every frame it is mounted for. */}
          <Audio src={clip} volume={BEAT_VOLUME} />
        </Sequence>
      ))}

      <Header activity={activity} theme={theme} opacity={enter} plan={plan} />

      <Reading
        plan={plan}
        theme={theme}
        bpm={bpm}
        label={label}
        opacity={enter}
        pulse={pulseEnvelope}
      />

      {plan.boxes.trace && (
        <>
          <Trace
            plan={plan}
            theme={theme}
            progress={progress}
            opacity={enter * charted}
            pulse={pulseEnvelope}
            revealed={settling}
          />
          <Scale
            plan={plan}
            theme={theme}
            frame={frame}
            fps={fps}
            opacity={enter * charted}
          />
        </>
      )}

      <Stats plan={plan} theme={theme} opacity={settling} />
    </Stage>
  );
}

/* ---- The pulse ----------------------------------------------------------- */

/** How long a thud is still visible for. Shorter than it is audible: a mark
 *  that decayed over the whole beat would never be off, and a pulse you can't
 *  see stop is a glow. */
const PULSE_DECAY_SECONDS = 0.11;

/** Loud enough to carry over whatever a story is posted with, short of the
 *  ceiling the clip itself is normalised to so two beats can overlap. */
const BEAT_VOLUME = 0.9;

/** 1 on the frame a beat lands, decaying to 0 before the next one — the single
 *  number every pulsing thing on screen is scaled by, so they beat together. */
function beatEnvelope(
  pulses: readonly { frame: number }[],
  frame: number,
  fps: number,
): number {
  let landed = -1;
  for (const beat of pulses) {
    if (beat.frame > frame) break;
    landed = beat.frame;
  }
  if (landed < 0) return 0;
  return Math.exp(-((frame - landed) / fps) / PULSE_DECAY_SECONDS);
}

/* ---- The header ---------------------------------------------------------- */

/** The date and the run's name, in the same place every template puts them. */
function Header({
  activity,
  theme,
  opacity,
  plan,
}: {
  activity: VideoActivity;
  theme: Theme;
  opacity: number;
  plan: HeartbeatPlan;
}) {
  const box = plan.boxes.header;
  return (
    <div
      style={{
        position: "absolute",
        top: box.top,
        left: box.left,
        width: box.width,
        opacity,
        transform: `translateY(${(1 - opacity) * -14}px)`,
      }}
    >
      <MetricLabel theme={theme} size={26}>
        {formatDay(activity)}
      </MetricLabel>
      <div
        style={{
          marginTop: 14,
          fontSize: 46,
          fontWeight: 500,
          letterSpacing: "-0.01em",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {activity.name}
      </div>
    </div>
  );
}

/* ---- The number ---------------------------------------------------------- */

/**
 * The heart rate, owning the frame, beating.
 *
 * The pulse is a scale bump on the numeral itself and on the mark beside it —
 * never an opacity flash. On the key plate a translucent ink composites to pale
 * green and is cut away with the background, so anything that has to survive
 * being keyed moves rather than fades. See `core/greenscreen.ts`.
 */
function Reading({
  plan,
  theme,
  bpm,
  label,
  opacity,
  pulse,
}: {
  plan: HeartbeatPlan;
  theme: Theme;
  bpm: number;
  label: string;
  opacity: number;
  pulse: number;
}) {
  const box = plan.boxes.numeral;
  const spelled = String(clampBpm(bpm));
  return (
    <div
      style={{
        position: "absolute",
        top: box.top,
        left: box.left,
        width: box.width,
        height: box.height,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        gap: 26,
        opacity,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
        <HeartMark theme={theme} size={38} pulse={pulse} />
        <MetricLabel theme={theme}>{label}</MetricLabel>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 26,
          // Transform-origin on the left so the numeral swells into its own
          // measure instead of drifting across the frame.
          transformOrigin: "0% 50%",
          transform: `scale(${1 + pulse * 0.035})`,
        }}
      >
        <Numeral
          theme={theme}
          maxWidth={SAFE_WIDTH - 200}
          maxSize={TYPE.display}
        >
          {spelled}
        </Numeral>
        <Unit theme={theme} size={72}>
          bpm
        </Unit>
      </div>
    </div>
  );
}

/** The one glyph in the catalogue that isn't type or a route. It is the
 *  signifier the whole template hangs on, so it is drawn in the accent and it
 *  is what beats hardest. */
function HeartMark({
  theme,
  size,
  pulse,
}: {
  theme: Theme;
  size: number;
  pulse: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      style={{
        flexShrink: 0,
        transform: `scale(${1 + pulse * 0.22})`,
        transformOrigin: "50% 50%",
      }}
    >
      <path
        d="M12 21s-7.6-4.9-9.6-9.2C1 8.6 2.6 5 6.1 5c2 0 3.4 1.1 4.2 2.2.4.5 1 .5 1.4 0C12.5 6.1 13.9 5 15.9 5c3.5 0 5.1 3.6 3.7 6.8C17.6 16.1 12 21 12 21z"
        fill={theme.accent}
      />
    </svg>
  );
}

/* ---- The curve ----------------------------------------------------------- */

/** Wide enough for "PEAK 174" tracked out, and a fixed measure so the label can
 *  be centred on its marker and clamped to the band in one expression. */
const PEAK_LABEL_WIDTH = 260;

/** Where a fixed-measure label goes to sit over `x` without leaving the band —
 *  what stops a peak in the first kilometre, or a kilometre mark at the finish,
 *  hanging its type off the side of the frame. */
function centredOn(box: Box, x: number, width: number): number {
  return Math.max(
    box.left,
    Math.min(box.left + box.width - width, x - width / 2),
  );
}

function Trace({
  plan,
  theme,
  progress,
  opacity,
  pulse,
  revealed,
}: {
  plan: HeartbeatPlan;
  theme: Theme;
  progress: number;
  opacity: number;
  pulse: number;
  revealed: number;
}) {
  const box = plan.boxes.trace;
  if (!box) return null;
  const path = tracePath(plan.points, progress);
  const head = traceHead(plan.points, progress);
  const peak = plan.points[plan.series.peakIndex];
  // The peak is only named once the curve has actually reached it — a marker
  // standing in front of the line it belongs to gives the ending away.
  const peakReached =
    plan.series.peakIndex / Math.max(1, plan.points.length - 1);
  const peakShown = clamp01((progress - peakReached) / 0.06);

  return (
    <div style={{ position: "absolute", inset: 0, opacity }}>
      <svg
        width="100%"
        height="100%"
        viewBox={`0 0 1080 1920`}
        style={{ position: "absolute", inset: 0 }}
      >
        {/* The floor the curve stands on: one hairline, so the band reads as a
            chart rather than as a line floating in the middle of the frame. */}
        <line
          x1={box.left}
          y1={box.top + box.height}
          x2={box.left + box.width}
          y2={box.top + box.height}
          stroke={theme.hairline}
          strokeWidth={2}
        />

        {path && (
          <path
            d={path}
            fill="none"
            stroke={theme.accent}
            strokeWidth={7}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        {peakShown > 0 && (
          <>
            <circle
              cx={peak.x}
              cy={peak.y}
              r={9}
              fill={theme.plate}
              stroke={theme.accentStrong}
              strokeWidth={5}
            />
            {/* A short tick up to its own label, not a leader all the way to a
                fixed row: the marker sits at the top of the band now, so a full
                leader would be a line crossing nothing. */}
            <line
              x1={peak.x}
              y1={peak.y - 20}
              x2={peak.x}
              y2={peak.y - 34}
              stroke={theme.hairline}
              strokeWidth={2}
            />
          </>
        )}

        {/* The leading edge, beating. The ring is the one thing here allowed to
            fade — it is illustration on its way out, not a number. */}
        {pulse > 0.02 && (
          <circle
            cx={head.x}
            cy={head.y}
            r={14 + pulse * 26}
            fill="none"
            stroke={theme.accentStrong}
            strokeWidth={3}
            opacity={pulse * 0.7 * (1 - revealed)}
          />
        )}
        <circle
          cx={head.x}
          cy={head.y}
          r={12 + pulse * 5}
          fill={theme.accentStrong}
          opacity={1 - revealed}
        />
      </svg>

      {peakShown > 0 && (
        // Riding the marker rather than sitting on a row of its own, and
        // clamped to the band's own edges so a peak in the first or last
        // kilometre doesn't hang its label off the side of the frame.
        <div
          style={{
            position: "absolute",
            top: peak.y - 68,
            left: centredOn(box, peak.x, PEAK_LABEL_WIDTH),
            width: PEAK_LABEL_WIDTH,
            opacity: peakShown,
          }}
        >
          <MetricLabel
            theme={theme}
            size={24}
            color={theme.inkMuted}
            align="center"
          >
            {/* The number only where it isn't already the headline. In peak
                mode the numeral above *is* this figure, and printing it twice
                turns the marker from "here is where it happened" into a second
                statement of the same fact. */}
            {plan.mode === "peak" ? "Peak" : `Peak ${plan.series.max}`}
          </MetricLabel>
        </div>
      )}
    </div>
  );
}

/* ---- The scale ----------------------------------------------------------- */

/** How long a mark takes to arrive, in seconds of film — not in a fraction of
 *  the run, which is the same mistake as the removed `live` tempo in miniature:
 *  the last kilometre is reached *at* the end of the curve, so a reveal measured
 *  against the run's own progress would leave it at a tenth of its opacity for
 *  the whole closing hold. Real time, and it lands during that hold. */
const TICK_REVEAL_SECONDS = 0.28;

/** The mark itself, hanging off the floor rule. */
const TICK_LENGTH = 12;

const TICK_LABEL_SIZE = 24;

/** JetBrains Mono is monospaced, so a label's measure is its length — no
 *  estimator to consult and no DOM to measure with, which there isn't one of on
 *  Lambda. Sized to the type rather than to a generous fixed box, because the
 *  clamp below is what decides whether a numeral still sits over its own mark. */
function tickLabelWidth(label: string): number {
  return Math.ceil(label.length * TICK_LABEL_SIZE * (0.62 + LABEL_TRACKING));
}

/**
 * The distance under the curve.
 *
 * The chart's x axis is the run, and without these it is an unlabelled one: the
 * line says the heart rate climbed, and never says by when. Each mark is placed
 * where the athlete *reached* that kilometre rather than on an even ruler, so
 * the spacing is itself a reading — the narrow gaps are the fast kilometres.
 *
 * Each one is held back until the line has run it, which is the same rule the
 * peak marker obeys: naming a kilometre the curve hasn't reached would put the
 * chart's ending on screen before it happened. The film settles long before the
 * last of them lands, so the frame a story is paused on carries the whole scale.
 */
function Scale({
  plan,
  theme,
  frame,
  fps,
  opacity,
}: {
  plan: HeartbeatPlan;
  theme: Theme;
  frame: number;
  fps: number;
  opacity: number;
}) {
  const box = plan.boxes.axis;
  const trace = plan.boxes.trace;
  const drawn = findBeat(plan.beats, "trace");
  if (!box || !trace || plan.ticks.length === 0) return null;
  const floor = trace.top + trace.height;
  // The frame the curve runs each mark past, which is where its reveal starts.
  const reached = (progress: number) =>
    drawn ? drawn.from + progress * (drawn.to - drawn.from) : 0;

  return (
    <div style={{ position: "absolute", inset: 0, opacity }}>
      {plan.ticks.map((tick) => {
        const shown = easeOutCubic(
          ramp(
            frame,
            reached(tick.progress),
            secondsToFrames(TICK_REVEAL_SECONDS, fps),
          ),
        );
        if (shown <= 0) return null;
        const width = tickLabelWidth(tick.label);
        return (
          <Fragment key={tick.meters}>
            {/* Drawn down out of the rule it belongs to rather than faded in
                over it: a mark that arrives at full length is a mark that came
                from nowhere, and it is one line of arithmetic to avoid. */}
            <div
              style={{
                position: "absolute",
                top: floor,
                left: tick.x - 1,
                width: 2,
                height: TICK_LENGTH * shown,
                backgroundColor: theme.hairline,
              }}
            />
            <div
              style={{
                position: "absolute",
                top: box.top,
                left: centredOn(box, tick.x, width),
                width,
                opacity: shown,
                transform: `translateY(${(1 - shown) * 8}px)`,
                // The measure is estimated, and "1 KM" breaking at its space
                // would put the unit on a second line under the numeral.
                whiteSpace: "nowrap",
              }}
            >
              <MetricLabel theme={theme} size={TICK_LABEL_SIZE} align="center">
                {tick.label}
              </MetricLabel>
            </div>
          </Fragment>
        );
      })}
    </div>
  );
}

/* ---- The close ----------------------------------------------------------- */

/** The three numbers the headline doesn't already say, arriving as the film
 *  settles. This is the frame a story gets paused on. */
function Stats({
  plan,
  theme,
  opacity,
}: {
  plan: HeartbeatPlan;
  theme: Theme;
  opacity: number;
}) {
  if (opacity <= 0) return null;
  const box = plan.boxes.stats;
  return (
    <div
      style={{
        position: "absolute",
        top: box.top,
        left: box.left,
        width: box.width,
        opacity,
        transform: `translateY(${(1 - opacity) * 22}px)`,
      }}
    >
      <Rule theme={theme} margin="0 0 34px" />
      <div
        style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 24 }}
      >
        {plan.stats.map((tile) => (
          <MetricValue
            key={tile.label}
            theme={theme}
            label={tile.label}
            value={tile.value}
            unit={tile.unit}
            size={fitFontSize(tile.value, 240, 64, 0)}
          />
        ))}
      </div>
    </div>
  );
}
