// The coach's brain: which model answers, what it is told about itself, and the
// tools that let it read the athlete's Strava history instead of guessing.
// Everything here is provider-agnostic on purpose — swapping one model for
// another is a change to `getCoachConfig` and nothing else.
//
// Several tools return a `card` field. That is a contract with the browser:
// apps/web renders the tool's output as a chart, a plan or a run card rather
// than as JSON, so the shape of those outputs is part of the UI and changing
// one means changing `coach-cards.tsx` with it.
import {
  APICallError,
  createGateway,
  RetryError,
  tool,
  type LanguageModel,
  type StreamTextTransform,
  type TextStreamPart,
  type ToolSet,
} from "ai";
import { z } from "zod";
import {
  fetchAthlete,
  fetchRun,
  fetchRunDetail,
  fetchRuns,
  fetchRunStreams,
  StravaApiError,
  type BestEffort,
} from "./strava.js";
import { getContext, getPlan, saveContext } from "./coach-store.js";
import { getFeatureVariantFor } from "./posthog.js";
import {
  describeGoal,
  readTraining,
  toQueue,
  toSignals,
  weeksToRace,
} from "./briefing.js";
import {
  bestPerDistance,
  clock,
  decoupling,
  localDate,
  pace,
  predictRaces,
  routePath,
  toSplits,
  weeklyVolume,
  weekStart,
} from "./training.js";
import type { Run } from "./schemas.js";

// The pure helpers moved to training.ts, where they are unit-tested. Re-exported
// here because they are the coach's own vocabulary and callers import them from
// the coach.
export { clock, pace, toSplits, weekStart } from "./training.js";

/**
 * DeepSeek V4 Flash unless `COACH_MODEL` names another model the gateway
 * routes. Written `vendor/model`, which pins the vendor; a bare id would let
 * the gateway pick one for us, and a coach whose model changes underneath it
 * is a coach whose answers change for no reason the athlete can see.
 */
const DEFAULT_MODEL = "deepseek/deepseek-v4-flash";

/**
 * LLM Gateway speaks the AI SDK's own gateway protocol, and its URL carries the
 * SDK major it answers for: v4 is AI SDK 7, which is what `ai` is pinned to in
 * package.json. Bumping the SDK past 7 means bumping this with it. Overridable
 * because the gateway is self-hostable.
 */
const DEFAULT_GATEWAY_URL = "https://api.llmgateway.io/v4/ai";

export interface CoachConfig {
  model: LanguageModel;
  modelId: string;
}

/**
 * Null until an API key is configured — the chat route turns that into a 503
 * with a `not_configured` reason rather than a crash, the same way the render
 * routes treat a missing Remotion Lambda deployment.
 *
 * `override` is the model a feature flag's variant named, and it wins over the
 * env var: a variant exists precisely so a model can be changed without a
 * deploy. Null still means "no API key" and nothing else — a variant can only
 * ever change *which* model is asked for, never whether one can be.
 */
export function getCoachConfig(override?: string): CoachConfig | null {
  const apiKey = process.env.LLM_GATEWAY_API_KEY;
  if (!apiKey) return null;
  // `||`, not `??`: docker-compose passes an unset variable through as "".
  const modelId = override || process.env.COACH_MODEL || DEFAULT_MODEL;
  const gateway = createGateway({
    apiKey,
    baseURL: process.env.LLM_GATEWAY_URL || DEFAULT_GATEWAY_URL,
  });
  return { model: gateway(modelId), modelId };
}

/** What the operator has to do about it. Logged, never sent to the browser. */
export const COACH_NOT_CONFIGURED =
  "No model API key is configured. Get a key from " +
  "https://llmgateway.io and set LLM_GATEWAY_API_KEY in apps/api/.env.";

/**
 * Why a turn produced no answer, as a token rather than a sentence.
 *
 * The provider's own message is written for whoever holds the API key — a
 * quota metric, a model id, a retry-in, a link to a billing page — and it
 * reaches the browser verbatim unless something maps it first. The chat route
 * sends one of these instead and apps/web writes the sentence, in the athlete's
 * language; the real error is already in the log line and on the PostHog trace.
 *
 * Adding a reason means adding its copy to both catalogues in
 * `apps/web/src/i18n/messages` — an unknown token falls back to `failed`, so a
 * new one is a vaguer sentence rather than a broken screen.
 */
export type CoachFailure =
  "not_configured" | "rate_limited" | "unavailable" | "failed";

export function coachFailure(error: unknown): CoachFailure {
  // `maxRetries` wraps the thing that actually broke: the SDK retried a 429
  // three times and threw "Failed after 3 attempts. Last error: …".
  const cause = RetryError.isInstance(error) ? error.lastError : error;

  if (APICallError.isInstance(cause)) {
    if (cause.statusCode === 429) return "rate_limited";
    // No status at all is a connection that never landed.
    if (cause.statusCode === undefined || cause.statusCode >= 500) {
      return "unavailable";
    }
  }

  // Providers disagree about which status carries a quota, and an overloaded
  // model often arrives as a 503 whose message is the only thing that says so.
  // A gateway adds a second source of both — its own limits, and whichever
  // upstream it routed to. The wording is a hint, never the only source.
  const message = cause instanceof Error ? cause.message.toLowerCase() : "";
  if (/quota|rate limit|too many requests/.test(message)) return "rate_limited";
  if (/overloaded|unavailable|timed out|timeout/.test(message)) {
    return "unavailable";
  }
  return "failed";
}

/**
 * Drops the arguments of a tool call the stream never announced.
 *
 * `tool-input-delta` carries a tool call's arguments arriving character by
 * character, and it means nothing without the `tool-input-start` that says
 * which tool they belong to. The SDK refuses one that arrives without it —
 * `Received tool-input-delta for missing tool call with ID …` — and it refuses
 * it *on the server*, in the pass that rebuilds the answer for `onEnd`, so a
 * provider that skips the announcement costs the athlete the whole turn and the
 * answer is never stored. `tool-input-end` needs no such guard: it maps to no
 * UI chunk at all.
 *
 * Dropped rather than repaired: a delta carries no tool name, so there is
 * nothing to invent the missing start from. Nothing is lost but the arguments
 * animating in — `tool-call` still arrives with the complete input, which is
 * what actually runs the tool, and every card this app draws is drawn from a
 * tool's *result*.
 */
export function dropUnannouncedToolInput<TOOLS extends ToolSet>(
  onDrop: (toolCallId: string) => void,
): StreamTextTransform<TOOLS> {
  return () => {
    const announced = new Set<string>();
    const dropped = new Set<string>();

    return new TransformStream<TextStreamPart<TOOLS>, TextStreamPart<TOOLS>>({
      transform(part, controller) {
        if (part.type === "tool-input-start") announced.add(part.id);

        if (part.type === "tool-input-delta" && !announced.has(part.id)) {
          // Once per tool call, not once per character — a dropped argument
          // list is hundreds of deltas and one thing worth knowing.
          if (!dropped.has(part.id)) {
            dropped.add(part.id);
            onDrop(part.id);
          }
          return;
        }

        controller.enqueue(part);
      },
    });
  };
}

const BASE_SYSTEM_PROMPT = `
You are Vivace's running coach. You are talking to one athlete, inside their own
training app, and you can read their Strava history with the tools you have been
given.

How you work:
- Look before you answer. Any question about the athlete's fitness, form, volume,
  pace or a specific session is a question about data you can fetch — call a tool
  first rather than asking them to describe their own training. Ask a clarifying
  question only when the data genuinely cannot settle it (which race, what has
  hurt, which days they can run).
- Be concrete. "Sunday, 14 km at 6:05 /km" beats "a longer easy run". Give
  distances, paces and days the athlete can act on tomorrow.
- Metric by default: kilometres, min/km pace, metres of elevation. Match the
  athlete if they consistently use miles.
- Keep it short. A few sentences. No preamble, no restating the question.
- Coach honestly. If the data says their easy runs are too fast or their volume
  jumped 40% in a week, say so plainly and say what to do about it.

Some tools draw something the athlete can see:
- \`getRunDebrief\` and \`getRunSplits\` draw the run, its splits and its heart
  rate. \`summariseTraining\` draws the weekly volume chart. \`predictRaces\`
  draws the best-effort table. \`proposeWeek\` draws the week as seven session
  cards with an Accept button.
- When you have drawn one, do not repeat it as a markdown table or a list of the
  same numbers. Write the read the chart cannot: what it means and what to do.
  Two or three sentences, naming at most a couple of specific figures.

Asking back: when something you genuinely cannot look up would change your
answer — which race, what hurts, which days they can run, how a session felt —
ask it with \`askAthlete\` instead of writing the question into your reply. It
draws the questions as a form the athlete taps through, one at a time, and their
answers arrive as their next message. Rules: at most one form per turn, and only
the questions the tools cannot answer for you. Every question can be skipped and
every choice question carries its own free-text box, so list the answers you
expect and never an "Other" — the athlete always has a way past you. Under the
form, one short line at most: they are answering, not reading. Then act on what
comes back — whatever belongs to their goals goes straight into
\`setAthleteContext\`, and a question they skipped is one you do not ask again.

Memory: \`getAthleteContext\` is the goal race, target time and long-run day.
Call \`setAthleteContext\` the moment the athlete tells you any of it — a race,
a date, a target, an injury, the days they can run — so the next thread starts
knowing. Never ask for something the context already holds.

Planning: when the athlete asks for a week, a plan or a taper, write it with
\`proposeWeek\`. Seven days numbered 0 = Monday … 6 = Sunday, never 1 to 7, rest
days included with 0 km. Build
it around the goal race and the load numbers, not around a template.

Boundaries: you coach running, not medicine. Pain that persists, or anything
that sounds like an injury, gets one sentence pointing at a physio or doctor —
then get back to what they can safely do meanwhile. If a tool fails or the
athlete has no runs yet, say so instead of inventing numbers.
`.trim();

/** The languages apps/web ships in, as the chat request sends them. */
export type CoachLanguage = "en" | "fr";

const LANGUAGE_NAMES: Record<CoachLanguage, string> = {
  en: "English",
  fr: "French",
};

/**
 * `v2-terse`: the same coach, told to spend fewer words.
 *
 * Written as an addendum rather than a second copy of the whole prompt. A
 * variant *may* be a whole prompt — the catalogue below holds strings, not
 * patches — but this one changes the output rules and nothing else, and forty
 * duplicated lines would drift the first time the base prompt learned a tool.
 */
const TERSE_ADDENDUM = `
Above anything said about length so far: two sentences, three at the very most.
Lead with the instruction and leave the reasoning out unless it changes what
they should do — the athlete is reading this on a phone, between other things.
No greeting, no restating the question, and no closing offer to help further.
`.trim();

/**
 * The prompts that can answer a turn, by version.
 *
 * A version key, not the prompt text itself, is what a flag's payload names.
 * The payload *could* carry the whole prompt and be edited in PostHog with no
 * deploy at all — but the prompt names the tools the code must actually have,
 * and in a flag textarea it loses review, diff and this file's tests. The
 * catalogue is the trade: the pairing is switchable without a deploy, the words
 * still go through a pull request.
 */
const SYSTEM_PROMPTS = {
  v1: BASE_SYSTEM_PROMPT,
  "v2-terse": `${BASE_SYSTEM_PROMPT}\n\n${TERSE_ADDENDUM}`,
} as const;

export type CoachPromptVersion = keyof typeof SYSTEM_PROMPTS;

/**
 * Every prompt a variant may name — derived from the catalogue rather than
 * written beside it, so a prompt added above is one the payload schema below
 * accepts without a second edit anyone could forget.
 */
export const PROMPT_VERSIONS = Object.keys(SYSTEM_PROMPTS) as [
  CoachPromptVersion,
  ...CoachPromptVersion[],
];

/** What the coach shipped with, and what every fallback lands on. */
export const DEFAULT_PROMPT_VERSION: CoachPromptVersion = "v1";

function isPromptVersion(value: string): value is CoachPromptVersion {
  return value in SYSTEM_PROMPTS;
}

/** What the athlete's message is folded into, when no variant says otherwise. */
export interface CoachPromptOptions {
  /** The run the composer's `@` picker put on the message. */
  attached?: AttachedRun;
  /** Which prompt in the catalogue answers this turn. */
  prompt?: CoachPromptVersion;
  /** The language the athlete is reading the app in. Defaults to English. */
  language?: CoachLanguage;
}

/**
 * The system prompt with today's date and the window the athlete has selected
 * in the thread header folded in.
 *
 * The date matters more than it looks: the model has no clock, and "last week"
 * is the single most common thing an athlete asks about.
 */
export function coachSystemPrompt(
  today: string,
  rangeWeeks: number,
  { attached, prompt, language = "en" }: CoachPromptOptions = {},
): string {
  const lines = [
    SYSTEM_PROMPTS[prompt ?? DEFAULT_PROMPT_VERSION],
    `Today is ${today}. The athlete is looking at the last ${rangeWeeks} weeks of training; prefer that window unless they ask for another.`,
  ];
  if (attached) {
    lines.push(
      `The athlete attached a run to this message: "${attached.name}" on ${attached.date}, Strava activity id ${attached.id}. "This run", "it" and "that session" mean that one — read it rather than asking which.`,
    );
  }
  if (language !== "en") {
    // Deliberately narrow. What the coach writes is prose, and this app's
    // server-generated prose is English in both languages; `askAthlete` is the
    // one thing it puts on screen as an interface, and an English form inside a
    // French screen reads as a bug rather than as an accent.
    lines.push(
      `The athlete is reading the app in ${LANGUAGE_NAMES[language]}. \`askAthlete\` draws an interface rather than something you said, so write its questions, hints and choices in ${LANGUAGE_NAMES[language]}. Everything you write yourself stays in English.`,
    );
  }
  return lines.join("\n\n");
}

/**
 * The multivariate flag that carries the model **and** the prompt.
 *
 * One flag, not two. The unit that varies is the *pair* — a prompt tuned for
 * one model is not the prompt for another — and a flag per axis would let a
 * turn land on a combination nobody meant to ship. Each variant's JSON payload
 * is the config:
 *
 * ```json
 * { "model": "anthropic/claude-sonnet-5", "prompt": "v2-terse" }
 * ```
 *
 * A PostHog experiment is this same flag with statistics attached, so the flag
 * can go in on its own and be promoted to an experiment later without a line
 * here changing.
 */
export const COACH_VARIANT_FLAG = "coach-model";

/**
 * A variant's payload, as it survives being typed into a textarea.
 *
 * Every field is optional and every field is checked. A model id that isn't
 * `vendor/model` hands the choice of vendor back to the gateway — the thing
 * `DEFAULT_MODEL`'s comment above exists to prevent — and a prompt version
 * naming nothing in the catalogue would leave the coach with no instructions at
 * all. Either one falls back to the shipped pairing rather than shipping a
 * broken one to whoever the flag rolled it out to.
 */
const variantPayloadSchema = z.object({
  model: z
    .string()
    .regex(/^[\w.-]+\/[\w.:-]+$/)
    .optional(),
  prompt: z.enum(PROMPT_VERSIONS).optional(),
});

/** Which model and which prompt answer one athlete's turn, and under what name. */
export interface CoachVariant {
  /**
   * What the flag evaluated to, for `$feature/…` attribution on the trace.
   * Unset in the ordinary case: no flag, no PostHog, or this athlete outside
   * the rollout — all of which are the shipped pairing.
   */
  variant?: string;
  /** The model the variant named, or undefined for the env var's. */
  modelId?: string;
  /** The prompt that goes with it. */
  prompt: CoachPromptVersion;
}

/**
 * `COACH_PROMPT` picks a prompt the way `COACH_MODEL` picks a model: for a
 * deploy, for a fresh clone that has never heard of PostHog, and for reading
 * one variant's answers locally without creating a flag to do it.
 */
function envPromptVersion(
  onInvalid: (source: "flag" | "env", value: unknown) => void,
): CoachPromptVersion {
  // `||`, not `??`: docker-compose passes an unset variable through as "".
  const named = process.env.COACH_PROMPT || "";
  if (!named) return DEFAULT_PROMPT_VERSION;
  if (isPromptVersion(named)) return named;
  onInvalid("env", named);
  return DEFAULT_PROMPT_VERSION;
}

/**
 * The model and prompt this athlete's turn runs on.
 *
 * Call it once, at the point the turn is actually going to happen: reading the
 * flag is what sends `$feature_flag_called`, and an athlete whose request was
 * about to 404 was never exposed to anything.
 *
 * `onInvalid` rather than a logger, for the same reason
 * `dropUnannouncedToolInput` takes one — this is called from a handler, where
 * the request's own child logger is what makes a line traceable. Nothing here
 * is swallowed: a payload we refuse is a flag someone typed wrong, and it is
 * invisible until it is said out loud.
 */
export async function resolveCoachVariant(
  distinctId: string,
  onInvalid: (source: "flag" | "env", value: unknown) => void,
): Promise<CoachVariant> {
  const evaluated = await getFeatureVariantFor(COACH_VARIANT_FLAG, distinctId);

  // The arm an experiment splits on. A `true` value is a payload-only flag,
  // which is one config for everyone rather than an arm — nothing to attribute.
  let variant: string | undefined;
  /** What the flag decided, once it has been believed. */
  let chosen: z.infer<typeof variantPayloadSchema> = {};

  if (evaluated) {
    variant = typeof evaluated.value === "string" ? evaluated.value : undefined;

    // A flag that is on and carries nothing is one someone created and hasn't
    // filled in yet. That is the shipped pairing, not a broken payload.
    if (evaluated.payload !== undefined && evaluated.payload !== null) {
      const parsed = variantPayloadSchema.safeParse(evaluated.payload);
      // Refused whole, never half: the pair is the unit that varies, so taking
      // the good half of a bad payload would build a pairing nobody chose.
      if (parsed.success) chosen = parsed.data;
      else onInvalid("flag", evaluated.payload);
    }
  }

  return {
    variant,
    modelId: chosen.model,
    // Read last, and only when the flag left the question open — otherwise a
    // typo in COACH_PROMPT would be reported on every turn that ignored it.
    prompt: chosen.prompt ?? envPromptVersion(onInvalid),
  };
}

/** The run the composer's `@` picker put on a message. */
export interface AttachedRun {
  id: number;
  name: string;
  date: string;
}

/**
 * Metadata is only validated when a schema is supplied, and an unvalidated
 * field would reach the model as whatever the browser felt like sending.
 *
 * Optional at the top level because `validateUIMessages` runs this against
 * every message's metadata whether or not it has any, and most messages don't.
 */
export const coachMessageMetadataSchema = z
  .object({
    run: z
      .object({ id: z.number().int(), name: z.string(), date: z.string() })
      .optional(),
  })
  .optional();

/** The run attached to the newest message in a transcript, if there is one. */
export function attachedRun(
  messages: { metadata?: unknown }[],
): AttachedRun | undefined {
  const parsed = coachMessageMetadataSchema.safeParse(
    messages.at(-1)?.metadata,
  );
  return parsed.success ? parsed.data?.run : undefined;
}

// --- tool output shaping ------------------------------------------------------
// Tool results go back into the model's context as well as to the browser, so
// they are formatted small: no raw Strava payloads, no stream arrays with 3000
// entries, and numbers already in the units a runner reads.

function paceOf(run: Run): string | null {
  return pace(run.average_speed > 0 ? 1000 / run.average_speed : null);
}

function summariseRun(run: Run) {
  return {
    id: run.id,
    date: localDate(run),
    name: run.name,
    sport_type: run.sport_type,
    workout_type: run.workout_type,
    km: Number((run.distance / 1000).toFixed(2)),
    duration: clock(run.moving_time),
    pace_per_km: paceOf(run),
    avg_heartrate: run.average_heartrate,
    elevation_m: Math.round(run.total_elevation_gain),
  };
}

/** `Aug 5` — how a run is named in a card title. */
function shortDate(date: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}

/** What a tool says when Strava, not the coach, is the thing that broke. */
function stravaFailure(err: unknown): { error: string } {
  if (err instanceof StravaApiError) {
    return err.status === 401 || err.status === 403
      ? {
          error:
            "Strava denied access. Ask the athlete to sign out and back in.",
        }
      : { error: `Strava is unavailable right now (${err.status}).` };
  }
  throw err;
}

/**
 * How this run sits against the four weeks behind it.
 *
 * The debrief card carries one factual line rather than a written one: it is
 * built before the model writes a word, so it states what is measurable and
 * leaves the reading to the answer underneath it.
 */
function comparisonLine(run: Run, runs: Run[], today: string): string {
  const window = runs.filter((other) => {
    const date = localDate(other);
    return other.id !== run.id && date <= today && date >= addWeeks(today, -4);
  });
  if (window.length === 0)
    return "First run in this window — nothing to compare it to yet.";

  const meanKm =
    window.reduce((sum, other) => sum + other.distance, 0) /
    window.length /
    1000;
  const km = run.distance / 1000;
  const deltaKm = km - meanKm;
  const parts = [
    `${Math.abs(deltaKm).toFixed(1)} km ${deltaKm >= 0 ? "longer" : "shorter"} than the four-week average of ${meanKm.toFixed(1)} km`,
  ];

  const withHr = window.filter((other) => (other.average_heartrate ?? 0) > 0);
  if (run.average_heartrate && withHr.length) {
    const meanHr =
      withHr.reduce((sum, other) => sum + (other.average_heartrate ?? 0), 0) /
      withHr.length;
    const deltaHr = Math.round(run.average_heartrate - meanHr);
    parts.push(
      deltaHr === 0
        ? "at exactly the usual heart rate"
        : `at ${Math.abs(deltaHr)} bpm ${deltaHr > 0 ? "above" : "below"} the usual`,
    );
  }
  return `${parts.join(", ")}.`;
}

function addWeeks(date: string, weeks: number): string {
  const day = new Date(`${date}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() + weeks * 7);
  return day.toISOString().slice(0, 10);
}

/**
 * Which runs are worth spending a detail call on to find best efforts.
 *
 * Strava only returns best efforts on the per-activity endpoint, and the budget
 * is roughly 100 requests per quarter hour for the whole app. A PR lives in a
 * fast run or a long one, so the candidates are the quickest handful plus the
 * furthest — never the whole history.
 */
const PR_CANDIDATES = 6;

function prCandidates(runs: Run[], today: string): Run[] {
  const window = runs.filter(
    (run) => localDate(run) >= addWeeks(today, -26) && run.distance >= 1500,
  );
  const fastest = [...window]
    .sort((a, b) => b.average_speed - a.average_speed)
    .slice(0, PR_CANDIDATES);
  const longest = [...window].sort((a, b) => b.distance - a.distance)[0];
  const chosen = new Map(fastest.map((run) => [run.id, run]));
  if (longest) chosen.set(longest.id, longest);
  return [...chosen.values()];
}

/**
 * One run as the card the athlete sees.
 *
 * Shared by the `getRunDebrief` tool and by the webhook that posts a debrief
 * the moment a run finishes uploading, so the automatic card and the one the
 * coach draws when asked are the same object rather than two that drifted.
 */
export async function buildRunDebriefCard(
  accessToken: string,
  runs: Run[],
  today: string,
  id?: number,
) {
  const target = id ? runs.find((run) => run.id === id) : runs[0];
  if (!target && !id) return null;

  const detail = await fetchRunDetail(accessToken, target?.id ?? id!);
  const run = target ?? detail.run;
  const date = localDate(run);

  return {
    card: "run-debrief" as const,
    run_id: run.id,
    title: `${run.name} · ${shortDate(date)}`,
    date,
    stamp:
      run.workout_type === "default"
        ? "RUN"
        : run.workout_type.replace("_", " ").toUpperCase(),
    route_path: routePath(detail.polyline),
    line: comparisonLine(run, runs, today),
    stats: [
      { label: "DISTANCE", value: `${(run.distance / 1000).toFixed(2)} km` },
      { label: "TIME", value: clock(run.moving_time) },
      { label: "PACE", value: `${paceOf(run) ?? "—"} /km` },
      {
        label: "AVG HR",
        value: run.average_heartrate
          ? `${Math.round(run.average_heartrate)}`
          : "—",
      },
    ],
    elevation_m: Math.round(run.total_elevation_gain),
    calories: detail.calories,
  };
}

// --- asking the athlete something ---------------------------------------------

/**
 * How much one questionnaire may hold.
 *
 * The caps are the feature, not a safety rail. Left alone a model asks a dozen
 * things at once, and a dozen-step form in the middle of a conversation is a
 * form nobody finishes — five questions is about as far as an athlete will tap
 * before typing "just tell me" instead.
 *
 * Choices stop at seven because a week has seven days. "Which days can you
 * run?" is the question this whole tool exists for — the system prompt asks
 * the coach to find it out, and `setAthleteContext` has a field waiting for
 * the answer — and a six-choice ceiling made it the one question that could
 * not be asked.
 */
const MAX_QUESTIONS = 5;
const MAX_CHOICES = 7;

/** How long each piece of writing may be before the form stops fitting. */
const MAX_LENGTH = {
  intro: 160,
  question: 140,
  hint: 160,
  label: 60,
  choiceHint: 80,
  unit: 20,
  placeholder: 60,
} as const;

/**
 * One trimmed string, cut to length rather than rejected, and null when there
 * is nothing left.
 *
 * These lengths are what keeps a choice on one line and the form on one
 * screen. They are enforced here rather than on the input schema for the same
 * reason the two counts are: a model writing a sentence four characters too
 * long should cost the athlete four characters, not the answer.
 */
function clamp(value: string | null | undefined, limit: number): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return trimmed.length > limit ? `${trimmed.slice(0, limit - 1)}…` : trimmed;
}

/** What kind of answer a question takes, and so what the browser draws. */
export type AnswerKind = "single" | "multi" | "text" | "number";

/** One option on a `single` or `multi` question. */
export interface AskedChoice {
  /** Stable within the question — this is the form field's value, not its text. */
  value: string;
  label: string;
  hint: string | null;
}

/**
 * One question.
 *
 * There is deliberately no `required`. A question the athlete cannot get past
 * is a conversation the coach has taken hostage, and this one stands where
 * their text box usually does — so every question is skippable, and every
 * choice question carries a free-text box for an answer the model didn't
 * think of (see `coach-questionnaire.tsx`). Those two together are the way out.
 */
export interface AskedQuestion {
  /** `q1`…`q5`. Assigned here, so a model can't collide two form fields. */
  id: string;
  question: string;
  hint: string | null;
  kind: AnswerKind;
  /** Empty for `text` and `number`. */
  choices: AskedChoice[];
  unit: string | null;
  placeholder: string | null;
}

export interface QuestionnaireCard {
  card: "questionnaire";
  intro: string | null;
  questions: AskedQuestion[];
  /**
   * What was trimmed to fit, addressed to the model and never drawn.
   *
   * The browser renders `questions` and ignores everything else, so this says
   * to the coach what a validation error would have said — except the turn is
   * still alive to hear it.
   */
  note?: string;
}

/** What the model passes in, before any of it is trusted. */
interface ProposedQuestion {
  question: string;
  hint?: string | null;
  kind: AnswerKind;
  choices?: { label: string; hint?: string | null }[] | null;
  unit?: string | null;
  placeholder?: string | null;
}

/**
 * The questionnaire as the browser can actually render it, or the reason it
 * can't.
 *
 * Ids and choice values are assigned here rather than asked for: they are form
 * field names, and two questions the model happened to call the same thing
 * would silently merge into one answer. Everything the model wrote — the words
 * — is kept verbatim.
 *
 * The two counts are enforced *here* and only described in the input schema,
 * for the reason spelled out in `mondayFirst`: a `.max()` on the schema is
 * checked before `execute` runs, so an eighth choice doesn't cost the athlete
 * a question — it fails the tool call, and `streamText` with it, mid-answer.
 * Trimming the tail keeps the turn, and the model is told what it asked for
 * was cut so it can ask the rest next time.
 *
 * Pure, and exported for the tests: the shape it produces is the contract with
 * `coach-questionnaire.tsx`, and it is the one part of the tool that can be
 * checked without a model or a Strava token.
 */
export function buildQuestionnaire(
  intro: string | null | undefined,
  proposed: ProposedQuestion[],
): QuestionnaireCard | { error: string } {
  const questions: AskedQuestion[] = [];
  const dropped: string[] = [];

  if (proposed.length > MAX_QUESTIONS) {
    dropped.push(
      `Only the first ${MAX_QUESTIONS} of your ${proposed.length} questions ` +
        "were asked; a longer form is one nobody finishes.",
    );
  }

  for (const [index, item] of proposed.slice(0, MAX_QUESTIONS).entries()) {
    const picks = item.kind === "single" || item.kind === "multi";
    // A label repeated inside one question is two options the athlete cannot
    // tell apart; dropped rather than rejected, because the rest of the
    // question is usually fine and a re-ask costs the athlete a round trip.
    // Deduplicated *after* clamping, because two labels that differ only past
    // the limit are one option by the time the athlete reads them.
    const seen = new Map<string, string | null>();
    if (picks) {
      for (const choice of item.choices ?? []) {
        const label = clamp(choice.label, MAX_LENGTH.label);
        if (label && !seen.has(label)) {
          seen.set(label, clamp(choice.hint, MAX_LENGTH.choiceHint));
        }
      }
    }
    const choices = [...seen].slice(0, MAX_CHOICES);

    if (picks && choices.length < 2) {
      return {
        error:
          `Question ${index + 1} is a "${item.kind}" question with fewer than ` +
          `two distinct choices. Give it two to ${MAX_CHOICES}, or ask it as ` +
          "text.",
      };
    }

    if (seen.size > choices.length) {
      dropped.push(
        `Question ${index + 1} was cut to its first ${MAX_CHOICES} choices.`,
      );
    }

    questions.push({
      id: `q${index + 1}`,
      question: clamp(item.question, MAX_LENGTH.question) ?? "",
      hint: clamp(item.hint, MAX_LENGTH.hint),
      kind: item.kind,
      choices: choices.map(([label, hint], position) => ({
        value: `c${position + 1}`,
        label,
        hint,
      })),
      unit: item.kind === "number" ? clamp(item.unit, MAX_LENGTH.unit) : null,
      // A choice question's free-text box is labelled "Other" by the browser,
      // in the athlete's language — the model's example answer would be an
      // English word sitting in a French form.
      placeholder: picks
        ? null
        : clamp(item.placeholder, MAX_LENGTH.placeholder),
    });
  }

  return {
    card: "questionnaire",
    intro: clamp(intro, MAX_LENGTH.intro),
    questions,
    ...(dropped.length > 0 ? { note: dropped.join(" ") } : {}),
  };
}

/**
 * A proposed week's sessions as 0 = Monday … 6 = Sunday, sorted, whichever way
 * the model numbered them.
 *
 * Every other place a planned day appears — `PlannedSessionSchema`, the accept
 * route, the weekday stamps the card indexes by — counts from 0, and a model
 * asked for "seven days, Monday first" writes 1…7 often enough that rejecting
 * it costs the athlete the whole turn: the input never validates, so the tool
 * never runs and `streamText` fails mid-answer.
 *
 * A week that reaches 7 without a 0 is that week, off by one, and shifting the
 * whole of it is unambiguous. A week holding both a 0 and a 7 is a model that
 * lost count, and shifting there would move six right days to fix one wrong
 * one — so only the 7 moves, to the Sunday it means under either numbering.
 * Either way nothing leaves 0…6, which is what the accept route validates
 * against and what the card's weekday stamps are indexed by.
 */
export function mondayFirst<T extends { day: number }>(sessions: T[]): T[] {
  const days = sessions.map((session) => session.day);
  const shift = days.includes(7) && !days.includes(0);

  return sessions
    .map((session) => ({
      ...session,
      day: shift ? session.day - 1 : Math.min(session.day, 6),
    }))
    .sort((a, b) => a.day - b.day);
}

/** The context to bind a set of tools to one athlete and one turn. */
export interface CoachToolContext {
  accessToken: string;
  userId: string;
  /** `YYYY-MM-DD` in the athlete's own terms. */
  today: string;
  /** The window selected in the thread header. */
  rangeWeeks: number;
}

/**
 * The coach's tools, bound to one athlete and one turn. Built per request — the
 * Strava token is short-lived and belongs to the session, not the process.
 */
export function createCoachTools(ctx: CoachToolContext): ToolSet {
  const { accessToken, userId, today, rangeWeeks } = ctx;

  return {
    getAthleteProfile: tool({
      description:
        "The athlete's Strava profile: name, location, and weight when they " +
        "have set one. Use it to personalise, not to open every answer with.",
      inputSchema: z.object({}),
      execute: async () => {
        try {
          const athlete = await fetchAthlete(accessToken);
          return {
            name: [athlete.firstname, athlete.lastname]
              .filter(Boolean)
              .join(" "),
            city: athlete.city,
            country: athlete.country,
            sex: athlete.sex,
            weight_kg: athlete.weight,
          };
        } catch (err) {
          return stravaFailure(err);
        }
      },
    }),

    getAthleteContext: tool({
      description:
        "What the athlete is training for: goal race, date, target time, the " +
        "day their long run lives on, and anything they asked you to remember. " +
        "Read this before planning anything.",
      inputSchema: z.object({}),
      execute: async () => {
        const context = await getContext(userId);
        return {
          ...context,
          weeks_to_race: weeksToRace(context, today),
          target: context.target_seconds ? clock(context.target_seconds) : null,
          summary: describeGoal(context, today),
        };
      },
    }),

    setAthleteContext: tool({
      description:
        "Remember something about the athlete's goals across every thread. " +
        "Call this as soon as they mention a race, a date, a target time, the " +
        "days they can run, or an injury. Only pass the fields that changed; " +
        "pass null to clear one.",
      inputSchema: z.object({
        race_name: z
          .string()
          .max(120)
          .nullish()
          .describe("e.g. Casablanca Half"),
        race_date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .nullish()
          .describe("Race day, YYYY-MM-DD."),
        race_distance_m: z
          .number()
          .nullish()
          .describe("Metres. A half is 21097.5, a marathon 42195."),
        target_seconds: z
          .number()
          .int()
          .nullish()
          .describe("Goal finish time in seconds. 1:38:00 is 5880."),
        long_run_day: z
          .number()
          .int()
          .min(0)
          .max(6)
          .nullish()
          .describe("0 = Monday … 6 = Sunday."),
        notes: z
          .string()
          .max(600)
          .nullish()
          .describe("Injuries, life constraints, anything to carry forward."),
      }),
      execute: async (patch) => {
        const context = await saveContext(userId, patch);
        return { saved: true, context, summary: describeGoal(context, today) };
      },
    }),

    askAthlete: tool({
      description:
        "Ask the athlete something the tools cannot tell you — which race, " +
        "what hurts, which days they can run, how a session felt. Draws the " +
        "questions as a form they tap through one at a time instead of typing " +
        "prose, and their answers come back as their next message. Use it " +
        "rather than writing the questions into your reply. One form per turn, " +
        "up to five questions, and never for anything a tool can look up.",
      // Deliberately without a `.max()` on either count. The AI SDK validates
      // tool input before `execute`, and a rejection there is not a retry —
      // it throws out of `streamText` and the athlete's turn dies mid-answer,
      // which is what a seventh weekday used to do. The limits are described
      // to the model and enforced by `buildQuestionnaire`, which trims.
      inputSchema: z.object({
        intro: z
          .string()
          .optional()
          .describe(
            "One line saying why you are asking, at most 160 characters. " +
              "Omit it when the questions speak for themselves.",
          ),
        questions: z
          .array(
            z.object({
              question: z
                .string()
                .describe("The question itself, one sentence."),
              hint: z
                .string()
                .optional()
                .describe("A clarifying line under the question."),
              kind: z
                .enum(["single", "multi", "text", "number"])
                .describe(
                  "single = pick one choice, multi = pick any number of " +
                    "them, text = type a short answer, number = type a " +
                    "number. Prefer choices: a tap beats a sentence.",
                ),
              choices: z
                .array(
                  z.object({
                    label: z.string(),
                    hint: z.string().optional(),
                  }),
                )
                .optional()
                .describe(
                  `Two to ${MAX_CHOICES} options, for single and multi only — ` +
                    "seven so a whole week fits. Every choice question is " +
                    "also drawn with a free-text box for an answer you did " +
                    "not list, so never add 'Other', 'Something else' or " +
                    "'None of these' yourself — list only the answers you " +
                    "actually expect.",
                ),
              unit: z
                .string()
                .optional()
                .describe("What a number is in: 'km', 'days a week', 'kg'."),
              placeholder: z
                .string()
                .optional()
                .describe("An example answer, for text and number."),
            }),
          )
          .min(1)
          .describe(
            `The questions, in the order they should be asked. At most ` +
              `${MAX_QUESTIONS} — a longer form is one nobody finishes.`,
          ),
      }),
      execute: async ({ intro, questions }) =>
        buildQuestionnaire(intro, questions),
    }),

    listRuns: tool({
      description:
        "The athlete's most recent runs, newest first — date, distance, " +
        "duration, average pace, average heart rate, elevation and how the run " +
        "was tagged in Strava. Start here for anything about recent training, " +
        "and to find the id of a run to look at in detail.",
      inputSchema: z.object({
        limit: z
          .number()
          .int()
          .min(1)
          .max(50)
          .default(15)
          .describe("How many runs to return, newest first."),
        since: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional()
          .describe("Only runs on or after this date (YYYY-MM-DD)."),
      }),
      execute: async ({ limit, since }) => {
        try {
          const runs = await fetchRuns(accessToken);
          const filtered = since
            ? runs.filter((run) => localDate(run) >= since)
            : runs;
          return {
            total_runs_available: runs.length,
            runs: filtered.slice(0, limit).map(summariseRun),
          };
        } catch (err) {
          return stravaFailure(err);
        }
      },
    }),

    getRunDebrief: tool({
      description:
        "One run as a card the athlete can see: its numbers, its route, and " +
        "how it compares to the four weeks behind it. Use it when they ask " +
        "about a specific session, or to open a debrief of the latest run. " +
        "Draws the run — don't repeat its numbers underneath.",
      inputSchema: z.object({
        id: z
          .number()
          .int()
          .optional()
          .describe("The Strava activity id. Omit for the most recent run."),
      }),
      execute: async ({ id }) => {
        try {
          const runs = await fetchRuns(accessToken);
          const card = await buildRunDebriefCard(accessToken, runs, today, id);
          return card ?? { error: "This athlete has no runs yet." };
        } catch (err) {
          return stravaFailure(err);
        }
      },
    }),

    getRunSplits: tool({
      description:
        "One run kilometre by kilometre, with heart rate and the aerobic " +
        "decoupling between its halves. Use it when the athlete asks why a run " +
        "went the way it did. Draws the splits chart — write the read, not the " +
        "numbers. Treadmill and manually entered runs have no splits.",
      inputSchema: z.object({
        id: z.number().int().describe("The Strava activity id, from listRuns."),
      }),
      execute: async ({ id }) => {
        try {
          const [run, streams] = await Promise.all([
            fetchRun(accessToken, id),
            fetchRunStreams(accessToken, id),
          ]);
          const splits = toSplits(streams);
          if (splits.length === 0) {
            return {
              error:
                "That run has no distance stream — a treadmill or manual entry. " +
                "Its totals are still readable with getRunDebrief.",
            };
          }

          const half = Math.floor(splits.length / 2);
          const mean = (from: number, to: number) =>
            splits
              .slice(from, to)
              .reduce((sum, split) => sum + split.seconds_per_km, 0) /
            Math.max(1, to - from);

          return {
            card: "run-splits" as const,
            run_id: run.id,
            title: `${run.name} · ${shortDate(localDate(run))} · ${(run.distance / 1000).toFixed(2)} km`,
            splits,
            first_half_pace: pace(mean(0, half)),
            second_half_pace: pace(mean(half, splits.length)),
            /** Positive means the back half was slower. */
            fade_seconds_per_km: Math.round(
              mean(half, splits.length) - mean(0, half),
            ),
            decoupling_pct: decoupling(streams),
            avg_heartrate: run.average_heartrate,
            max_heartrate: run.max_heartrate,
          };
        } catch (err) {
          return stravaFailure(err);
        }
      },
    }),

    summariseTraining: tool({
      description:
        "Weekly volume for the last N weeks (Monday-start) with the ramp " +
        "against each previous week, plus the 7:28 day acute:chronic load " +
        "ratio. Use it for load, consistency, ramp rate or race readiness. " +
        "Draws the volume chart — write the read, not the table.",
      inputSchema: z.object({
        weeks: z
          .number()
          .int()
          .min(1)
          .max(26)
          .default(rangeWeeks)
          .describe("How many recent weeks to summarise."),
      }),
      execute: async ({ weeks }) => {
        try {
          const runs = await fetchRuns(accessToken);
          const readout = await readTraining(accessToken, runs, today);
          return {
            card: "training-volume" as const,
            weeks: weeklyVolume(runs, weeks, today),
            load: readout.load,
            easy_intensity: readout.easy,
          };
        } catch (err) {
          return stravaFailure(err);
        }
      },
    }),

    getTrainingSignals: tool({
      description:
        "The measured state of the athlete's training right now: load ratio, " +
        "how much of their easy running sits in zone 3, aerobic decoupling on " +
        "the last long run, and shoe mileage when Strava shares it. Use it to " +
        "answer 'how am I doing' and to explain any signal they tapped.",
      inputSchema: z.object({}),
      execute: async () => {
        try {
          const runs = await fetchRuns(accessToken);
          const [readout, context] = await Promise.all([
            readTraining(accessToken, runs, today),
            getContext(userId),
          ]);
          return {
            signals: toSignals(readout),
            queue: toQueue(readout, runs, context, today),
            goal: describeGoal(context, today),
          };
        } catch (err) {
          return stravaFailure(err);
        }
      },
    }),

    predictRaces: tool({
      description:
        "What the athlete could run today at 5K, 10K, half and marathon, from " +
        "Strava's own best efforts inside their fastest recent runs. Use it for " +
        "race shape, goal times and whether a target is realistic. Draws the " +
        "prediction table.",
      inputSchema: z.object({}),
      execute: async () => {
        try {
          const runs = await fetchRuns(accessToken);
          const candidates = prCandidates(runs, today);
          if (candidates.length === 0) {
            return { error: "No runs long enough to predict a race from yet." };
          }

          const details = await Promise.all(
            candidates.map((run) => fetchRunDetail(accessToken, run.id)),
          );
          const efforts: BestEffort[] = details.flatMap((d) => d.best_efforts);
          const predictions = predictRaces(efforts);
          if (predictions.length === 0) {
            return {
              error:
                "Strava recorded no best efforts on these runs — it only " +
                "computes them for runs with a distance stream.",
            };
          }

          const context = await getContext(userId);
          const goalPrediction = context.race_distance_m
            ? predictions.reduce((closest, p) =>
                Math.abs(p.metres - context.race_distance_m!) <
                Math.abs(closest.metres - context.race_distance_m!)
                  ? p
                  : closest,
              )
            : null;

          return {
            card: "race-prediction" as const,
            efforts: bestPerDistance(efforts).map((effort) => ({
              name: effort.name,
              time: clock(effort.elapsed_time),
              date: shortDate(effort.date),
              pr: effort.pr_rank === 1,
              activity_id: effort.activity_id,
            })),
            predictions,
            goal: goalPrediction
              ? {
                  race: context.race_name,
                  distance: goalPrediction.name,
                  today: goalPrediction.time,
                  target: context.target_seconds
                    ? clock(context.target_seconds)
                    : null,
                  /** Seconds the athlete still has to find. Negative = ahead of target. */
                  gap_seconds: context.target_seconds
                    ? goalPrediction.seconds - context.target_seconds
                    : null,
                  weeks_to_race: weeksToRace(context, today),
                }
              : null,
          };
        } catch (err) {
          return stravaFailure(err);
        }
      },
    }),

    proposeWeek: tool({
      description:
        "Write the athlete's next seven days as sessions they can accept. " +
        "Always seven entries, day 0 = Monday through day 6 = Sunday, rest days " +
        "included with km 0. Draws the week as cards with an Accept button — " +
        "underneath it, say why the week is shaped that way, not what is in it.",
      inputSchema: z.object({
        week_starting: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional()
          .describe(
            "A date in the week being written. Defaults to this week; it is " +
              "snapped to that week's Monday.",
          ),
        label: z
          .string()
          .max(60)
          .optional()
          .describe("Where the week sits in the block, e.g. 'Build 4 of 9'."),
        sessions: z
          .array(
            z.object({
              // 7 is accepted, not asked for: a model that numbers the week
              // 1…7 is normalised by `mondayFirst` rather than rejected.
              day: z
                .number()
                .int()
                .min(0)
                .max(7)
                .describe("0 = Monday … 6 = Sunday."),
              type: z
                .string()
                .max(40)
                .describe("Recovery, Easy, 8 × 400, Tempo, Long, Rest."),
              km: z
                .number()
                .min(0)
                .max(200)
                .describe("Kilometres; 0 for rest."),
              pace: z
                .string()
                .max(40)
                .describe(
                  "Target pace like '6:05 /km', or a note like 'legs up'.",
                ),
              key: z
                .boolean()
                .describe("True for the sessions the week is built around."),
            }),
          )
          .length(7)
          .describe("Seven days, Monday first."),
      }),
      execute: async ({ week_starting, label, sessions }) => {
        // Snapped, not trusted: a week is keyed on its Monday everywhere it is
        // read back — `getPlan` here, the accept route, the briefing's
        // `weekStart(today)` — so a mid-week date the model wrote would store a
        // plan nothing ever looks for again.
        const week = weekStart(week_starting ?? today);
        const accepted = await getPlan(userId, week);
        const planned = mondayFirst(sessions);
        const total = planned.reduce((sum, session) => sum + session.km, 0);
        return {
          card: "week-plan" as const,
          week_starting: week,
          label: label ?? null,
          sessions: planned,
          total_km: Number(total.toFixed(1)),
          quality: planned.filter((session) => session.key).length,
          /** True when this exact week has already been accepted. */
          accepted: accepted !== null,
        };
      },
    }),
  };
}
