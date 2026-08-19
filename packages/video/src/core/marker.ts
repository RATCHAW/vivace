/**
 * What rides the head of a trace, and how much room it is owed.
 *
 * Shared by the three things that have to agree about it: the Mapbox plate and
 * the bare canvas that draw it, and the camera that has to keep it in frame. A
 * marker sized in one place and framed with a number from another is how a face
 * ends up cropped by the edge of the story.
 *
 * React-free — `core/camera.ts` reads the clearances.
 */

/** Half the plain runner dot: a 13px circle under a 7px stroke. */
export const RUNNER_DOT_RADIUS = 20;

/** The avatar puck's diameter. A dot only has to be seen; a face has to be
 *  recognised — so it is three times the dot, and still a ninth of the frame's
 *  width, which is what keeps it riding the route rather than covering it. */
export const RUNNER_AVATAR_SIZE = 120;

/** The ring around the picture, drawn in the same ink as the trace it heads —
 *  which in a two-runner film is also the only thing saying who it is. */
export const RUNNER_AVATAR_RING = 8;

/** Room between the marker's edge and the safe box. */
const RUNNER_MARGIN = 28;

/** Pixels of safe box the head of the trace is never allowed to sit within.
 *  A marker grazing the boundary reads as one about to leave — the trace behind
 *  it may touch, the head may not. */
export const RUNNER_CLEARANCE = RUNNER_DOT_RADIUS + RUNNER_MARGIN;

/** The same, for the avatar puck: three times the dot needs its own berth, or
 *  the shot the dot fitted crops the athlete's face at the frame's edge. */
export const RUNNER_AVATAR_CLEARANCE = RUNNER_AVATAR_SIZE / 2 + RUNNER_MARGIN;

/** Strava hands back a bare `"avatar/athlete/large.png"` — a sprite name, not a
 *  URL — for athletes who never set a picture, and an empty string is how a
 *  composition is told to keep the plain dot. Anything that isn't an absolute
 *  http(s) URL is therefore no avatar at all. */
export function avatarSource(profile: string | null | undefined): string {
  return profile && /^https?:\/\//.test(profile) ? profile : "";
}
