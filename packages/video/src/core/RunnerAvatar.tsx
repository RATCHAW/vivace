import { useState } from "react";
import { useDelayRender } from "remotion";
import { RUNNER_AVATAR_RING, RUNNER_AVATAR_SIZE } from "./marker";

/** An athlete's Strava picture, riding the head of a trace in place of the
 *  plain dot. Positioned in composition pixels: `x`/`y` are where the runner is
 *  on the plate, and the puck is centred on them.
 *
 *  `ring` is the trace's own ink, so the marker reads as part of the line rather
 *  than a badge on top of it — and in a film with two runners in it, the ring is
 *  the only thing on the map saying which face is which.
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
  ring,
}: {
  src: string;
  x: number;
  y: number;
  ring: string;
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
        border: `${RUNNER_AVATAR_RING}px solid ${ring}`,
        boxSizing: "border-box",
        // Strava's pictures are square, but a non-square one would letterbox.
        objectFit: "cover",
        backgroundColor: "#000000",
      }}
    />
  );
}
