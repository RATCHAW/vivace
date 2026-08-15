/**
 * How long a template's film is for a *given run* — variable by design.
 *
 * A five-kilometre run has fewer splits to show than a marathon and a run with
 * three numbers is a shorter film than one with five; padding either to a fixed
 * length is how a template starts to feel like one. The catalogue still carries
 * a `durationInFrames`, and it is what a composition gets when nothing has
 * calculated anything (Remotion Studio's default, a bundle without
 * `calculateMetadata`) — so every template lays its beats out against the
 * duration it was actually handed, and fills it.
 *
 * React-free: `Root.tsx` calls this from `calculateMetadata`, apps/web calls it
 * to size the `<Player>`, and both have to agree with the file Lambda renders.
 */
import { secondsToFrames } from "./core/timing";
import { getTemplate, type TemplateId } from "./registry";
import type { TemplateInput } from "./eligibility";
import { minimalNumbersSeconds } from "./templates/minimal-numbers/moments";
import { POSTER_SECONDS } from "./templates/living-poster/poster";
import { splitRushSeconds } from "./templates/split-rush/splits";

/**
 * The hard ceiling: Instagram cuts a story segment at 15 seconds, and a film
 * that gets cut in half by the platform it was made for is a bug.
 *
 * A template without an estimator keeps its catalogue duration, which must also
 * stay within this ceiling.
 */
export const MAX_STORY_SECONDS = 15;
const MIN_STORY_SECONDS = 6;

/** Seconds of film, or null for a template whose length doesn't depend on the
 *  run. */
function estimateSeconds(id: TemplateId, input: TemplateInput): number | null {
  switch (id) {
    case "split-rush":
      return splitRushSeconds(input.activity, input.streams);
    case "minimal-numbers":
      return minimalNumbersSeconds(input.activity);
    case "living-poster":
      return POSTER_SECONDS;
    default:
      return null;
  }
}

export function estimateDurationInFrames(
  id: TemplateId,
  input: TemplateInput,
): number {
  const template = getTemplate(id);
  const seconds = estimateSeconds(id, input);
  if (seconds == null) return template.durationInFrames;
  return secondsToFrames(
    Math.min(MAX_STORY_SECONDS, Math.max(MIN_STORY_SECONDS, seconds)),
    template.fps,
  );
}
