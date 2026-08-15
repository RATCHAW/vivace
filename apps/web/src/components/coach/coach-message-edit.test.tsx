import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { i18n } from "@/i18n";
import { CoachMessageEdit } from "./coach-message-edit";

afterEach(async () => {
  // Vitest runs without globals, so RTL never registered its own auto-cleanup.
  cleanup();
  await i18n.changeLanguage("en");
});

function field(): HTMLTextAreaElement {
  return screen.getByRole("textbox");
}

describe("CoachMessageEdit", () => {
  it("opens on the question, with the caret after the last word", () => {
    render(
      <CoachMessageEdit
        onCancel={vi.fn()}
        onSubmit={vi.fn()}
        text="Plan my week"
      />,
    );

    expect(field().value).toBe("Plan my week");
    expect(document.activeElement).toBe(field());
    // Not a full selection: the next keystroke has to change a word, not lose
    // the sentence.
    expect(field().selectionStart).toBe("Plan my week".length);
    expect(field().selectionEnd).toBe("Plan my week".length);
  });

  it("sends on Enter, and takes a newline on shift+Enter", () => {
    const onSubmit = vi.fn();
    render(
      <CoachMessageEdit onCancel={vi.fn()} onSubmit={onSubmit} text="Hi" />,
    );

    fireEvent.keyDown(field(), { key: "Enter", shiftKey: true });
    expect(onSubmit).not.toHaveBeenCalled();

    fireEvent.keyDown(field(), { key: "Enter" });
    expect(onSubmit).toHaveBeenCalledWith("Hi");
  });

  it("leaves an IME candidate window alone", () => {
    const onSubmit = vi.fn();
    render(
      <CoachMessageEdit onCancel={vi.fn()} onSubmit={onSubmit} text="Hi" />,
    );

    fireEvent.compositionStart(field());
    fireEvent.keyDown(field(), { key: "Enter" });
    expect(onSubmit).not.toHaveBeenCalled();

    fireEvent.compositionEnd(field());
    fireEvent.keyDown(field(), { key: "Enter" });
    expect(onSubmit).toHaveBeenCalledOnce();
  });

  it("cancels on Escape", () => {
    const onCancel = vi.fn();
    render(
      <CoachMessageEdit onCancel={onCancel} onSubmit={vi.fn()} text="Hi" />,
    );

    fireEvent.keyDown(field(), { key: "Escape" });
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("hands back a trimmed question, and refuses an empty one", () => {
    const onSubmit = vi.fn();
    render(
      <CoachMessageEdit onCancel={vi.fn()} onSubmit={onSubmit} text="Hi" />,
    );
    const ask = screen.getByRole("button", { name: "Ask again" });

    fireEvent.change(field(), { target: { value: "   " } });
    expect(ask.hasAttribute("disabled")).toBe(true);
    fireEvent.keyDown(field(), { key: "Enter" });
    expect(onSubmit).not.toHaveBeenCalled();

    fireEvent.change(field(), { target: { value: "  Plan my week  " } });
    fireEvent.click(ask);
    expect(onSubmit).toHaveBeenCalledWith("Plan my week");
  });

  it("speaks French when French is the language", async () => {
    await i18n.changeLanguage("fr");
    render(
      <CoachMessageEdit onCancel={vi.fn()} onSubmit={vi.fn()} text="Salut" />,
    );

    expect(screen.getByRole("button", { name: "Annuler" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Redemander" })).toBeDefined();
  });
});
