import { useMemo } from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import {
  averagePace,
  formatClock,
  formatKm,
  formatPace,
  formatStartDate,
} from "../../core/format";
import {
  CANVAS_HEIGHT,
  fitFontSize,
  FONT_MONO,
  LOGO_TOP,
  PAGE_INSET,
  SAFE_TOP,
  SAFE_WIDTH,
  TYPE,
} from "../../core/layout";
import {
  countUpValue,
  MetricValue,
  Numeral,
  NUMERAL_STYLE,
  Unit,
} from "../../core/numerals";
import { hashSeed } from "../../core/seed";
import { MetricLabel, Rule, Stage } from "../../core/Stage";
import { videoTheme } from "../../core/greenscreen";
import type { Theme } from "../../core/theme";
import {
  beatProgress,
  easeOutCubic,
  easeOutQuint,
  findBeat,
  ramp,
  secondsToFrames,
} from "../../core/timing";
import type { VideoActivity, VideoStreams } from "../../types";
import {
  ROWS_BOTTOM,
  ROWS_TOP,
  splitEntryFrame,
  splitRushPlan,
  type Split,
  type SplitRushPlan,
} from "./splits";

// A type alias, not an interface — Remotion's <Composition> needs props
// assignable to Record<string, unknown>, which interfaces never are.
export type SplitRushProps = {
  activity: VideoActivity;
  streams: VideoStreams;
  /** One of `THEME_NAMES`; anything else falls back to the default. */
  theme: string;
  /** Cut the canvas as a chroma key plate — see `core/greenscreen.ts`. */
  greenscreen?: boolean;
};

/**
 * Split Rush — the anti-map template.
 *
 * Every kilometre as a bar, cascading in; the fastest one isolates; a verdict
 * closes it. No GPS anywhere in it, which is the point: a treadmill run has no
 * route to draw and this is the film it gets.
 */
export function SplitRush({
  activity,
  streams,
  theme: themeName,
  greenscreen,
}: SplitRushProps) {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const theme = videoTheme(themeName, greenscreen);
  const plan = useMemo(
    () => splitRushPlan(activity, streams, fps, durationInFrames),
    [activity, streams, fps, durationInFrames],
  );

  const title = findBeat(plan.beats, "title");
  const verdict = findBeat(plan.beats, "verdict");
  const isolate = findBeat(plan.beats, "isolate");
  const heroes = findBeat(plan.beats, "heroes");

  // The opening card dissolves into the header rather than cutting: the same
  // two lines, moving from the middle of the frame to the top of it.
  const handover = secondsToFrames(0.4, fps);
  const opening = title ? 1 - ramp(frame, title.to - handover, handover) : 1;
  const header = title ? ramp(frame, title.to - handover / 2, handover) : 1;

  const closing = verdict
    ? ramp(frame, verdict.from, secondsToFrames(0.5, fps))
    : 0;
  // The chart recedes when the heroes come forward — a card standing on live
  // data reads as a bug, and the beat is meant to be a zoom, not an overlay.
  const receded = heroes
    ? 0.82 * ramp(frame, heroes.from, secondsToFrames(0.5, fps))
    : 0;
  const rowsOpacity = (1 - closing) * (1 - receded);

  const isolateProgress = isolate ? beatProgress(frame, isolate) : 0;

  return (
    <Stage theme={theme} seed={hashSeed(activity.id, "split-rush")}>
      {opening > 0 && (
        <TitleCard
          activity={activity}
          theme={theme}
          opacity={opening}
          frame={frame}
          fps={fps}
        />
      )}

      {header > 0 && (
        <Header activity={activity} theme={theme} opacity={header} />
      )}

      {rowsOpacity > 0 && (
        <AbsoluteFill style={{ opacity: rowsOpacity }}>
          {plan.splits.map((split) => (
            <SplitBar
              key={split.index}
              split={split}
              plan={plan}
              theme={theme}
              frame={frame}
              fps={fps}
              isolate={isolateProgress}
              isolated={
                isolate != null && split.index === plan.encoding.fastestIndex
              }
            />
          ))}
        </AbsoluteFill>
      )}

      {isolate != null &&
        isolateProgress > 0 &&
        plan.encoding.fastestIndex >= 0 && (
          <IsolateLabel
            plan={plan}
            theme={theme}
            opacity={isolateProgress * rowsOpacity}
          />
        )}

      {heroes != null && plan.heroes.length > 0 && (
        <Heroes
          plan={plan}
          theme={theme}
          frame={frame}
          fps={fps}
          opacity={1 - closing}
        />
      )}

      {closing > 0 && (
        <Closing
          activity={activity}
          plan={plan}
          theme={theme}
          opacity={closing}
          frame={frame}
          fps={fps}
        />
      )}
    </Stage>
  );
}

/* ---- Opening ------------------------------------------------------------- */

function TitleCard({
  activity,
  theme,
  opacity,
  frame,
  fps,
}: {
  activity: VideoActivity;
  theme: Theme;
  opacity: number;
  frame: number;
  fps: number;
}) {
  const entry = easeOutCubic(ramp(frame, 0, secondsToFrames(0.5, fps)));
  const km = formatKm(activity.distance);
  return (
    <AbsoluteFill
      style={{
        opacity,
        padding: `0 ${PAGE_INSET}px`,
        justifyContent: "center",
        alignItems: "flex-start",
        transform: `translateY(${(1 - entry) * 24}px)`,
      }}
    >
      <MetricLabel theme={theme}>{formatStartDate(activity)}</MetricLabel>
      <h1
        style={{
          margin: "22px 0 40px",
          fontSize: TYPE.title,
          fontWeight: 500,
          lineHeight: 1.05,
          letterSpacing: "-0.01em",
          textWrap: "balance",
        }}
      >
        {activity.name}
      </h1>
      <div style={{ display: "flex", alignItems: "baseline", gap: 20 }}>
        <Numeral theme={theme} maxWidth={SAFE_WIDTH - 160} maxSize={340}>
          {km}
        </Numeral>
        <Unit theme={theme} size={64}>
          km
        </Unit>
      </div>
    </AbsoluteFill>
  );
}

/** What the title card becomes: one line, out of the way of the bars. */
function Header({
  activity,
  theme,
  opacity,
}: {
  activity: VideoActivity;
  theme: Theme;
  opacity: number;
}) {
  return (
    <div
      style={{
        position: "absolute",
        top: SAFE_TOP,
        left: PAGE_INSET,
        right: PAGE_INSET,
        opacity,
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "space-between",
        gap: 32,
        transform: `translateY(${(1 - opacity) * -16}px)`,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <MetricLabel theme={theme} size={26}>
          {formatStartDate(activity)}
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
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 10,
          flexShrink: 0,
        }}
      >
        <span style={{ ...NUMERAL_STYLE, fontSize: 76, color: theme.ink }}>
          {formatKm(activity.distance)}
        </span>
        <Unit theme={theme} size={30}>
          km
        </Unit>
      </div>
    </div>
  );
}

/* ---- The bars ------------------------------------------------------------ */

/** One split: the kilometre's number, its bar, and the pace at the end of it.
 *  The bar grows from the left and the pace rolls up into place — both eased
 *  out, so each row lands rather than arrives. */
function SplitBar({
  split,
  plan,
  theme,
  frame,
  fps,
  isolate,
  isolated,
}: {
  split: Split;
  plan: SplitRushPlan;
  theme: Theme;
  frame: number;
  fps: number;
  isolate: number;
  isolated: boolean;
}) {
  const row = plan.rows[split.index];
  const entry = splitEntryFrame(plan, split.index, fps);
  const grow = easeOutQuint(ramp(frame, entry, secondsToFrames(0.45, fps)));
  if (grow <= 0) return null;

  const fastest = split.index === plan.encoding.fastestIndex;
  // Rolled up from a little short of the value, so the digits spin and settle
  // instead of appearing. Tabular figures are what keep it from twitching.
  const roll = easeOutCubic(ramp(frame, entry, secondsToFrames(0.4, fps)));
  const pace = countUpValue(
    split.paceSecondsPerKm,
    roll,
    Math.max(0, split.paceSecondsPerKm - 28),
  );

  // The isolate beat lifts the fastest row to the middle of the band, and every
  // other row leaves. Dimming them instead would leave the isolated row standing
  // on top of the ones it travelled through; and the row itself is deliberately
  // not scaled — a full-measure row scaled up pushes its own pace off the frame.
  const band = plan.rows[0].top + (plan.rows.length * row.height) / 2;
  const lift = isolated
    ? (band - row.top - row.height / 2) * easeOutCubic(isolate)
    : 0;
  const dim = isolated ? 1 : 1 - easeOutCubic(isolate);
  if (dim <= 0) return null;

  return (
    <div
      style={{
        position: "absolute",
        top: row.top,
        left: PAGE_INSET,
        right: PAGE_INSET,
        height: row.height,
        display: "flex",
        alignItems: "center",
        opacity: dim * Math.min(1, grow * 3),
        transform: `translateY(${lift}px)`,
      }}
    >
      <div
        style={{
          width: 96,
          flexShrink: 0,
          fontFamily: FONT_MONO,
          fontSize: plan.mode === "cascade" ? 34 : 22,
          letterSpacing: "0.04em",
          color: split.partial ? theme.inkFaint : theme.inkMuted,
        }}
      >
        {split.label}
      </div>

      <div style={{ position: "relative", flex: 1, height: row.barHeight }}>
        {/* The track carries the row even before its bar has grown. */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: 9999,
            backgroundColor: theme.hairline,
          }}
        />
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            bottom: 0,
            width: `${plan.encoding.widths[split.index] * grow * 100}%`,
            borderRadius: 9999,
            // One accent for every bar, one brighter for the fastest. A partial
            // split is dimmed: it is a tail, not a kilometre.
            backgroundColor: fastest ? theme.accentStrong : theme.accent,
            opacity: split.partial ? 0.45 : 1,
          }}
        />
      </div>

      <div
        style={{
          width: 190,
          flexShrink: 0,
          textAlign: "right",
          ...NUMERAL_STYLE,
          fontSize: plan.mode === "cascade" ? 44 : 26,
          color: fastest ? theme.ink : theme.inkMuted,
        }}
      >
        {formatPace(pace)}
      </div>
    </div>
  );
}

/** "Fastest km — 4:32", under the row it belongs to. */
function IsolateLabel({
  plan,
  theme,
  opacity,
}: {
  plan: SplitRushPlan;
  theme: Theme;
  opacity: number;
}) {
  const split = plan.splits[plan.encoding.fastestIndex];
  if (!split) return null;
  const band = plan.rows[0].top + (plan.rows.length * plan.rows[0].height) / 2;
  return (
    <div
      style={{
        position: "absolute",
        top: band + 90,
        left: PAGE_INSET,
        right: PAGE_INSET,
        opacity,
        textAlign: "center",
      }}
    >
      <MetricLabel theme={theme} align="center" color={theme.inkMuted}>
        Fastest kilometre — {formatPace(split.paceSecondsPerKm)}
      </MetricLabel>
    </div>
  );
}

/* ---- Many-splits mode ---------------------------------------------------- */

/** A marathon doesn't cascade — the whole chart draws at once, then three
 *  splits worth talking about come forward over it. */
function Heroes({
  plan,
  theme,
  frame,
  fps,
  opacity,
}: {
  plan: SplitRushPlan;
  theme: Theme;
  frame: number;
  fps: number;
  opacity: number;
}) {
  const beat = findBeat(plan.beats, "heroes");
  if (!beat) return null;
  const step = Math.max(
    1,
    Math.floor((beat.to - beat.from) / plan.heroes.length),
  );
  const labels = ["Fastest", "Final", "Biggest move"];

  return (
    <div
      style={{
        position: "absolute",
        // Centred in the band the strip is drawn in, so the heroes land where
        // the eye already is rather than under it.
        top: ROWS_TOP,
        bottom: CANVAS_HEIGHT - ROWS_BOTTOM,
        left: PAGE_INSET,
        right: PAGE_INSET,
        opacity,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        gap: 26,
      }}
    >
      {plan.heroes.map((split, index) => {
        const enter = easeOutCubic(
          ramp(frame, beat.from + index * step, secondsToFrames(0.45, fps)),
        );
        if (enter <= 0) return null;
        return (
          <div
            key={split.index}
            style={{
              display: "flex",
              alignItems: "baseline",
              justifyContent: "space-between",
              gap: 24,
              padding: "22px 32px",
              borderRadius: 20,
              backgroundColor: theme.surface,
              opacity: enter,
              transform: `translateX(${(1 - enter) * 40}px)`,
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <MetricLabel theme={theme} size={24}>
                {labels[index] ?? "Split"}
              </MetricLabel>
              <span
                style={{ fontSize: 34, fontWeight: 500, color: theme.inkMuted }}
              >
                Kilometre {split.index + 1}
              </span>
            </div>
            <span style={{ ...NUMERAL_STYLE, fontSize: 68, color: theme.ink }}>
              {formatPace(split.paceSecondsPerKm)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* ---- Closing ------------------------------------------------------------- */

/** The verdict — exactly one, never a negative — over the totals. */
function Closing({
  activity,
  plan,
  theme,
  opacity,
  frame,
  fps,
}: {
  activity: VideoActivity;
  plan: SplitRushPlan;
  theme: Theme;
  opacity: number;
  frame: number;
  fps: number;
}) {
  const beat = findBeat(plan.beats, "verdict");
  const from = beat?.from ?? 0;
  const enter = easeOutCubic(ramp(frame, from, secondsToFrames(0.6, fps)));
  const totals = easeOutCubic(
    ramp(frame, from + secondsToFrames(0.35, fps), secondsToFrames(0.6, fps)),
  );
  const pace = averagePace(activity);
  const headlineSize = fitFontSize(plan.verdict.headline, SAFE_WIDTH, 104, 0);

  return (
    <div
      style={{
        position: "absolute",
        // Between the header and the lockup, optically centred: the verdict is
        // the frame this film gets paused on.
        top: 560,
        bottom: CANVAS_HEIGHT - LOGO_TOP + 60,
        left: PAGE_INSET,
        right: PAGE_INSET,
        opacity,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          opacity: enter,
          transform: `translateY(${(1 - enter) * 26}px)`,
        }}
      >
        <div
          style={{
            fontSize: headlineSize,
            fontWeight: 600,
            lineHeight: 1.04,
            letterSpacing: "-0.02em",
            color: theme.hero,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {plan.verdict.headline}
        </div>
        <div style={{ marginTop: 22 }}>
          <MetricLabel theme={theme}>{plan.verdict.detail}</MetricLabel>
        </div>
      </div>

      <div
        style={{
          marginTop: 84,
          opacity: totals,
          transform: `translateY(${(1 - totals) * 20}px)`,
        }}
      >
        <Rule theme={theme} margin="0 0 40px" />
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: 24,
          }}
        >
          <MetricValue
            theme={theme}
            label="Distance"
            value={formatKm(activity.distance)}
            unit="km"
          />
          <MetricValue
            theme={theme}
            label="Time"
            value={formatClock(activity.moving_time)}
          />
          <MetricValue
            theme={theme}
            label="Avg pace"
            value={formatPace(pace)}
            unit="/km"
          />
        </div>
      </div>
    </div>
  );
}
