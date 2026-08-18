import type { ReactNode } from "react";
import { AbsoluteFill } from "remotion";
import { VivaceMark } from "../../brand/vivace-mark";
import {
  formatClock,
  formatKm,
  formatPace,
  formatStartDate,
} from "../../core/format";
import {
  FONT_MONO,
  FONT_SANS,
  LABEL_TRACKING,
  PAGE_INSET,
} from "../../core/layout";
import { mix } from "../../core/timing";
import type { VideoActivity } from "../../types";
import {
  duoBarFill,
  duoFillBox,
  duoHeadlineBox,
  duoNumbersWidth,
  DUO_BAR_HEIGHT,
  DUO_ROW_HEAD_HEIGHT,
  DUO_ROW_METRIC,
  DUO_ROW_TOPS,
  DUO_OUTRO_TITLE_TOP,
  DUO_TITLE_TOP,
  type DuoOutroPlan,
  type RunnerFrame,
} from "./duo";

/* Everything that sits over the two drawing routes.
 *
 * Inline-styled rather than tokenised, like every other composition: this is
 * also rendered headlessly, where no stylesheet is loaded. The literals trace
 * back to DESIGN.md the same way `styles.css` does — see the comments.
 *
 * Every part here is drawn twice over the film's life: once in the running
 * layout, and once where the closing card puts it. Which is why nothing is laid
 * out by the flow — a part that travels has to be positioned in both places at
 * the same time, and `duo.ts` owns the two rectangles it moves between. */

// {colors.primary} — cobalt, the brand stamp on the mark.
const COBALT = "#494fdf";
// {colors.on-dark} and its two mutes.
export const ON_DARK = "#ffffff";
const ON_DARK_MUTE = "rgba(255,255,255,0.72)";
export const ON_DARK_FAINT = "rgba(255,255,255,0.64)";
/** The unfilled part of a runner's bar. {colors.hairline-dark}, one step up. */
export const TRACK = "rgba(255,255,255,0.18)";

/** Type ramp for this template. Smaller than the replay's hero, because there
 *  are two of everything and both have to be read at a glance. */
const TYPE = {
  label: 30,
  title: 72,
  name: 34,
  watermark: 40,
  credit: 22,
} as const;

/**
 * How a row moves its content off the left edge and into the middle, without
 * measuring it.
 *
 * A flex row's free space is shared between two spacers; growing the left one
 * from 0 to 1 walks the content from flush-left to centred, continuously. The
 * alternative is measuring the text and translating by half of what is left
 * over — and nothing in this package may measure, because a headless Chromium
 * and a jsdom test would then disagree about where the title is.
 */
function Spacer({ grow }: { grow: number }) {
  return <div style={{ flexGrow: grow, flexBasis: 0, minWidth: 0 }} />;
}

/** The colour chip that ties a bar to a trace. The only thing on screen saying
 *  which line on the map is whose, so it is drawn at name size, not as a dot in
 *  a legend. */
function InkChip({ color }: { color: string }) {
  return (
    <span
      style={{
        width: 22,
        height: 22,
        borderRadius: "50%",
        backgroundColor: color,
        flexShrink: 0,
      }}
    />
  );
}

function Metric({
  label,
  value,
  unit,
}: {
  label: string;
  value: string | number;
  unit?: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: DUO_ROW_METRIC.gap,
      }}
    >
      <div
        style={{
          fontFamily: FONT_MONO,
          fontSize: DUO_ROW_METRIC.label,
          // Spelled out rather than left to the font — see `DUO_ROW_METRIC`.
          lineHeight: `${DUO_ROW_METRIC.labelLine}px`,
          letterSpacing: `${LABEL_TRACKING}em`,
          color: ON_DARK_FAINT,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: DUO_ROW_METRIC.value,
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
              fontSize: DUO_ROW_METRIC.unit,
              fontWeight: 500,
              marginLeft: DUO_ROW_METRIC.unitGap,
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
 * One runner's three numbers, where the running layout keeps them: right of
 * their name, across the full measure.
 *
 * This is the one part of the row that does not travel. The card stands the
 * same three numbers up in a column, and a horizontal set of metrics cannot be
 * walked into a vertical one — a flex direction has no in-between. So it leaves,
 * early and downward, and the column arrives after it has gone.
 */
function RunnerNumbers({
  frame,
  top,
  out,
}: {
  frame: RunnerFrame;
  top: number;
  out: number;
}) {
  const { live, started } = frame;

  return (
    <div
      style={{
        position: "absolute",
        top,
        left: PAGE_INSET,
        right: PAGE_INSET,
        height: DUO_ROW_HEAD_HEIGHT,
        display: "flex",
        justifyContent: "flex-end",
        gap: DUO_ROW_METRIC.between,
        opacity: (started ? 1 : 0.45) * (1 - out),
        transform: `translateY(${out * 26}px)`,
      }}
    >
      <Metric label="KM" value={formatKm(live.distanceMeters)} />
      <Metric label="TIME" value={formatClock(live.elapsedSeconds)} />
      <Metric
        label="PACE"
        value={formatPace(live.paceSecondsPerKm)}
        unit="/KM"
      />
    </div>
  );
}

/**
 * Who this row belongs to — the chip in their ink and their name.
 *
 * Travels: it starts at the left of a full-width row and ends centred under
 * their face, on their own column. A runner who hasn't set off yet keeps their
 * row — it dims rather than appearing, because a bar that arrives two seconds
 * in reads as a glitch, and because "not started yet" is one of the things this
 * film is showing.
 */
function RunnerHeadline({
  frame,
  index,
  move,
}: {
  frame: RunnerFrame;
  index: number;
  move: number;
}) {
  const { runner, started } = frame;
  // The numbers are on their own layer and no longer push the name out of their
  // way, so the room they take is handed to the box instead.
  const box = duoHeadlineBox(index, move, duoNumbersWidth(frame.live));

  return (
    <div
      style={{
        position: "absolute",
        top: box.top,
        left: box.left,
        right: box.right,
        height: DUO_ROW_HEAD_HEIGHT,
        display: "flex",
        alignItems: "center",
        opacity: started ? 1 : 0.45,
      }}
    >
      <Spacer grow={move} />
      <span
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          fontSize: TYPE.name,
          fontWeight: 600,
          lineHeight: 1,
          letterSpacing: "-0.01em",
          color: ON_DARK,
          minWidth: 0,
          overflow: "hidden",
          whiteSpace: "nowrap",
          textOverflow: "ellipsis",
        }}
      >
        <InkChip color={runner.color} />
        {runner.name}
      </span>
      <Spacer grow={1} />
    </div>
  );
}

/**
 * How far along a runner is against the longer of the two runs — see
 * `duoBarFill`, so the space between the two ends is the space between the two
 * runners.
 *
 * Travels, and it is the move's clearest line: two bars stacked on one measure
 * come apart into two columns, which is the whole rearrangement said in one
 * element.
 */
function RunnerFill({
  frame,
  index,
  fill,
  move,
}: {
  frame: RunnerFrame;
  index: number;
  fill: number;
  move: number;
}) {
  const box = duoFillBox(index, move);

  return (
    <div
      style={{
        position: "absolute",
        top: box.top,
        left: box.left,
        right: box.right,
        height: DUO_BAR_HEIGHT,
        borderRadius: 9999,
        backgroundColor: TRACK,
        overflow: "hidden",
        opacity: frame.started ? 1 : 0.45,
      }}
    >
      <div
        style={{
          height: DUO_BAR_HEIGHT,
          width: `${fill * 100}%`,
          backgroundColor: frame.runner.color,
          borderRadius: 9999,
        }}
      />
    </div>
  );
}

/** The run and its date. Left-aligned under the mark while the film plays, then
 *  down and into the middle once the mark has moved out of the way. */
function DuoHeader({
  activity,
  move,
}: {
  activity: VideoActivity;
  move: number;
}) {
  return (
    <div
      style={{
        position: "absolute",
        top: mix(move, DUO_TITLE_TOP, DUO_OUTRO_TITLE_TOP),
        left: PAGE_INSET,
        right: PAGE_INSET,
        display: "flex",
        flexDirection: "column",
        gap: 20,
      }}
    >
      <Centred move={move}>
        <div
          style={{
            fontFamily: FONT_MONO,
            fontSize: TYPE.label,
            // The watermark sits on this line, outside the fade — matching the
            // line box is what keeps the two ends of the row level.
            lineHeight: `${TYPE.watermark}px`,
            letterSpacing: `${LABEL_TRACKING}em`,
            color: ON_DARK_MUTE,
            whiteSpace: "nowrap",
          }}
        >
          {formatStartDate(activity)}
        </div>
      </Centred>
      <Centred move={move}>
        <h1
          style={{
            margin: 0,
            fontSize: TYPE.title,
            fontWeight: 500,
            lineHeight: 1.05,
            letterSpacing: "-0.01em",
            textWrap: "balance",
            // Only bites on a name long enough to wrap: a title that fits on one
            // line is a box the width of its own text, and the spacers around it
            // are what centre it. A wrapped one fills the measure, so its own
            // alignment has to change too — once, at the midpoint of a move that
            // is already carrying it across the frame.
            textAlign: move < 0.5 ? "left" : "center",
          }}
        >
          {activity.name}
        </h1>
      </Centred>
    </div>
  );
}

/** One line of the header, walked from flush-left to centred. */
function Centred({ move, children }: { move: number; children: ReactNode }) {
  return (
    <div style={{ display: "flex" }}>
      <Spacer grow={move} />
      {children}
      <Spacer grow={1} />
    </div>
  );
}

/** What sits over the two drawing routes: the run and its date at the top, a bar
 *  each along the bottom. `opacity` 0 keeps the layer mounted so the Mapbox
 *  plate underneath is never torn down and rebuilt mid-video. */
export function DuoOverlay({
  activity,
  frames,
  opacity,
  outro,
}: {
  activity: VideoActivity;
  frames: RunnerFrame[];
  opacity: number;
  outro: DuoOutroPlan;
}) {
  const fills = duoBarFill(frames);

  return (
    <AbsoluteFill style={{ opacity, fontFamily: FONT_SANS, color: ON_DARK }}>
      <DuoHeader activity={activity} move={outro.move} />

      {frames.map((frame, index) => (
        <RunnerNumbers
          key={frame.runner.key}
          frame={frame}
          top={DUO_ROW_TOPS[index]}
          out={outro.rowsOut}
        />
      ))}

      {/* After the numbers, and after the card: the two parts that travel are
          the two that have to stay on top of everything they travel over. */}
      {frames.map((frame, index) => (
        <RunnerHeadline
          key={frame.runner.key}
          frame={frame}
          index={index}
          move={outro.move}
        />
      ))}

      {frames.map((frame, index) => (
        <RunnerFill
          key={frame.runner.key}
          frame={frame}
          index={index}
          fill={fills[index]}
          move={outro.move}
        />
      ))}
    </AbsoluteFill>
  );
}

/* ---- Furniture ---------------------------------------------------------- */

/** Our stamp on a file that leaves the app for somebody else's feed. Rides above
 *  the overlay's fade and stays up for every frame — a watermark that comes and
 *  goes is a title card. On the date's line, against the same gutter, and inside
 *  the safe area: a story's own UI covers the strip the replay puts it in.
 *
 *  It is also the only part of the film that moves *into* the middle rather than
 *  out of it: the card is signed, so the mark leads it. */
export function Watermark({ move = 0 }: { move?: number }) {
  return (
    <div
      style={{
        position: "absolute",
        top: DUO_TITLE_TOP,
        left: PAGE_INSET,
        right: PAGE_INSET,
        height: TYPE.watermark,
        display: "flex",
        alignItems: "center",
        fontFamily: FONT_SANS,
        color: ON_DARK,
      }}
    >
      <Spacer grow={1} />
      <span style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <VivaceMark
          style={{
            width: TYPE.watermark,
            height: TYPE.watermark,
            color: COBALT,
          }}
        />
        <span
          style={{
            fontSize: TYPE.watermark,
            fontWeight: 600,
            lineHeight: 1,
            letterSpacing: "-0.01em",
          }}
        >
          vivace
        </span>
      </span>
      <Spacer grow={move} />
    </div>
  );
}

/** The bar across the top that says how much of the story is left — the format's
 *  own furniture, filling once across the single shot. */
export function StoryProgress({ progress }: { progress: number }) {
  return (
    <div
      style={{
        position: "absolute",
        top: 37,
        left: 53,
        right: 53,
        height: 8,
        borderRadius: 9999,
        backgroundColor: "rgba(255,255,255,0.22)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          height: 8,
          backgroundColor: ON_DARK,
          width: `${Math.min(1, Math.max(0, progress)) * 100}%`,
        }}
      />
    </div>
  );
}

export const CREDIT_SIZE = TYPE.credit;
