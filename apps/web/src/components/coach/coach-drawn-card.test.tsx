import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { asCoachCard, CoachCardView, type CardActions } from "./coach-cards";
import { asDrawnCard, type DrawnCard } from "./coach-drawn-card";

afterEach(cleanup);

const actions: CardActions = {
  onAsk: vi.fn(),
  onAcceptPlan: vi.fn(),
};

/** A card the coach could plausibly draw: heading, stats, bars, read, button. */
function drawn(): DrawnCard {
  return {
    card: "drawn",
    spec: {
      root: "card",
      elements: {
        card: {
          type: "Card",
          props: { title: "Two Sundays, side by side", aside: "LONG RUNS" },
          children: ["stats", "chart", "read", "more"],
        },
        stats: {
          type: "Stats",
          props: {
            items: [
              { label: "THIS WEEK", value: "18.4 km" },
              { label: "LAST WEEK", value: "15.1 km" },
            ],
          },
        },
        chart: {
          type: "Bars",
          props: {
            bars: [
              { label: "W1", value: 15.1 },
              { label: "W2", value: 18.4, tone: "alert" },
            ],
            unit: "km",
          },
        },
        read: {
          type: "Callout",
          props: { tone: "warn", text: "That jump is over the safe ramp." },
        },
        more: {
          type: "AskButton",
          props: { label: "Cap next week", question: "Cap next week for me" },
        },
      },
    },
  };
}

describe("asDrawnCard", () => {
  it("accepts what the API builds", () => {
    expect(asDrawnCard(drawn())).not.toBeNull();
  });

  it("is what asCoachCard answers for a drawn discriminator", () => {
    expect(asCoachCard(drawn())).not.toBeNull();
    expect(asCoachCard({ card: "drawn", spec: null })).toBeNull();
  });

  it("degrades an unknown component to the tool chip", () => {
    const card = drawn();
    card.spec.elements.stats.type = "Table";
    expect(asDrawnCard(card)).toBeNull();
  });

  it("degrades broken props to the tool chip", () => {
    const card = drawn();
    card.spec.elements.read.props = { tone: "warn" }; // no text
    expect(asDrawnCard(card)).toBeNull();
  });

  it("refuses a spec whose tree loops — it would recurse forever", () => {
    const card = drawn();
    card.spec.elements.card.children = ["card"];
    expect(asDrawnCard(card)).toBeNull();
  });
});

describe("CoachDrawnCard", () => {
  it("draws the composed card", () => {
    render(<CoachCardView actions={actions} card={drawn()} />);
    expect(screen.getByText("Two Sundays, side by side")).toBeDefined();
    expect(screen.getByText("THIS WEEK")).toBeDefined();
    expect(screen.getByText("18.4 km")).toBeDefined();
    expect(screen.getByText("That jump is over the safe ramp.")).toBeDefined();
  });

  it("sends the button's question through onAsk", () => {
    render(<CoachCardView actions={actions} card={drawn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Cap next week" }));
    expect(actions.onAsk).toHaveBeenCalledWith("Cap next week for me");
  });
});
