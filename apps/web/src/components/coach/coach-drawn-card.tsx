// The card the coach drew itself.
//
// Renders the `drawCard` tool result (`buildDrawnCard` in
// apps/api/src/coach-draw.ts): a json-render spec over a whitelist of
// components, each of which is implemented here with the same furniture as the
// five prebuilt cards. The whitelist is what keeps a model-drawn card inside
// DESIGN.md — the model chooses layout and words, and every colour, radius and
// type style it can reach is a token this file chose.
//
// The catalogue below is the browser half of a contract with coach-draw.ts:
// same component names, same props. Change one side and change the other with
// it, the way every other card shape in coach-cards.tsx mirrors coach.ts.
import { createContext, useContext } from "react";
import { defineCatalog } from "@json-render/core";
import {
  defineRegistry,
  JSONUIProvider,
  Renderer,
  schema,
  type Spec,
} from "@json-render/react";
import { z } from "zod";
import { MonoLabel } from "@/components/mono";
import { Button } from "@/components/ui/button";
import {
  Callout,
  CardHeading,
  CardShell,
} from "@/components/coach/coach-card-shell";
import type { CardActions } from "@/components/coach/coach-cards";
import { cn } from "@/lib/utils";

// --- the vocabulary -----------------------------------------------------------

/** Mirrors `COMPONENT_PROPS` in apps/api/src/coach-draw.ts. */
const COMPONENT_PROPS = {
  Card: z.object({
    title: z.string().nullish(),
    aside: z.string().nullish(),
  }),
  Stack: z.object({
    direction: z.enum(["row", "column"]).nullish(),
    gap: z.enum(["tight", "cozy", "loose"]).nullish(),
  }),
  Text: z.object({
    text: z.string(),
    look: z.enum(["body", "strong", "caption", "muted", "mono"]).nullish(),
  }),
  Stats: z.object({
    items: z.array(z.object({ label: z.string(), value: z.string() })).min(1),
  }),
  Bars: z.object({
    bars: z
      .array(
        z.object({
          label: z.string().nullish(),
          value: z.number().finite().min(0),
          tone: z.enum(["brand", "alert"]).nullish(),
        }),
      )
      .min(1),
    unit: z.string().nullish(),
  }),
  Callout: z.object({
    tone: z.enum(["brand", "warn", "alert"]).nullish(),
    text: z.string(),
  }),
  AskButton: z.object({
    label: z.string(),
    question: z.string(),
  }),
};

const catalog = defineCatalog(schema, {
  components: {
    Card: {
      props: COMPONENT_PROPS.Card,
      slots: ["default"],
      description: "The frame every drawn card shares — always the root.",
    },
    Stack: {
      props: COMPONENT_PROPS.Stack,
      slots: ["default"],
      description: "Layout: a row or a column of children.",
    },
    Text: {
      props: COMPONENT_PROPS.Text,
      description: "One run of text in one of the card's type styles.",
    },
    Stats: {
      props: COMPONENT_PROPS.Stats,
      description: "The labelled-figure grid every prebuilt card uses.",
    },
    Bars: {
      props: COMPONENT_PROPS.Bars,
      description: "A bar chart; heights are normalised to the largest value.",
    },
    Callout: {
      props: COMPONENT_PROPS.Callout,
      description: "The one-line read under a chart, with its coloured rule.",
    },
    AskButton: {
      props: COMPONENT_PROPS.AskButton,
      description: "A tap that sends the coach the question it carries.",
    },
  },
  // No actions on purpose: AskButton reaches `actions.onAsk` through React
  // context instead, so the spec carries a question and never an event wiring.
  actions: {},
});

// --- what arrives -------------------------------------------------------------

export interface DrawnElement {
  type: string;
  props?: Record<string, unknown>;
  children?: string[];
}

export interface DrawnSpec {
  root: string;
  elements: Record<string, DrawnElement>;
}

export interface DrawnCard {
  card: "drawn";
  spec: DrawnSpec;
  note?: string;
}

/**
 * The tool's output, if it is a card this version can draw safely.
 *
 * The API validated the spec before storing it, but a card outlives the schema
 * that made it — it round-trips through the database, and a spec written by
 * another version of the API can be sitting in a transcript. So the walk is
 * repeated here, cheaply: every element rendered must be a known component
 * whose props parse, the tree must actually be a tree (a cycle would recurse
 * the renderer to death), and anything else degrades to the plain tool chip
 * rather than crashing the thread.
 */
export function asDrawnCard(output: unknown): DrawnCard | null {
  if (typeof output !== "object" || output === null) return null;
  const card = output as Partial<DrawnCard>;
  const spec = card.spec;
  if (
    card.card !== "drawn" ||
    typeof spec !== "object" ||
    spec === null ||
    typeof spec.root !== "string" ||
    typeof spec.elements !== "object" ||
    spec.elements === null
  ) {
    return null;
  }

  const seen = new Set<string>();
  const walk = (id: string): boolean => {
    if (seen.has(id)) return false;
    seen.add(id);
    const element = spec.elements[id];
    if (!element || !(element.type in COMPONENT_PROPS)) return false;
    const props = COMPONENT_PROPS[element.type as keyof typeof COMPONENT_PROPS];
    if (!props.safeParse(element.props ?? {}).success) return false;
    return (element.children ?? []).every(walk);
  };

  return walk(spec.root) ? (output as DrawnCard) : null;
}

// --- the implementations ------------------------------------------------------

/** How AskButton reaches `actions.onAsk` from inside the renderer. */
const AskContext = createContext<(text: string) => void>(() => {});

const TEXT_LOOKS = {
  body: "text-body-md",
  strong: "text-body-md font-semibold",
  caption: "text-caption",
  muted: "text-caption text-muted-foreground",
} as const;

const STACK_GAPS = {
  tight: "gap-1.5",
  cozy: "gap-3",
  loose: "gap-5",
} as const;

const { registry } = defineRegistry(catalog, {
  components: {
    Card: ({ props, children }) => (
      <CardShell className="flex flex-col gap-4 p-5">
        {props.title || props.aside ? (
          <CardHeading
            aside={
              props.aside ? (
                <MonoLabel className="text-mono-badge">{props.aside}</MonoLabel>
              ) : undefined
            }
            title={props.title ?? ""}
          />
        ) : null}
        {children}
      </CardShell>
    ),

    Stack: ({ props, children }) => (
      <div
        className={cn(
          "flex",
          props.direction === "row"
            ? "flex-row flex-wrap items-center"
            : "flex-col",
          STACK_GAPS[props.gap ?? "cozy"],
        )}
      >
        {children}
      </div>
    ),

    Text: ({ props }) =>
      props.look === "mono" ? (
        <MonoLabel className="text-mono-badge">{props.text}</MonoLabel>
      ) : (
        <span className={TEXT_LOOKS[props.look ?? "body"]}>{props.text}</span>
      ),

    Stats: ({ props }) => (
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {props.items.map((stat, index) => (
          <div className="flex flex-col gap-1" key={`${stat.label}-${index}`}>
            <dt>
              <MonoLabel className="text-mono-badge">{stat.label}</MonoLabel>
            </dt>
            <dd className="text-body-md font-semibold tabular-nums">
              {stat.value}
            </dd>
          </div>
        ))}
      </dl>
    ),

    Bars: ({ props }) => {
      // Normalised like the splits chart: the largest value is the tallest
      // bar, and even the smallest keeps a visible foot.
      const top = Math.max(...props.bars.map((bar) => bar.value), 1e-9);
      const labelled = props.bars.some((bar) => bar.label);
      return (
        <div className="flex flex-col gap-2">
          <div className="flex h-[132px] items-end gap-1">
            {props.bars.map((bar, index) => (
              <span
                className="flex h-full flex-1 flex-col justify-end"
                key={index}
                title={[
                  bar.label,
                  `${bar.value}${props.unit ? ` ${props.unit}` : ""}`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              >
                <span
                  className={cn(
                    "block rounded-t-[4px]",
                    bar.tone === "alert" ? "bg-chart-3" : "bg-brand",
                  )}
                  style={{
                    height: `${Math.round(6 + 94 * (bar.value / top))}%`,
                  }}
                />
              </span>
            ))}
          </div>
          {labelled && (
            <div className="flex gap-1">
              {props.bars.map((bar, index) => (
                <MonoLabel
                  className="text-mono-badge flex-1 truncate text-center"
                  key={index}
                >
                  {bar.label ?? ""}
                </MonoLabel>
              ))}
            </div>
          )}
        </div>
      );
    },

    Callout: ({ props }) => (
      <Callout tone={props.tone ?? "brand"}>{props.text}</Callout>
    ),

    AskButton: function AskButton({ props }) {
      const ask = useContext(AskContext);
      return (
        <Button
          className="self-start"
          onClick={() => ask(props.question)}
          size="sm"
          variant="subtle"
        >
          {props.label}
        </Button>
      );
    },
  },
  actions: {},
});

// --- the card -----------------------------------------------------------------

/** An element the catalogue has never heard of renders as nothing — the walk
 *  in `asDrawnCard` means this only ever sees what a *newer* API wrote. */
function UnknownElement() {
  return null;
}

export function CoachDrawnCard({
  card,
  actions,
}: {
  card: DrawnCard;
  actions: CardActions;
}) {
  return (
    <AskContext.Provider value={actions.onAsk}>
      <JSONUIProvider registry={registry}>
        <Renderer
          fallback={UnknownElement}
          registry={registry}
          spec={card.spec as unknown as Spec}
        />
      </JSONUIProvider>
    </AskContext.Provider>
  );
}
