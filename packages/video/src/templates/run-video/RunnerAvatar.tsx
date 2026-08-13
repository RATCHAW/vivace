import { useState } from "react";
import { useDelayRender } from "remotion";
import { RUNNER_AVATAR_RING, RUNNER_AVATAR_SIZE } from "./data";

// DESIGN.md {colors.primary} — the same cobalt as the trace this rides the head
// of, so the marker reads as part of the line rather than a badge on top of it.
const RING_COLOR = "#494fdf";

/** The athlete's Strava picture, riding the head of the trace in place of the
 *  plain dot. Positioned in composition pixels: `x`/`y` are where the runner is
 *  on the plate, and the puck is centred on them.
 *
 *  The frame is held until the picture has loaded — a headless render would
 *  otherwise screenshot an empty ring — and released again if it never does, so
 *  a CDN hiccup costs the avatar rather than the whole video. Remotion's `<Img>`
 *  gates a frame the same way, but it mounts a `<Sequence>` around the image,
 *  and this marker is drawn inside the map plate, not on the timeline. */
export function RunnerAvatar({
  src,
  x,
  y,
}: {
  src: string;
  x: number;
  y: number;
}) {
  const { delayRender, continueRender } = useDelayRender();
  const [handle] = useState(() => delayRender("Loading the runner avatar"));
  const [failed, setFailed] = useState(false);

  if (failed) return null;

  return (
    <img
      src={src}
      alt=""
      onLoad={() => continueRender(handle)}
      onError={() => {
        setFailed(true);
        continueRender(handle);
      }}
      style={{
        position: "absolute",
        left: x,
        top: y,
        width: RUNNER_AVATAR_SIZE,
        height: RUNNER_AVATAR_SIZE,
        // Positioned by its centre, which is the point the camera tracks.
        transform: "translate(-50%, -50%)",
        borderRadius: "50%",
        border: `${RUNNER_AVATAR_RING}px solid ${RING_COLOR}`,
        boxSizing: "border-box",
        // Strava's pictures are square, but a non-square one would letterbox.
        objectFit: "cover",
        backgroundColor: "#000000",
      }}
    />
  );
}
