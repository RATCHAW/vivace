import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { i18n } from "@/i18n";
import { TemplateSelect } from "./template-select";

afterEach(async () => {
  // Vitest runs without globals, so RTL never registered its own auto-cleanup.
  cleanup();
  await i18n.changeLanguage("en");
});

/** Open the list and hand back the rows in it. */
function open() {
  fireEvent.click(screen.getByRole("combobox"));
  return screen.getAllByRole("option");
}

describe("TemplateSelect previewing", () => {
  it("previews the highlighted template, and forgets it when the list closes", () => {
    const onPreview = vi.fn();
    const onChange = vi.fn();

    render(
      <TemplateSelect
        template="minimal-numbers"
        input={null}
        onChange={onChange}
        onPreview={onPreview}
      />,
    );

    const options = open();
    const other = options.find((option) => option.textContent !== "Minimal numbers");
    expect(other).toBeDefined();

    // Base UI drives this list with a non-virtual `useListNavigation`, so a row
    // reached by pointer *or* by arrow key takes real DOM focus. That is the
    // whole basis for previewing on `onFocus`, so it is what the test asserts —
    // if Base UI ever moves to `aria-activedescendant`, this fails rather than
    // the feature silently going quiet.
    fireEvent.focus(other!);
    expect(onPreview).toHaveBeenLastCalledWith(expect.any(String));
    expect(onPreview.mock.lastCall?.[0]).not.toBe("minimal-numbers");

    // Closing without picking one is the athlete saying no: the preview is
    // dropped and the page goes back to the chosen template.
    fireEvent.keyDown(other!, { key: "Escape" });
    expect(onPreview).toHaveBeenLastCalledWith(null);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("never previews a template this run cannot be cut with", () => {
    const onPreview = vi.fn();

    render(
      <TemplateSelect
        template="minimal-numbers"
        // A treadmill run: it has a distance and a time and nothing else, so
        // everything that needs a route is out.
        input={{
          activity: {
            id: 1,
            name: "Treadmill",
            distance: 5000,
            moving_time: 1500,
            total_elevation_gain: 0,
            sport_type: "Run",
            start_date_local: "2026-08-05T18:30:00Z",
            average_speed: 3.33,
            average_heartrate: null,
            max_heartrate: null,
            workout_type: "",
          },
          streams: {},
        }}
        onChange={vi.fn()}
        onPreview={onPreview}
      />,
    );

    const disabled = open().filter(
      (option) => option.getAttribute("data-disabled") !== null,
    );
    // Without this the loop below could pass by finding nothing to try.
    expect(disabled.length).toBeGreaterThan(0);

    // The pointer can't reach a disabled row, but the keyboard deliberately
    // can — Base UI keeps them navigable so the reason can be read out.
    for (const option of disabled) fireEvent.focus(option);
    expect(onPreview).not.toHaveBeenCalled();
  });
});
