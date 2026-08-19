import { AbsoluteFill } from "remotion";
import { formatClock, formatKm, formatPace } from "../../core/format";
import { FONT_MONO, FONT_SANS, LABEL_TRACKING } from "../../core/layout";
import { RunnerAvatar } from "../../core/RunnerAvatar";
import { clamp01 } from "../../core/timing";
import {
  duoOutroColumnCentre,
  duoOutroMetric,
  DUO_INK,
  DUO_OUTRO_AVATAR_RING,
  DUO_OUTRO_AVATAR_SIZE,
  DUO_OUTRO_AVATAR_TOP,
  DUO_OUTRO_CARD_HEIGHT,
  DUO_OUTRO_CARD_PADDING,
  DUO_OUTRO_CARD_RADIUS,
  DUO_OUTRO_CARD_TOP,
  DUO_OUTRO_COLUMN_LEFT,
  DUO_OUTRO_COLUMN_WIDTH,
  type DuoOutroPlan,
  type RunnerFrame,
} from "./duo";
import { ON_DARK, ON_DARK_FAINT } from "./overlay";

/* What the film ends on.
 *
 * The replay's own furniture — the mark, the title, each runner's name and each
 * runner's fill — travels here on its own; see `overlay.tsx`. This module draws
 * the two things the running layout had nowhere to put: the athletes' faces,
 * and their three numbers standing up in a column each.
 *
 * It stays mounted for the whole film at zero opacity. The faces are `<img>`s
 * that hold a frame until they have loaded, and holding one at second twelve of
 * a headless render is how a Lambda invocation times out. */

/** The plate the numbers sit on. Canvas luminance and a hairline, no shadow —
 *  DESIGN.md's elevation, over a map that has been put out of focus behind it. */
const CARD_SURFACE = "rgba(10,10,10,0.55)";
const CARD_HAIRLINE = "rgba(255,255,255,0.14)";

/** Bigger than the row's: a number that has stopped moving is being read, not
 *  glanced at, and there is a whole column for it. */
const CARD_TYPE = {
  label: 24,
  value: 64,
  unit: 28,
} as const;

/** The gap that spaces three metrics down a card's inner height. */
const CARD_METRIC_GAP = 46;

function CardMetric({
  label,
  value,
  unit,
  enter,
}: {
  label: string;
  value: string;
  unit?: string;
  enter: number;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        opacity: enter,
        transform: `translateY(${(1 - enter) * 24}px)`,
      }}
    >
      <div
        style={{
          fontFamily: FONT_MONO,
          fontSize: CARD_TYPE.label,
          lineHeight: "30px",
          letterSpacing: `${LABEL_TRACKING}em`,
          color: ON_DARK_FAINT,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: CARD_TYPE.value,
          fontWeight: 600,
          lineHeight: 1,
          letterSpacing: "-0.02em",
          fontVariantNumeric: "tabular-nums",
          color: ON_DARK,
        }}
      >
        {value}
        {unit && (
          <span
            style={{
              fontSize: CARD_TYPE.unit,
              fontWeight: 500,
              marginLeft: 8,
              color: ON_DARK_FAINT,
            }}
          >
            {unit}
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * A runner's face over their column.
 *
 * The initial is drawn underneath rather than instead of the picture: an
 * athlete with no Strava photo, one whose avatar option is off, and one whose
 * CDN dropped the request all land on the same disc, so the card never opens
 * with a hole where a person should be.
 */
function OutroFace({
  frame,
  index,
  enter,
}: {
  frame: RunnerFrame;
  index: number;
  enter: number;
}) {
  const { runner } = frame;
  const centre = duoOutroColumnCentre(index);
  const opacity = clamp01(enter);

  return (
    <div
      style={{
        position: "absolute",
        left: centre - DUO_OUTRO_AVATAR_SIZE / 2,
        top: DUO_OUTRO_AVATAR_TOP,
        width: DUO_OUTRO_AVATAR_SIZE,
        height: DUO_OUTRO_AVATAR_SIZE,
        opacity,
        // `enter` overshoots 1 — the one flourish in the film, and the reason
        // this is not `mix`, which would clamp it away.
        transform: `translateY(${(1 - opacity) * 26}px) scale(${0.76 + 0.24 * enter})`,
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: "50%",
          backgroundColor: "#0a0a0a",
          border: `${DUO_OUTRO_AVATAR_RING}px solid ${DUO_INK}`,
          boxSizing: "border-box",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 84,
          fontWeight: 600,
          lineHeight: 1,
          color: DUO_INK,
        }}
      >
        {runner.name.trim().slice(0, 1).toUpperCase()}
      </div>
      {runner.avatarUrl !== "" && (
        <RunnerAvatar
          src={runner.avatarUrl}
          x={DUO_OUTRO_AVATAR_SIZE / 2}
          y={DUO_OUTRO_AVATAR_SIZE / 2}
          ring={DUO_INK}
          size={DUO_OUTRO_AVATAR_SIZE}
          ringWidth={DUO_OUTRO_AVATAR_RING}
        />
      )}
    </div>
  );
}

/** One runner's numbers, stood up in their own column. The fill along the foot
 *  of the plate is not drawn here — it travelled in from the running layout,
 *  and `overlay.tsx` owns it. */
function OutroCard({
  frame,
  index,
  plan,
}: {
  frame: RunnerFrame;
  index: number;
  plan: DuoOutroPlan;
}) {
  const { live } = frame;
  // Down the column, after the plate they land on — a card whose contents
  // arrive with it reads as a slide, not as something being assembled.
  const metric = (order: number) => duoOutroMetric(plan, index, order);

  return (
    <div
      style={{
        position: "absolute",
        left: DUO_OUTRO_COLUMN_LEFT[index],
        top: DUO_OUTRO_CARD_TOP,
        width: DUO_OUTRO_COLUMN_WIDTH,
        height: DUO_OUTRO_CARD_HEIGHT,
        boxSizing: "border-box",
        padding: DUO_OUTRO_CARD_PADDING,
        borderRadius: DUO_OUTRO_CARD_RADIUS,
        backgroundColor: CARD_SURFACE,
        border: `2px solid ${CARD_HAIRLINE}`,
        display: "flex",
        flexDirection: "column",
        gap: CARD_METRIC_GAP,
        opacity: plan.cardIn[index],
      }}
    >
      <CardMetric
        label="KM"
        value={formatKm(live.distanceMeters)}
        enter={metric(0)}
      />
      <CardMetric
        label="TIME"
        value={formatClock(live.elapsedSeconds)}
        enter={metric(1)}
      />
      <CardMetric
        label="PACE"
        value={formatPace(live.paceSecondsPerKm)}
        unit="/KM"
        enter={metric(2)}
      />
    </div>
  );
}

/** The closing card, under everything that travels into it. */
export function DuoOutroCards({
  frames,
  plan,
}: {
  frames: RunnerFrame[];
  plan: DuoOutroPlan;
}) {
  return (
    <AbsoluteFill style={{ fontFamily: FONT_SANS, color: ON_DARK }}>
      {frames.map((frame, index) => (
        <OutroCard
          key={frame.runner.key}
          frame={frame}
          index={index}
          plan={plan}
        />
      ))}
      {frames.map((frame, index) => (
        <OutroFace
          key={frame.runner.key}
          frame={frame}
          index={index}
          enter={plan.avatarIn[index]}
        />
      ))}
    </AbsoluteFill>
  );
}
