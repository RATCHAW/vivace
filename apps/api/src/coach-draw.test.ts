import { describe, expect, it } from "vitest";
import { buildDrawnCard, type ProposedCard } from "./coach-draw.js";

/** A card the model could plausibly send: heading, stats, chart, read, tap. */
function validCard(): ProposedCard {
  return {
    title: "Long runs compared",
    aside: "Jun 27 vs Aug 3",
    blocks: [
      { kind: "text", text: "Jun 27 · 20 km", look: "strong" },
      {
        kind: "stats",
        items: [
          { label: "PACE", value: "5:32 /km" },
          { label: "HR", value: "159" },
        ],
      },
      {
        kind: "bars",
        bars: [
          { label: "JUN", value: 20 },
          { label: "AUG", value: 15, tone: "alert" },
        ],
        unit: "km",
      },
      { kind: "callout", tone: "brand", text: "Same pace, same heart rate." },
      { kind: "ask", label: "Plan my week", question: "Plan my week" },
    ],
  };
}

describe("buildDrawnCard", () => {
  it("composes the blocks into a json-render spec, Card at the root", () => {
    const card = buildDrawnCard(validCard());
    if ("error" in card) throw new Error(card.error);
    expect(card.spec.root).toBe("card");
    const root = card.spec.elements.card;
    expect(root.type).toBe("Card");
    expect(root.props.title).toBe("Long runs compared");
    expect(root.children).toEqual(["b0", "b1", "b2", "b3", "b4"]);
    expect(card.spec.elements.b0.type).toBe("Text");
    expect(card.spec.elements.b1.type).toBe("Stats");
    expect(card.spec.elements.b2.type).toBe("Bars");
    expect(card.spec.elements.b3.type).toBe("Callout");
    expect(card.spec.elements.b4.type).toBe("AskButton");
    expect(card.note).toBeUndefined();
  });

  it("parses blocks that arrived as a JSON string", () => {
    const card = buildDrawnCard({
      ...validCard(),
      blocks: JSON.stringify(validCard().blocks),
    });
    expect(card).toMatchObject({ card: "drawn" });
  });

  it("answers a string that isn't JSON with an error, not a dead turn", () => {
    const card = buildDrawnCard({ blocks: '[{"kind": ]' }) as {
      error: string;
    };
    expect(card.error).toContain("isn't valid JSON");
  });

  it("errors on missing or empty blocks, naming the kinds", () => {
    const card = buildDrawnCard({ title: "Empty" }) as { error: string };
    expect(card.error).toContain("callout");
  });

  it('reads "type" where a model wrote it instead of "kind"', () => {
    const card = buildDrawnCard({
      blocks: [{ type: "text", text: "hello" }],
    });
    if ("error" in card) throw new Error(card.error);
    expect(card.spec.elements.b0.type).toBe("Text");
  });

  it("drops a broken block with a note and keeps the rest", () => {
    const card = buildDrawnCard({
      blocks: [
        { kind: "text" }, // no text
        { kind: "chart", bars: [] }, // unknown kind
        { kind: "callout", text: "Still standing." },
      ],
    });
    if ("error" in card) throw new Error(card.error);
    expect(Object.keys(card.spec.elements)).toEqual(["b2", "card"]);
    expect(card.note).toContain("Block 1");
    expect(card.note).toContain('"chart"');
  });

  it("errors when no block survives, carrying the notes", () => {
    const card = buildDrawnCard({ blocks: [{ kind: "text" }] }) as {
      error: string;
    };
    expect(card.error).toContain("No block could be drawn");
    expect(card.error).toContain("Block 1");
  });

  it("trims oversized strings and arrays rather than rejecting them", () => {
    const card = buildDrawnCard({
      title: "x".repeat(200),
      blocks: [
        { kind: "text", text: "y".repeat(400) },
        {
          kind: "bars",
          bars: Array.from({ length: 40 }, (_, i) => ({ value: i })),
        },
      ],
    });
    if ("error" in card) throw new Error(card.error);
    const title = card.spec.elements.card.props.title as string;
    expect(title).toHaveLength(80);
    expect((card.spec.elements.b0.props.text as string).length).toBe(300);
    expect(card.spec.elements.b1.props.bars as unknown[]).toHaveLength(30);
  });

  it("keeps the card when the title is not a string", () => {
    const card = buildDrawnCard({
      title: 42,
      blocks: [{ kind: "text", text: "still a card" }],
    });
    if ("error" in card) throw new Error(card.error);
    expect(card.spec.elements.card.props.title).toBeNull();
  });

  it("draws only the first dozen blocks, and says so", () => {
    const card = buildDrawnCard({
      blocks: Array.from({ length: 20 }, (_, i) => ({
        kind: "text",
        text: `line ${i}`,
      })),
    });
    if ("error" in card) throw new Error(card.error);
    expect(card.spec.elements.card.children).toHaveLength(12);
    expect(card.note).toContain("first 12");
  });
});
