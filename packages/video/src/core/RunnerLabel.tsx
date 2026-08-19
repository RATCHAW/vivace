import { FONT_SANS } from "./layout";
import { RUNNER_AVATAR_SIZE, RUNNER_DOT_RADIUS, RUNNER_LABEL } from "./marker";

/**
 * The plate the name sits on, over a map.
 *
 * Translucent so the tiles under it stay part of the picture. On the key plate
 * it is flattened over the canvas it was designed against and handed in — see
 * `core/greenscreen.ts`; a 72%-black tag over chroma green composites to dark
 * green and is cut away with the background.
 */
export const RUNNER_LABEL_PLATE = "rgba(0,0,0,0.72)";

/** The hairline that gives the plate an edge over a busy tile. */
const BORDER = 2;

/**
 * Whose trace this is, riding the head of it.
 *
 * A duo film draws both runners in the one house ink, so the line no longer says
 * who is who and this is what does. Positioned in composition pixels and centred
 * on the marker, hanging off it: `x`/`y` are where the runner is on the plate,
 * exactly as they are for `RunnerAvatar`, so the two ride the same head.
 *
 * Truncated rather than wrapped — see `RUNNER_LABEL.maxWidth`, which is also
 * what lets the camera work out the berth this is owed.
 */
export function RunnerLabel({
  name,
  x,
  y,
  avatar = false,
  above = false,
  plate = RUNNER_LABEL_PLATE,
}: {
  name: string;
  x: number;
  y: number;
  /** True when a face is riding this head, which is the taller marker to clear. */
  avatar?: boolean;
  /**
   * Hang the plate over the marker rather than under it.
   *
   * Two people who ran together are level for most of the film, and two plates
   * on the same side of two markers a stride apart cover each other. So they
   * take a side each — see `DuoReplay`, which gives the athlete the upper one to
   * match the order of the bars. Deterministic, and it needs no measuring: the
   * one thing this package may not do.
   */
  above?: boolean;
  plate?: string;
}) {
  const reach = avatar ? RUNNER_AVATAR_SIZE / 2 : RUNNER_DOT_RADIUS;
  // The border is inside the height, so the line box is what is left of it —
  // spelled out rather than left to `line-height: normal`, which is a font
  // metric and would put the name in two places on two renderers.
  const line = RUNNER_LABEL.height - 2 * BORDER;

  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: above
          ? y - reach - RUNNER_LABEL.gap - RUNNER_LABEL.height
          : y + reach + RUNNER_LABEL.gap,
        transform: "translateX(-50%)",
        maxWidth: RUNNER_LABEL.maxWidth,
        height: RUNNER_LABEL.height,
        boxSizing: "border-box",
        padding: `0 ${RUNNER_LABEL.paddingX}px`,
        borderRadius: 9999,
        backgroundColor: plate,
        // Over the plate's own background, so it survives the key with it.
        border: `${BORDER}px solid rgba(255,255,255,0.14)`,
        fontFamily: FONT_SANS,
        fontSize: RUNNER_LABEL.fontSize,
        fontWeight: 600,
        lineHeight: `${line}px`,
        letterSpacing: "-0.01em",
        color: "#ffffff",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
      }}
    >
      {name}
    </div>
  );
}
