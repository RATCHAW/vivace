import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { Hint } from "./hint";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

/**
 * The shape the coach header uses: one button that is both the tooltip's
 * anchor and the sheet's trigger. Two Base UI components rendering into the
 * same element is the part worth a test — a hint that ate the tap would leave
 * a phone with no way into the rail at all.
 */
function header(show: boolean) {
  return (
    <Sheet>
      <Hint content="Set your goal race in here" life={3000} show={show}>
        <SheetTrigger render={<Button aria-label="Goals" />}>★</SheetTrigger>
      </Hint>
      <SheetContent side="right">
        <SheetHeader>
          <SheetTitle>Goals</SheetTitle>
        </SheetHeader>
        <SheetBody>Goal race</SheetBody>
      </SheetContent>
    </Sheet>
  );
}

function hint() {
  return screen.queryByText("Set your goal race in here");
}

function tick(ms: number) {
  return act(async () => {
    vi.advanceTimersByTime(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("Hint", () => {
  it("keeps the sentence up for the life it was given", async () => {
    render(header(true));
    expect(hint()).toBeNull();

    await tick(500);
    expect(hint()).not.toBeNull();

    // Still there a second before the three are up, gone after them.
    await tick(2000);
    expect(hint()).not.toBeNull();

    await tick(1000);
    expect(hint()).toBeNull();
  });

  it("leaves the trigger's own job alone", async () => {
    render(header(true));
    await tick(500);
    expect(hint()).not.toBeNull();

    // The tap the athlete came for: it opens the sheet rather than being spent
    // dismissing the tooltip sitting on the same element.
    fireEvent.click(screen.getByRole("button", { name: "Goals" }));
    await act(async () => {});
    expect(screen.getByText("Goal race")).toBeDefined();
  });
});
