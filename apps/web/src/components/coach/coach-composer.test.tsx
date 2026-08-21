import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { i18n } from "@/i18n";
import type { Run } from "@/api";
import { CoachComposer, type RunMention } from "./coach-composer";

afterEach(async () => {
  // Vitest runs without globals, so RTL never registered its own auto-cleanup.
  cleanup();
  await i18n.changeLanguage("en");
});

function run(id: number, name: string, day: string): Run {
  return {
    id,
    name,
    distance: 15_020,
    moving_time: 4200,
    total_elevation_gain: 40,
    sport_type: "Run",
    start_date_local: `${day}T07:30:00Z`,
    average_speed: 3.5,
    average_heartrate: 148,
    max_heartrate: 171,
    workout_type: "default",
  };
}

const RUNS = [
  run(1, "Morning Run", "2026-08-05"),
  run(2, "Sortie Légère", "2026-08-03"),
  run(3, "Tempo Tuesday", "2026-07-29"),
];

/**
 * The composer with its state held for it, the way <CoachChat> holds it —
 * a controlled draft that never updates would make every keystroke the first.
 */
function Harness(props: {
  onAttach?: (mention: RunMention | null) => void;
  onAsk?: (text: string) => void;
  runs?: Run[];
}) {
  const [draft, setDraft] = React.useState("");
  const [attached, setAttached] = React.useState<RunMention | null>(null);
  const [pickerOpen, setPickerOpen] = React.useState(false);

  return (
    <CoachComposer
      attached={attached}
      draft={draft}
      onAsk={props.onAsk ?? vi.fn()}
      onAttach={(mention) => {
        setAttached(mention);
        props.onAttach?.(mention);
      }}
      onDraftChange={setDraft}
      onPickerOpenChange={setPickerOpen}
      onStop={vi.fn()}
      onSubmit={vi.fn()}
      pickerOpen={pickerOpen}
      runs={props.runs ?? RUNS}
      status="ready"
      suggestions={[]}
    />
  );
}

function box(): HTMLTextAreaElement {
  return screen.getByRole("combobox") as HTMLTextAreaElement;
}

/** Typing, as the browser reports it: the caret lands after what was typed. */
function type(value: string, caret = value.length) {
  const field = box();
  fireEvent.change(field, { target: { value } });
  field.setSelectionRange(caret, caret);
  fireEvent.select(field);
}

function options(): HTMLElement[] {
  return screen.queryAllByRole("option");
}

function activeOption(): HTMLElement | null {
  const id = box().getAttribute("aria-activedescendant");
  return id ? document.getElementById(id) : null;
}

describe("CoachComposer run mentions", () => {
  it("opens the run list on a typed `@`, with the newest run armed", () => {
    render(<Harness />);
    fireEvent.focus(box());
    type("@");

    expect(options()).toHaveLength(3);
    expect(box().getAttribute("aria-expanded")).toBe("true");
    // Armed, so Enter attaches — which is what `@` was typed to do.
    expect(activeOption()?.textContent).toContain("Morning Run");
  });

  it("narrows the list as the mention is typed, accents and all", () => {
    render(<Harness />);
    fireEvent.focus(box());
    type("@legere");

    expect(options()).toHaveLength(1);
    expect(options()[0].textContent).toContain("Sortie Légère");
  });

  it("says so when nothing matches, rather than closing", () => {
    render(<Harness />);
    fireEvent.focus(box());
    type("@marathon");

    expect(options()).toHaveLength(0);
    expect(screen.getByRole("status").textContent).toBe(
      "No run matches “marathon”.",
    );
    // Nothing to choose, so the box stops claiming to drive a list.
    expect(box().getAttribute("aria-expanded")).toBe("false");
  });

  it("moves the highlight with the arrow keys, and wraps at both ends", () => {
    render(<Harness />);
    fireEvent.focus(box());
    type("@");

    fireEvent.keyDown(box(), { key: "ArrowDown" });
    expect(activeOption()?.textContent).toContain("Sortie Légère");

    fireEvent.keyDown(box(), { key: "ArrowUp" });
    expect(activeOption()?.textContent).toContain("Morning Run");

    fireEvent.keyDown(box(), { key: "ArrowUp" });
    expect(activeOption()?.textContent).toContain("Tempo Tuesday");

    fireEvent.keyDown(box(), { key: "ArrowDown" });
    expect(activeOption()?.textContent).toContain("Morning Run");
  });

  it("attaches on Enter and cuts the mention back out of the question", () => {
    const onAttach = vi.fn();
    render(<Harness onAttach={onAttach} />);
    fireEvent.focus(box());
    type("why did I fade on @tempo");

    fireEvent.keyDown(box(), { key: "Enter" });

    expect(onAttach).toHaveBeenCalledWith({
      id: 3,
      name: "Tempo Tuesday",
      date: "2026-07-29",
    });
    expect(box().value).toBe("why did I fade on ");
    expect(options()).toHaveLength(0);
  });

  it("attaches on click, keeping the caret in the box", () => {
    const onAttach = vi.fn();
    render(<Harness onAttach={onAttach} />);
    box().focus();
    type("@");

    fireEvent.click(options()[1]);

    expect(onAttach).toHaveBeenCalledWith({
      id: 2,
      name: "Sortie Légère",
      date: "2026-08-03",
    });
    expect(document.activeElement).toBe(box());
  });

  it("leaves shift+Enter to the newline it has always been", () => {
    const onAttach = vi.fn();
    render(<Harness onAttach={onAttach} />);
    fireEvent.focus(box());
    type("@");

    fireEvent.keyDown(box(), { key: "Enter", shiftKey: true });
    expect(onAttach).not.toHaveBeenCalled();
  });

  it("closes on Escape and keeps what was typed", () => {
    render(<Harness />);
    fireEvent.focus(box());
    type("@morn");

    fireEvent.keyDown(box(), { key: "Escape" });

    expect(options()).toHaveLength(0);
    expect(box().value).toBe("@morn");
    expect(box().getAttribute("aria-expanded")).toBe("false");
    // Dismissed for this `@` and no further: typing on does not reopen it…
    type("@morni");
    expect(options()).toHaveLength(0);
    // …but abandoning it and starting another does.
    type("ask about @");
    expect(options()).toHaveLength(3);
  });

  it("opens the same list from the button, arming nothing", () => {
    render(<Harness />);
    const button = screen.getByRole("button", { name: "Attach a run" });

    fireEvent.click(button);

    expect(options()).toHaveLength(3);
    expect(button.getAttribute("aria-expanded")).toBe("true");
    // Nothing armed: the athlete may have a question written already, and
    // Enter has to go on meaning send.
    expect(box().getAttribute("aria-activedescendant")).toBeNull();
    // The caret is handed straight back, so the arrows work on the list.
    expect(document.activeElement).toBe(box());

    fireEvent.keyDown(box(), { key: "ArrowDown" });
    expect(activeOption()?.textContent).toContain("Morning Run");

    fireEvent.keyDown(box(), { key: "Escape" });
    expect(options()).toHaveLength(0);
  });

  it("names the list it is driving, for a reader that cannot see it", () => {
    render(<Harness />);
    fireEvent.focus(box());
    type("@");

    const list = screen.getByRole("listbox", { name: "Runs you can attach" });
    expect(box().getAttribute("aria-controls")).toBe(list.id);
    expect(box().getAttribute("aria-autocomplete")).toBe("list");
    expect(activeOption()?.getAttribute("aria-selected")).toBe("true");
  });

  it("says what the keys do, and only while there are rows to move through", () => {
    render(<Harness />);
    fireEvent.focus(box());
    type("@");

    // The arrows worked before this existed; nothing on screen said so.
    expect(screen.getByText("↑↓")).toBeDefined();
    expect(screen.getByText("↵")).toBeDefined();
    expect(screen.getByText("esc")).toBeDefined();

    // Nothing to move through, so no shortcuts over the sentence saying so.
    type("@marathon");
    expect(screen.queryByText("↑↓")).toBeNull();
  });

  it("has nothing to attach before Strava has synced", () => {
    render(<Harness runs={[]} />);
    fireEvent.focus(box());
    type("@");

    expect(screen.getByRole("status").textContent).toBe(
      "No runs synced from Strava yet.",
    );
  });
});

describe("CoachComposer commands", () => {
  it("runs the highlighted command on Enter", () => {
    const onAsk = vi.fn();
    render(<Harness onAsk={onAsk} />);
    fireEvent.focus(box());
    type("/we");

    expect(options()).toHaveLength(1);
    fireEvent.keyDown(box(), { key: "Enter" });

    expect(onAsk).toHaveBeenCalledWith("Plan my week");
    expect(box().value).toBe("");
  });

  it("speaks French, triggers included", async () => {
    await i18n.changeLanguage("fr");
    render(<Harness />);
    fireEvent.focus(box());
    type("/sem");

    expect(
      screen.getByRole("listbox", { name: "Commandes du coach" }),
    ).toBeDefined();
    expect(options()[0].textContent).toContain("/semaine");
  });
});
