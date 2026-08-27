// The coach drawing a card of its own, when none of the prebuilt ones fit.
//
// `drawCard`'s input is deliberately *not* the json-render spec the browser
// renders. It was, briefly: a flat tree of elements with ids, `children`
// references and nested `props`. The default model could not reliably author
// that inside a tool call — it stringified the object, flattened the props,
// and finally melted down retrying — while the same model fills `askAthlete`'s
// flat array of questions without a wobble. So the model writes what it is
// good at: a title and a flat list of blocks, top to bottom. This file
// composes those blocks into the json-render spec, and the browser
// (apps/web/src/components/coach/coach-drawn-card.tsx) renders that spec with
// the same furniture and tokens as the five prebuilt cards. The component
// names and props in the composed spec are the contract with the web
// catalogue, the way every other card shape in coach.ts matches
// coach-cards.tsx.
//
// What this card gives up is the one guarantee the prebuilt cards keep: their
// numbers are computed from Strava data and cannot be wrong about a run. Here
// the model authors the values, so the tool's description orders it to draw
// only figures other tools returned this turn. The validation below can hold
// the design system; honesty stays a property of the prompt.
//
// Everything is validated here in `execute`, never by the tool's input
// schema. The SDK validates input *before* `execute`, and a rejection there
// throws out of `streamText` and takes the athlete's whole turn — a live call
// died exactly that way. Here a broken block is dropped with a note the model
// reads, and only a card with nothing left in it is an error.
import { z } from "zod";

/** How many blocks one card may hold — a card, not a page. */
const MAX_BLOCKS = 12;

/** One trimmed string, cut to length rather than rejected, like the
 *  questionnaire's `clamp`. */
const short = (limit: number) =>
  z
    .string()
    .transform((value) => value.trim())
    .transform((value) =>
      value.length > limit ? `${value.slice(0, limit - 1)}…` : value,
    );

/** Arrays are cut to size rather than rejected, like questionnaire choices. */
const atMost = <T extends z.ZodTypeAny>(item: T, limit: number) =>
  z
    .array(item)
    .min(1)
    .transform((items) => items.slice(0, limit));

/**
 * The blocks, one schema per kind.
 *
 * Each block becomes one json-render element; `BLOCK_COMPONENTS` below names
 * which. The props that come out of these schemas are the props the browser's
 * registry receives, so this list and the catalogue in coach-drawn-card.tsx
 * move together.
 */
const BLOCK_PROPS = {
  text: z.object({
    text: short(300),
    look: z.enum(["body", "strong", "caption", "muted", "mono"]).nullish(),
  }),
  /** The labelled-figure grid every prebuilt card uses. */
  stats: z.object({
    items: atMost(z.object({ label: short(24), value: short(24) }), 8),
  }),
  /** A bar chart; heights are normalised client-side like the splits chart. */
  bars: z.object({
    bars: atMost(
      z.object({
        label: short(12).nullish(),
        value: z.number().finite().min(0),
        tone: z.enum(["brand", "alert"]).nullish(),
      }),
      30,
    ),
    /** What the values are in, e.g. "km" — drawn once, not per bar. */
    unit: short(20).nullish(),
  }),
  /** The one-line read under a chart, with its coloured rule. */
  callout: z.object({
    tone: z.enum(["brand", "warn", "alert"]).nullish(),
    text: short(300),
  }),
  /** A tap that asks the coach the question it carries. */
  ask: z.object({
    label: short(60),
    question: short(200),
  }),
};

type BlockKind = keyof typeof BLOCK_PROPS;

/** Which json-render component draws each kind of block. */
const BLOCK_COMPONENTS: Record<BlockKind, string> = {
  text: "Text",
  stats: "Stats",
  bars: "Bars",
  callout: "Callout",
  ask: "AskButton",
};

function isBlockKind(value: unknown): value is BlockKind {
  return typeof value === "string" && value in BLOCK_PROPS;
}

/** What the model passes in, before any of it is trusted. */
export interface ProposedCard {
  title?: unknown;
  aside?: unknown;
  blocks?: unknown;
}

/** A heading if the model wrote one, null for anything else — a wrong-typed
 *  title costs the title, never the card. */
function heading(value: unknown, limit: number): string | null {
  const parsed = short(limit).safeParse(value);
  return parsed.success && parsed.data ? parsed.data : null;
}

/** One element of the spec the browser renders. */
interface DrawnElement {
  type: string;
  props: Record<string, unknown>;
  children: string[];
}

export interface DrawnCard {
  card: "drawn";
  spec: {
    root: string;
    elements: Record<string, DrawnElement>;
  };
  /** What was dropped or trimmed to fit — addressed to the model, never drawn. */
  note?: string;
}

/**
 * The blocks as a json-render spec the browser can render, or the reason
 * there is no card.
 *
 * Forgiving on purpose, in the `mondayFirst` way: a stringified `blocks` is
 * parsed, a block naming its kind `type` is read anyway, a broken block is
 * dropped with a note that tells the model what was wrong with it. The only
 * errors left are the ones with nothing to salvage — no blocks at all, or
 * none that survived.
 *
 * Pure, and exported for the tests: the spec it composes is the contract with
 * coach-drawn-card.tsx, and it is the one part of the tool that can be
 * checked without a model.
 */
export function buildDrawnCard(
  proposed: ProposedCard,
): DrawnCard | { error: string } {
  const kinds = Object.keys(BLOCK_PROPS).join(", ");

  // A blocks array that arrives as a string is a model that serialised twice;
  // parsed rather than rejected, because the JSON inside is usually right.
  let raw = proposed.blocks;
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      return {
        error:
          "`blocks` arrived as a string that isn't valid JSON. Pass it as " +
          "a JSON array of blocks.",
      };
    }
  }
  if (!Array.isArray(raw) || raw.length === 0) {
    return {
      error: `\`blocks\` must be a non-empty array of blocks. Kinds: ${kinds}.`,
    };
  }

  const notes: string[] = [];
  if (raw.length > MAX_BLOCKS) {
    notes.push(
      `Only the first ${MAX_BLOCKS} of your ${raw.length} blocks were drawn.`,
    );
  }

  const elements: Record<string, DrawnElement> = {};
  const children: string[] = [];

  for (const [index, block] of raw.slice(0, MAX_BLOCKS).entries()) {
    if (typeof block !== "object" || block === null) {
      notes.push(`Block ${index + 1} is not an object; it was dropped.`);
      continue;
    }
    // `kind` is the field's name; `type` is what a model that has just read a
    // json-render spec calls it. Both are read.
    const { kind, type, ...props } = block as Record<string, unknown>;
    const named = kind ?? type;
    if (!isBlockKind(named)) {
      notes.push(
        `Block ${index + 1} has kind "${String(named)}", which is not one ` +
          `of: ${kinds}. It was dropped.`,
      );
      continue;
    }

    const parsed = BLOCK_PROPS[named].safeParse(props);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      notes.push(
        `Block ${index + 1} (${named}) was dropped: invalid at ` +
          `${issue.path.join(".") || "root"} — ${issue.message}.`,
      );
      continue;
    }

    const id = `b${index}`;
    elements[id] = {
      type: BLOCK_COMPONENTS[named],
      props: parsed.data,
      children: [],
    };
    children.push(id);
  }

  if (children.length === 0) {
    return {
      error: `No block could be drawn. ${notes.join(" ")}`.trim(),
    };
  }

  elements.card = {
    type: "Card",
    props: {
      title: heading(proposed.title, 80),
      aside: heading(proposed.aside, 40),
    },
    children,
  };

  return {
    card: "drawn",
    spec: { root: "card", elements },
    ...(notes.length > 0 ? { note: notes.join(" ") } : {}),
  };
}
