import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { VivaceMark as VideoMark } from "@repo/video/compositions";
import { VivaceMark } from "@/components/vivace-mark";
import { VivaceMark as LandingMark } from "../../../landing/src/components/vivace-mark";

/** The single `<path>` a copy of the mark draws. */
function pathOf(element: React.ReactElement): string {
  const { container } = render(element);
  const path = container.querySelector("path")?.getAttribute("d");
  expect(path).toBeTruthy();
  return path as string;
}

describe("the Vivace mark", () => {
  it("draws the same glyph in the app, landing page and video", () => {
    // `@repo/video` carries its own copy because it is bundled by Remotion and
    // rendered headlessly on Lambda, where nothing from apps/web exists — the
    // same copy-in rule apps/landing follows. This is what stops the two from
    // drifting: a watermark that isn't the wordmark is a bug nobody sees until
    // it is in somebody else's feed.
    const appMark = pathOf(<VivaceMark />);
    expect(pathOf(<LandingMark />)).toBe(appMark);
    expect(pathOf(<VideoMark />)).toBe(appMark);
  });
});
