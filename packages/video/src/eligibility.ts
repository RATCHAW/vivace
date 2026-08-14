/**
 * Which templates a given run can actually be cut with, and why not.
 *
 * This drives the picker: an ineligible template is shown greyed with its
 * reason, never hidden. An athlete on a treadmill should be able to see that the
 * route replay exists and understand in four words why this run can't have one —
 * a template that disappears reads as a bug, or worse, as nothing at all.
 *
 * React-free, like the catalogue it keys off: apps/web reads it to build the
 * picker, and nothing here may reach for a component.
 */
import { cleanRoute } from "./core/geo";
import { MIN_ROUTE_POINTS } from "./templates/living-poster/poster";
import { SPLIT_METERS } from "./templates/split-rush/splits";
import { DEFAULT_TEMPLATE_ID, VIDEO_TEMPLATES, type TemplateId } from "./registry";
import type { VideoActivity, VideoStreams } from "./types";

/** What every rule is handed: the run, and whatever streams came with it. */
export interface TemplateInput {
  activity: VideoActivity;
  streams: VideoStreams;
}

/**
 * Why a template can't have this run, named rather than spelled.
 *
 * The catalogue is React-free and also runs on Lambda, where no message
 * catalogue is loaded — so it keeps its English. `apps/web` translates by this
 * key and falls back to `reason`, which means a rule added here without a
 * translation still says something true.
 */
export type EligibilityReason =
  | "needs-route"
  | "needs-two-km"
  | "needs-distance-time";

export interface Eligibility {
  eligible: boolean;
  /** Shown in the picker, in the athlete's terms — "Needs a GPS route", not
   *  "latlng stream absent". Present only when `eligible` is false. */
  reason?: string;
  /** The same thing, as a key a translation can be looked up by. Always
   *  present when `reason` is. */
  reasonKey?: EligibilityReason;
}

const OK: Eligibility = { eligible: true };

const no = (reasonKey: EligibilityReason, reason: string): Eligibility => ({
  eligible: false,
  reason,
  reasonKey,
});

/** Split Rush needs two kilometres to have anything to compare. */
const MIN_SPLIT_RUSH_METERS = 2 * SPLIT_METERS;

/**
 * One rule per template, exhaustive by type: a new entry in the catalogue does
 * not compile until it has said who it is for.
 */
const RULES: Record<TemplateId, (input: TemplateInput) => Eligibility> = {
  "run-video": ({ streams }) =>
    (streams.latlng?.data?.length ?? 0) >= 2
      ? OK
      : no("needs-route", "Needs a GPS route — this run has none"),

  "split-rush": ({ activity, streams }) => {
    if (activity.distance < MIN_SPLIT_RUSH_METERS) {
      return no("needs-two-km", "Needs at least 2 km");
    }
    const samples = Math.min(
      streams.distance?.data?.length ?? 0,
      streams.time?.data?.length ?? 0,
    );
    return samples >= 2
      ? OK
      : no("needs-distance-time", "Needs distance and time from the watch");
  },

  "living-poster": ({ streams }) =>
    cleanRoute(streams.latlng?.data ?? [], streams.time?.data).length >= MIN_ROUTE_POINTS
      ? OK
      : no("needs-route", "Needs a GPS route — this run has none"),

  // The universal fallback. This one must never be ineligible: it is what
  // renders when a run has nothing, and something always has to render.
  "minimal-numbers": () => OK,
};

export function templateEligibility(id: TemplateId, input: TemplateInput): Eligibility {
  return RULES[id](input);
}

/** Every template with its verdict, in catalogue order — the picker's data. */
export function templateEligibilities(
  input: TemplateInput,
): Array<{ id: TemplateId } & Eligibility> {
  return VIDEO_TEMPLATES.map((template) => ({
    id: template.id,
    ...RULES[template.id](input),
  }));
}

/**
 * What to cut this run with when the athlete hasn't chosen — the first eligible
 * template in catalogue order, which is why the catalogue's order is also its
 * precedence. Minimal Numbers is always eligible, so this always answers.
 */
export function recommendTemplate(input: TemplateInput): TemplateId {
  const match = VIDEO_TEMPLATES.find((template) => RULES[template.id](input).eligible);
  return match?.id ?? DEFAULT_TEMPLATE_ID;
}
