import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { VIDEO_TEMPLATES } from "@repo/video";
import { TemplateSelect } from "./template-select";

/** Opens the list. Base UI's trigger comes up on the pointer, not the click. */
async function openPicker() {
  const trigger = screen.getByLabelText("Video template");
  fireEvent.pointerDown(trigger, { button: 0 });
  fireEvent.click(trigger);
  return screen.findByRole("listbox");
}

/** The row a piece of text is sitting in. */
function row(node: HTMLElement) {
  return node.closest("[data-slot='select-item']");
}

afterEach(cleanup);

describe("TemplateSelect", () => {
  it("stamps the duo cut, and only the duo cut", async () => {
    render(
      <TemplateSelect template="run-video" onChange={vi.fn()} input={null} />,
    );

    const list = await openPicker();
    const stamps = within(list).getAllByText("New");
    expect(stamps).toHaveLength(1);

    // On the row it marks, not floating loose in the popup.
    expect(row(stamps[0])?.textContent).toContain("Duo replay");
  });

  it("leaves every other cut with its name alone", async () => {
    render(
      <TemplateSelect template="run-video" onChange={vi.fn()} input={null} />,
    );

    const list = await openPicker();
    for (const entry of VIDEO_TEMPLATES) {
      if (entry.id === "duo-replay") continue;
      const named = within(list).getByText(entry.label);
      expect(row(named)?.textContent).not.toContain("New");
    }
  });
});
