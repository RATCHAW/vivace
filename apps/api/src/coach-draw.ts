// The coach drawing a card of its own, when none of the prebuilt ones fit.
//
// `drawCard`'s input is a json-render spec: a flat tree of whitelisted
// components the browser renders with the same furniture as the five prebuilt
// cards (apps/web/src/components/coach/coach-drawn-card.tsx). The whitelist is
// the design system made enforceable — the model chooses layout and words,
// never a className — and this file is the server half of that contract: the
// component names and props here must match the web catalogue exactly, the way
// every other card shape in coach.ts matches coach-cards.tsx.
//
// What this card gives up is the one guarantee the prebuilt cards keep: their
// numbers are computed from Strava data and cannot be wrong about a run. Here
// the model authors the values, so the tool's description orders it to draw
// only figures other tools returned this turn. The validation below can hold
// the design system; honesty stays a property of the prompt.
//
// Validated in `execute`, not in the input schema, for the reason spelled out
// on `askAthlete`: a schema rejection throws out of `streamText` and costs the
// athlete the whole turn, while an `{ error }` result keeps the turn alive and
// tells the model what to fix. Where trimming is enough, it trims.
import { z } from "zod";

/** How many elements one card may hold — a card, not a page. */
const MAX_ELEMENTS = 40;

/** One trimmed string, cut to length rather than rejected. */
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
 * The vocabulary, one zod schema per component.
 *
 * Mirrored by the catalogue in coach-drawn-card.tsx — the props parsed here are
 * the props the browser's registry receives, so the two lists move together.
 */
const COMPONENT_PROPS = {
  /** The frame — always the root. */
  Card: z.object({
    title: short(80).nullish(),
    /** A mono eyebrow on the heading's right, e.g. "LAST 3 SUNDAYS". */
    aside: short(40).nullish(),
  }),
  /** Layout. */
  Stack: z.object({
    direction: z.enum(["row", "column"]).nullish(),
    gap: z.enum(["tight", "cozy", "loose"]).nullish(),
  }),
  Text: z.object({
    text: short(300),
    look: z.enum(["body", "strong", "caption", "muted", "mono"]).nullish(),
  }),
  /** The labelled-figure grid every prebuilt card uses. */
  Stats: z.object({
    items: atMost(z.object({ label: short(24), value: short(24) }), 8),
  }),
  /** A bar chart; heights are normalised client-side like the splits chart. */
  Bars: z.object({
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
  Callout: z.object({
    tone: z.enum(["brand", "warn", "alert"]).nullish(),
    text: short(300),
  }),
  /** A tap that asks the coach the question it carries. */
  AskButton: z.object({
    label: short(60),
    question: short(200),
  }),
};

type ComponentType = keyof typeof COMPONENT_PROPS;

/** The components allowed to hold children; everything else is a leaf. */
const CONTAINERS = new Set<ComponentType>(["Card", "Stack"]);

function isComponentType(value: string): value is ComponentType {
  return value in COMPONENT_PROPS;
}

/** One element as the model proposes it, before any of it is trusted. */
export interface ProposedElement {
  type: string;
  props?: Record<string, unknown>;
  children?: string[];
}

export interface ProposedSpec {
  root: string;
  elements: Record<string, ProposedElement>;
}

/** One element as the browser renders it. */
interface DrawnElement {
  type: ComponentType;
  props: Record<string, unknown>;
  children: string[];
}

export interface DrawnCard {
  card: "drawn";
  spec: {
    root: string;
    elements: Record<string, DrawnElement>;
  };
  /** What was trimmed to fit — addressed to the model, never drawn. */
  note?: string;
}

/**
 * The spec as the browser can actually render it, or the reason it can't.
 *
 * Walked from the root rather than validated wholesale: an element nothing
 * references is dropped instead of failing the card, and the walk is also what
 * catches a cycle or a shared element — the spec is a tree, and an id drawn in
 * two places would render the same React key twice.
 *
 * Pure, and exported for the tests: this shape is the contract with
 * coach-drawn-card.tsx, and it is the one part of the tool that can be checked
 * without a model.
 */
export function buildDrawnCard(
  spec: ProposedSpec,
): DrawnCard | { error: string } {
  const notes: string[] = [];
  const elements: Record<string, DrawnElement> = {};

  const root = spec.elements[spec.root];
  if (!root) {
    return {
      error: `The root id "${spec.root}" names no element in \`elements\`.`,
    };
  }
  if (root.type !== "Card") {
    return {
      error:
        `The root element must be a Card — it is the frame every drawn card ` +
        `shares. Got "${root.type}".`,
    };
  }

  const seen = new Set<string>();
  const walk = (id: string): { error: string } | null => {
    if (seen.has(id)) {
      return {
        error:
          `Element "${id}" is referenced more than once. The spec is a tree: ` +
          "give each place its own element.",
      };
    }
    seen.add(id);
    if (seen.size > MAX_ELEMENTS) {
      return {
        error: `More than ${MAX_ELEMENTS} elements — simplify the card.`,
      };
    }

    const element = spec.elements[id];
    if (!element) {
      return { error: `Child id "${id}" names no element in \`elements\`.` };
    }
    if (!isComponentType(element.type)) {
      return {
        error:
          `Unknown component "${element.type}". Use only: ` +
          `${Object.keys(COMPONENT_PROPS).join(", ")}.`,
      };
    }

    const props = COMPONENT_PROPS[element.type].safeParse(element.props ?? {});
    if (!props.success) {
      const issue = props.error.issues[0];
      return {
        error:
          `Element "${id}" (${element.type}): invalid props at ` +
          `${issue.path.join(".") || "root"} — ${issue.message}`,
      };
    }

    let children = element.children ?? [];
    if (children.length > 0 && !CONTAINERS.has(element.type)) {
      notes.push(
        `${element.type} "${id}" takes no children; they were dropped.`,
      );
      children = [];
    }

    elements[id] = { type: element.type, props: props.data, children };
    for (const child of children) {
      const failed = walk(child);
      if (failed) return failed;
    }
    return null;
  };

  const failed = walk(spec.root);
  if (failed) return failed;

  const unreachable = Object.keys(spec.elements).length - seen.size;
  if (unreachable > 0) {
    notes.push(
      `${unreachable} element(s) nothing references were dropped — every ` +
        "element must be reachable from the root through `children`.",
    );
  }

  return {
    card: "drawn",
    spec: { root: spec.root, elements },
    ...(notes.length > 0 ? { note: notes.join(" ") } : {}),
  };
}
