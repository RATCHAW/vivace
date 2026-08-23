import { describe, expect, it } from "vitest";
import { buildDrawnCard, type ProposedSpec } from "./coach-draw.js";

/** A small, fully valid card: a Card holding a Stack of a Text and a Callout. */
function validSpec(): ProposedSpec {
  return {
    root: "card",
    elements: {
      card: {
        type: "Card",
        props: { title: "Two Sundays", aside: "LONG RUNS" },
        children: ["body"],
      },
      body: {
        type: "Stack",
        props: { gap: "loose" },
        children: ["line", "read"],
      },
      line: {
        type: "Text",
        props: { text: "This week's long run was 3 km further.", look: "body" },
      },
      read: {
        type: "Callout",
        props: {
          tone: "brand",
          text: "The extra distance came at the same heart rate.",
        },
      },
    },
  };
}

describe("buildDrawnCard", () => {
  it("returns the card for a valid spec, children always arrays", () => {
    const card = buildDrawnCard(validSpec());
    expect(card).toMatchObject({ card: "drawn" });
    if ("error" in card) throw new Error(card.error);
    expect(card.spec.root).toBe("card");
    expect(card.spec.elements.line.children).toEqual([]);
    expect(card.note).toBeUndefined();
  });

  it("rejects a root that names no element", () => {
    const spec = validSpec();
    spec.root = "nowhere";
    const card = buildDrawnCard(spec);
    expect(card).toHaveProperty("error");
    expect((card as { error: string }).error).toContain("nowhere");
  });

  it("rejects a root that is not a Card", () => {
    const spec = validSpec();
    spec.root = "line";
    expect(buildDrawnCard(spec)).toHaveProperty("error");
  });

  it("rejects an unknown component and names the vocabulary", () => {
    const spec = validSpec();
    spec.elements.line.type = "Table";
    const card = buildDrawnCard(spec) as { error: string };
    expect(card.error).toContain('"Table"');
    expect(card.error).toContain("Stats");
  });

  it("rejects a child id that names no element", () => {
    const spec = validSpec();
    spec.elements.body.children = ["line", "ghost"];
    const card = buildDrawnCard(spec) as { error: string };
    expect(card.error).toContain('"ghost"');
  });

  it("rejects an element referenced twice — the spec is a tree", () => {
    const spec = validSpec();
    spec.elements.body.children = ["line", "line"];
    expect(buildDrawnCard(spec)).toHaveProperty("error");
  });

  it("rejects broken props and names the element", () => {
    const spec = validSpec();
    spec.elements.line.props = { look: "body" }; // no text
    const card = buildDrawnCard(spec) as { error: string };
    expect(card.error).toContain('"line"');
  });

  it("drops children from a leaf with a note instead of failing", () => {
    const spec = validSpec();
    spec.elements.line.children = ["read"];
    spec.elements.body.children = ["line"];
    const card = buildDrawnCard(spec);
    if ("error" in card) throw new Error(card.error);
    expect(card.spec.elements.line.children).toEqual([]);
    expect(card.note).toContain("no children");
  });

  it("drops elements nothing references, with a note", () => {
    const spec = validSpec();
    spec.elements.orphan = { type: "Text", props: { text: "unused" } };
    const card = buildDrawnCard(spec);
    if ("error" in card) throw new Error(card.error);
    expect(card.spec.elements.orphan).toBeUndefined();
    expect(card.note).toContain("dropped");
  });

  it("trims oversized arrays and strings rather than rejecting them", () => {
    const spec = validSpec();
    spec.elements.chart = {
      type: "Bars",
      props: {
        bars: Array.from({ length: 40 }, (_, i) => ({ value: i })),
        unit: "km",
      },
    };
    spec.elements.body.children = ["line", "chart", "read"];
    spec.elements.line.props = { text: "x".repeat(400) };
    const card = buildDrawnCard(spec);
    if ("error" in card) throw new Error(card.error);
    const bars = card.spec.elements.chart.props.bars as unknown[];
    expect(bars).toHaveLength(30);
    const text = card.spec.elements.line.props.text as string;
    expect(text).toHaveLength(300);
    expect(text.endsWith("…")).toBe(true);
  });

  it("rejects a card with too many elements", () => {
    const spec = validSpec();
    const ids: string[] = [];
    for (let i = 0; i < 45; i++) {
      const id = `t${i}`;
      ids.push(id);
      spec.elements[id] = { type: "Text", props: { text: `line ${i}` } };
    }
    spec.elements.body.children = ids;
    const card = buildDrawnCard(spec) as { error: string };
    expect(card.error).toContain("simplify");
  });
});
