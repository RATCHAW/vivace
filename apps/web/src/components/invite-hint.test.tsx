import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { InviteHint } from "./invite-hint";

const mocks = vi.hoisted(() => ({ trackEvent: vi.fn() }));

vi.mock("@/lib/logger", () => ({ trackEvent: mocks.trackEvent }));

function tile(show: boolean) {
  return (
    <InviteHint show={show} activityId={7}>
      <button type="button">Video options</button>
    </InviteHint>
  );
}

/** The callout, or null while it isn't up. Base UI portals it out of the row. */
function hint() {
  return screen.queryByText("Add who you ran with in here");
}

/** Timers only move inside `act`: the hint appears from one, and React has to
 *  be given the chance to paint what it set. */
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
  mocks.trackEvent.mockClear();
});

describe("InviteHint", () => {
  it("arrives after the screen has settled, and leaves on its own", async () => {
    render(tile(true));
    // Not in the same frame as the cut it is about.
    expect(hint()).toBeNull();

    await tick(500);
    expect(hint()).not.toBeNull();
    expect(mocks.trackEvent).toHaveBeenCalledWith("ui.invite_hint_shown", {
      activityId: 7,
    });

    await tick(6000);
    expect(hint()).toBeNull();
  });

  // The studio can open already on the duo cut with the partner answer in
  // cache, so `show` is true on the very first frame — the one StrictMode
  // rehearses. Nothing about the hint may depend on that pass being the only.
  it("arrives when it is asked for on the first frame", async () => {
    render(<StrictMode>{tile(true)}</StrictMode>);
    await tick(500);
    expect(hint()).not.toBeNull();
    expect(mocks.trackEvent).toHaveBeenCalledTimes(1);
  });

  it("says nothing when the lane is filled", async () => {
    render(tile(false));
    await tick(6000);
    expect(hint()).toBeNull();
  });

  it("goes the moment the sheet it points at opens", async () => {
    const { rerender } = render(tile(true));
    await tick(500);
    expect(hint()).not.toBeNull();

    // What the studio hands over when the athlete taps the tile.
    rerender(tile(false));
    await act(async () => {});
    expect(hint()).toBeNull();
  });

  it("does not come back when the athlete returns to the duo cut", async () => {
    const { rerender } = render(tile(true));
    await tick(500);
    expect(hint()).not.toBeNull();
    await tick(6000);
    expect(hint()).toBeNull();

    rerender(tile(false));
    await tick(100);
    rerender(tile(true));
    await tick(6000);

    expect(hint()).toBeNull();
    expect(mocks.trackEvent).toHaveBeenCalledTimes(1);
  });
});
