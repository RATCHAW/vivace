import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { CoachComposer, type CoachComposerProps } from "./coach-composer";

afterEach(() => {
  // Vitest runs without globals, so RTL never registered its own auto-cleanup.
  cleanup();
  vi.unstubAllGlobals();
});

function renderComposer(props: Partial<CoachComposerProps> = {}) {
  render(
    <CoachComposer
      attached={null}
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

describe("CoachComposer", () => {
  it("takes the caret when a conversation opens", () => {
    stubPointer(false);
    renderComposer();

    expect(document.activeElement).toBe(screen.getByRole("textbox"));
  });

  it("leaves the keyboard down on a touch device", () => {
    stubPointer(true);
    renderComposer();

    expect(document.activeElement).not.toBe(screen.getByRole("textbox"));
  });

  it("doesn't reach for a box the turn has disabled", () => {
    stubPointer(false);
    renderComposer({ status: "streaming" });

    const field = screen.getByRole("textbox");
    expect(field.hasAttribute("disabled")).toBe(true);
    expect(document.activeElement).not.toBe(field);
  });
});
