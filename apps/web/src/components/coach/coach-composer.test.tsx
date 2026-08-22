import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { i18n } from "@/i18n";
import type { Run } from "@/api";
import {
  CoachComposer,
  type CoachComposerProps,
  type RunMention,
} from "./coach-composer";
import type { PromptInputMessage } from "@/components/ai-elements/prompt-input";
import type { SpeechRecogniser } from "@/lib/dictation";

vi.mock("@/lib/logger", () => ({
  trackEvent: vi.fn(),
  trackError: vi.fn(),
}));

const toastError = vi.fn();
vi.mock("sonner", () => ({ toast: { error: (m: string) => toastError(m) } }));

function renderComposer(props: Partial<CoachComposerProps> = {}) {
  render(
    <CoachComposer
      attached={[]}
      draft=""
      onAsk={vi.fn()}
      onAttach={vi.fn()}
      onDraftChange={vi.fn()}
      onPickerOpenChange={vi.fn()}
      onStop={vi.fn()}
      onSubmit={vi.fn()}
      pickerOpen={false}
      runs={undefined}
      status="ready"
      suggestions={[]}
      {...props}
    />,
  );
}

/** A device that answers a media query however this test needs it to. */
function stubPointer(coarse: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query.includes("pointer: coarse") ? coarse : !coarse,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

/** The recogniser the browser would have given us, driveable from a test. */
class FakeRecogniser implements SpeechRecogniser {
  static last: FakeRecogniser | null = null;
  lang = "";
  continuous = false;
  interimResults = false;
  maxAlternatives = 0;
  started = false;
  onresult: SpeechRecogniser["onresult"] = null;
  onerror: SpeechRecogniser["onerror"] = null;
  onend: SpeechRecogniser["onend"] = null;
  /** What the service has heard but not yet committed to. */
  private pending = "";

  constructor() {
    FakeRecogniser.last = this;
  }

  start() {
    this.started = true;
  }

  /** The real one flushes what it was still weighing, then ends. */
  stop() {
    this.started = false;
    if (this.pending) this.say(this.pending, true);
    this.onend?.();
  }

  /** The real one throws the pending words away. */
  abort() {
    this.started = false;
    this.pending = "";
    this.onend?.();
  }

  /** Say something, the way the service delivers it. */
  say(text: string, final: boolean) {
    this.pending = final ? "" : text;
    const result = {
      isFinal: final,
      length: 1,
      0: { transcript: text, confidence: 1 },
      item: () => ({ transcript: text, confidence: 1 }),
    };
    const list = Object.assign([result], { item: (i: number) => [result][i] });
    act(() => {
      this.onresult?.({
        results: list as unknown as SpeechRecognitionResultList,
      });
    });
  }
}

/**
 * The composer as the chat drives it: a controlled box with a real draft, and
 * a submit that empties it the way `CoachChat.handleSubmit` does.
 */
function Composer({
  initial = "",
  onSubmit = vi.fn(),
}: {
  initial?: string;
  onSubmit?: (message: PromptInputMessage) => void;
}) {
  const [draft, setDraft] = useState(initial);
  return (
    <CoachComposer
      attached={[]}
      draft={draft}
      onAsk={vi.fn()}
      onAttach={vi.fn()}
      onDraftChange={setDraft}
      onPickerOpenChange={vi.fn()}
      onStop={vi.fn()}
      onSubmit={(message) => {
        setDraft("");
        onSubmit(message);
      }}
      pickerOpen={false}
      runs={[]}
      status="ready"
      suggestions={[]}
    />
  );
}

function box(): HTMLTextAreaElement {
  return screen.getByRole("combobox");
}

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
  onAttach?: (attached: RunMention[]) => void;
  onAsk?: (text: string) => void;
  runs?: Run[];
}) {
  const [draft, setDraft] = useState("");
  const [attached, setAttached] = useState<RunMention[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);

  return (
    <CoachComposer
      attached={attached}
      draft={draft}
      onAsk={props.onAsk ?? vi.fn()}
      onAttach={(next) => {
        setAttached(next);
        props.onAttach?.(next);
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

function send(): HTMLButtonElement {
  return screen.getByRole("button", { name: "Send" });
}

/** `PromptInput` converts its attachments before handing the message over. */
async function clickSend(): Promise<void> {
  await act(async () => {
    fireEvent.click(send());
  });
}

beforeEach(() => {
  (window as { SpeechRecognition?: unknown }).SpeechRecognition =
    FakeRecogniser;
});

afterEach(async () => {
  // Vitest runs without globals, so RTL never registered its own auto-cleanup.
  cleanup();
  vi.unstubAllGlobals();
  FakeRecogniser.last = null;
  toastError.mockClear();
  delete (window as { SpeechRecognition?: unknown }).SpeechRecognition;
  await i18n.changeLanguage("en");
});

describe("CoachComposer", () => {
  it("takes the caret when a conversation opens", () => {
    stubPointer(false);
    renderComposer();

    expect(document.activeElement).toBe(screen.getByRole("combobox"));
  });

  it("leaves the keyboard down on a touch device", () => {
    stubPointer(true);
    renderComposer();

    expect(document.activeElement).not.toBe(screen.getByRole("combobox"));
  });

  it("doesn't reach for a box the turn has disabled", () => {
    stubPointer(false);
    renderComposer({ status: "streaming" });

    const field = screen.getByRole("combobox");
    expect(field.hasAttribute("disabled")).toBe(true);
    expect(document.activeElement).not.toBe(field);
  });
});

describe("CoachComposer dictation", () => {
  it("writes what was said into the box, replacing the half-heard words", () => {
    render(<Composer />);
    fireEvent.click(screen.getByRole("button", { name: "Dictate" }));

    const recogniser = FakeRecogniser.last;
    expect(recogniser?.started).toBe(true);

    recogniser?.say("why did I fade", false);
    expect(box().value).toBe("why did I fade");

    recogniser?.say("why did I fade on Sunday", true);
    expect(box().value).toBe("why did I fade on Sunday");
  });

  it("finishes a question already half typed rather than starting again", () => {
    render(<Composer initial="Compare Sunday" />);
    fireEvent.click(screen.getByRole("button", { name: "Dictate" }));

    FakeRecogniser.last?.say("with last week", true);
    expect(box().value).toBe("Compare Sunday with last week");
  });

  it("stands next to send, and never in place of it", () => {
    render(<Composer />);
    expect(
      screen.getByRole("button", { name: "Dictate" }).nextElementSibling,
    ).toBe(send());

    fireEvent.click(screen.getByRole("button", { name: "Dictate" }));

    // Still there mid-sentence: send is how an athlete says they have said
    // enough, and a composer that hid it would make them stop twice.
    expect(send()).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Stop dictating" }).nextElementSibling,
    ).toBe(send());
  });

  it("keeps the last words when the square only stops the recording", () => {
    const onSubmit = vi.fn();
    render(<Composer onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole("button", { name: "Dictate" }));

    const recogniser = FakeRecogniser.last;
    recogniser?.say("why did I fade on Sunday", false);
    fireEvent.click(screen.getByRole("button", { name: "Stop dictating" }));

    expect(recogniser?.started).toBe(false);
    // The half-heard words were flushed into the box rather than dropped, and
    // nothing was sent — the athlete gets to read the question back first.
    expect(box().value).toBe("why did I fade on Sunday");
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Dictate" })).toBeTruthy();
  });

  it("sends what has been transcribed and closes the microphone with it", async () => {
    const onSubmit = vi.fn();
    render(<Composer onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole("button", { name: "Dictate" }));

    const recogniser = FakeRecogniser.last;
    recogniser?.say("plan my week", false);
    await clickSend();

    // The half-heard words are the question — send is the athlete saying so.
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ text: "plan my week" }),
    );
    expect(recogniser?.started).toBe(false);
    expect(screen.getByRole("button", { name: "Dictate" })).toBeTruthy();
  });

  it("does not type the sent question back into an emptied box", async () => {
    render(<Composer />);
    fireEvent.click(screen.getByRole("button", { name: "Dictate" }));

    const recogniser = FakeRecogniser.last;
    recogniser?.say("plan my week", false);
    await clickSend();
    // A recogniser that delivers one last result on its way out anyway — the
    // handler is gone, so the words have nowhere to land.
    recogniser?.say("plan my week", true);

    expect(box().value).toBe("");
  });

  it("asks in the language the app is being read in", async () => {
    await act(() => i18n.changeLanguage("fr"));
    render(<Composer />);
    fireEvent.click(screen.getByRole("button", { name: "Dicter" }));

    expect(FakeRecogniser.last?.lang).toBe("fr-FR");
  });

  it("says why the microphone gave up, but not when it heard silence", () => {
    render(<Composer />);
    fireEvent.click(screen.getByRole("button", { name: "Dictate" }));

    act(() => FakeRecogniser.last?.onerror?.({ error: "no-speech" }));
    expect(toastError).not.toHaveBeenCalled();

    act(() => FakeRecogniser.last?.onerror?.({ error: "not-allowed" }));
    expect(toastError).toHaveBeenCalledWith(
      "Microphone access is blocked. Allow it in your browser settings to dictate.",
    );
  });

  it("offers nothing where the browser has no recogniser", () => {
    delete (window as { SpeechRecognition?: unknown }).SpeechRecognition;
    render(<Composer />);

    expect(screen.queryByRole("button", { name: "Dictate" })).toBeNull();
  });
});

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
    expect(screen.getByText("No run matches “marathon”.")).toBeDefined();
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

    expect(onAttach).toHaveBeenCalledWith([
      { id: 3, name: "Tempo Tuesday", date: "2026-07-29" },
    ]);
    expect(box().value).toBe("why did I fade on ");
    expect(options()).toHaveLength(0);
  });

  it("attaches on click, keeping the caret in the box", () => {
    const onAttach = vi.fn();
    render(<Harness onAttach={onAttach} />);
    box().focus();
    type("@");

    fireEvent.click(options()[1]);

    expect(onAttach).toHaveBeenCalledWith([
      { id: 2, name: "Sortie Légère", date: "2026-08-03" },
    ]);
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

    expect(screen.getByText("No runs synced from Strava yet.")).toBeDefined();
  });

  // The chip used to float above the box as a status line. It is part of the
  // message being written, so it lives in the box the message is written in —
  // the same row the file attachments were already using.
  it("puts the attached run inside the box, beside the files", () => {
    render(<Harness />);
    fireEvent.focus(box());
    type("@");
    fireEvent.keyDown(box(), { key: "Enter" });

    const chip = screen.getByRole("button", {
      name: "Remove Morning Run · 5 Aug",
    });
    const group = box().closest('[data-slot="input-group"]');
    expect(group).not.toBeNull();
    expect(group?.contains(chip)).toBe(true);
  });

  it("carries several runs on one question", () => {
    const onAttach = vi.fn();
    render(<Harness onAttach={onAttach} />);
    fireEvent.focus(box());

    type("@morn");
    fireEvent.keyDown(box(), { key: "Enter" });
    type("@tempo");
    fireEvent.keyDown(box(), { key: "Enter" });

    expect(onAttach).toHaveBeenLastCalledWith([
      { id: 1, name: "Morning Run", date: "2026-08-05" },
      { id: 3, name: "Tempo Tuesday", date: "2026-07-29" },
    ]);
    expect(
      screen.getByRole("button", { name: "Remove Morning Run · 5 Aug" }),
    ).toBeDefined();
    expect(
      screen.getByRole("button", { name: "Remove Tempo Tuesday · 29 Jul" }),
    ).toBeDefined();
  });

  // Without this the list is a one-way door: a run picked by mistake could only
  // be undone by finding its chip, and the row that put it there looks inert.
  it("ticks what is already on the message, and untticks it on a second Enter", () => {
    render(<Harness />);
    fireEvent.focus(box());
    type("@morn");
    fireEvent.keyDown(box(), { key: "Enter" });

    type("@morn");
    expect(options()[0].getAttribute("aria-checked")).toBe("true");

    fireEvent.keyDown(box(), { key: "Enter" });
    expect(
      screen.queryByRole("button", { name: "Remove Morning Run · 5 Aug" }),
    ).toBeNull();
  });

  it("stops at five runs, and says why rather than ignoring the sixth", () => {
    const many = Array.from({ length: 7 }, (_, i) =>
      run(i + 1, `Run ${i + 1}`, "2026-08-05"),
    );
    render(<Harness runs={many} />);
    const button = screen.getByRole("button", { name: "Attach a run" });

    fireEvent.click(button);
    for (let i = 0; i < 5; i++) fireEvent.click(options()[i]);

    expect(
      screen.getByText(
        "5 runs is as many as one question can carry. Take one off to add another.",
      ),
    ).toBeDefined();

    // The sixth row is offered — it is still a run — and it does nothing.
    const sixth = options()[5];
    expect(sixth.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(sixth);
    expect(
      screen.queryByRole("button", { name: "Remove Run 6 · 5 Aug" }),
    ).toBeNull();

    // The five already on the message never stop being choosable, or there
    // would be no way back down to four.
    expect(options()[0].getAttribute("aria-disabled")).toBeNull();
    fireEvent.click(options()[0]);
    expect(
      screen.queryByRole("button", { name: "Remove Run 1 · 5 Aug" }),
    ).toBeNull();
  });

  // "Compare these three" is three rows of the same list. Closing on the first
  // pick meant reopening the picker between every one of them.
  it("keeps the button's list open so a second run is one more click", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Attach a run" }));

    fireEvent.click(options()[0]);
    expect(options()).toHaveLength(3);
    fireEvent.click(options()[2]);

    expect(
      screen.getByRole("button", { name: "Remove Morning Run · 5 Aug" }),
    ).toBeDefined();
    expect(
      screen.getByRole("button", { name: "Remove Tempo Tuesday · 29 Jul" }),
    ).toBeDefined();
  });

  it("names the run each × takes off", () => {
    render(<Harness />);
    fireEvent.focus(box());
    type("@morn");
    fireEvent.keyDown(box(), { key: "Enter" });

    fireEvent.click(
      screen.getByRole("button", { name: "Remove Morning Run · 5 Aug" }),
    );
    expect(
      screen.queryByRole("button", { name: "Remove Morning Run · 5 Aug" }),
    ).toBeNull();
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
