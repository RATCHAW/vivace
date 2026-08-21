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
import { CoachComposer } from "./coach-composer";
import type { PromptInputMessage } from "@/components/ai-elements/prompt-input";
import type { SpeechRecogniser } from "@/lib/dictation";

vi.mock("@/lib/logger", () => ({
  trackEvent: vi.fn(),
  trackError: vi.fn(),
}));

const toastError = vi.fn();
vi.mock("sonner", () => ({ toast: { error: (m: string) => toastError(m) } }));

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
      attached={null}
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
  return screen.getByRole("textbox");
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
  cleanup();
  FakeRecogniser.last = null;
  toastError.mockClear();
  delete (window as { SpeechRecognition?: unknown }).SpeechRecognition;
  await i18n.changeLanguage("en");
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
