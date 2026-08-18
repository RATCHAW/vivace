import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { formatKm } from "../../core/format";
import { asPartner, FIXTURE_A, FIXTURE_A_PARTNER } from "../../fixtures";
import { getTemplate } from "../../registry";
import {
  duoClock,
  duoFrame,
  duoOutro,
  duoRunners,
  DUO_DRAW_FROM,
  DUO_DRAW_TO,
  DUO_OUTRO_FROM,
  type RunnerFrame,
} from "./duo";
import { DuoOutroCards } from "./outro";
import { DuoOverlay } from "./overlay";

/* What the last three seconds of the film actually put on screen.
 *
 * `duo.test.ts` has the move's maths; this is the half that only shows up once
 * it has been drawn — that the two layouts hand over to each other rather than
 * both being up at once, and that a runner with no picture still gets a face. */

const { fps, durationInFrames } = getTemplate("duo-replay");
const DRAW_FRAMES =
  Math.round(DUO_DRAW_TO * durationInFrames) -
  Math.round(DUO_DRAW_FROM * durationInFrames);

const runners = duoRunners(
  FIXTURE_A.activity,
  FIXTURE_A.streams,
  "",
  asPartner(FIXTURE_A_PARTNER, "Marianne"),
  "Ayoub",
);

/** Both runners at the end of their runs, which is where the card opens. */
const finished: RunnerFrame[] = duoFrame(
  runners,
  duoClock(runners),
  1,
  fps,
  DRAW_FRAMES,
);

const cards = (t: number) => (
  <DuoOutroCards frames={finished} plan={duoOutro(t)} />
);

const overlay = (t: number) => (
  <DuoOverlay
    activity={FIXTURE_A.activity}
    frames={finished}
    opacity={1}
    outro={duoOutro(t)}
  />
);

/** The layers a component put straight into its `<AbsoluteFill>` — the cards,
 *  the faces, the rows. Their own styles are the animation. */
const layers = (container: HTMLElement) =>
  [...(container.firstElementChild?.children ?? [])] as HTMLElement[];

// Nothing auto-cleans here: the config has no `globals`, so a left-over tree
// would answer the next test's queries.
afterEach(cleanup);

describe("the closing card, drawn", () => {
  it("gives a runner with no picture a face anyway", () => {
    // An athlete who never set a Strava photo, one who left the avatar option
    // off and one whose CDN dropped the request all land here, and a card with
    // a hole where a person should be is the worst of the three.
    render(cards(1));
    expect(screen.getByText("A")).toBeDefined();
    expect(screen.getByText("M")).toBeDefined();
  });

  it("closes on each runner's own totals", () => {
    render(cards(1));
    expect(
      screen.getByText(formatKm(FIXTURE_A.activity.distance)),
    ).toBeDefined();
    expect(
      screen.getByText(formatKm(FIXTURE_A_PARTNER.activity.distance)),
    ).toBeDefined();
  });

  it("draws nothing until the move begins", () => {
    // It is mounted for the whole film all the same: the faces are images that
    // hold a frame until they load, and holding one at second twelve of a
    // headless render is how a Lambda invocation times out.
    const { container } = render(cards(DUO_OUTRO_FROM));
    expect(layers(container)).toHaveLength(4);
    for (const layer of layers(container)) {
      expect(Number(layer.style.opacity)).toBeCloseTo(0, 6);
    }
  });

  it("takes the running row's numbers away before the card lands", () => {
    // Both layouts carry the same three numbers. Two sets of them dissolving
    // through each other at two sizes is the one way this move reads as a bug.
    const { container } = render(overlay(1));
    const numbers = layers(container).filter(
      (layer) => layer.style.justifyContent === "flex-end",
    );
    expect(numbers).toHaveLength(2);
    for (const layer of numbers) expect(layer.style.opacity).toBe("0");
  });

  it("leaves the running layout exactly where it was until then", () => {
    const { container } = render(overlay(DUO_DRAW_TO));
    const numbers = layers(container).filter(
      (layer) => layer.style.justifyContent === "flex-end",
    );
    expect(numbers).toHaveLength(2);
    for (const layer of numbers) {
      expect(layer.style.opacity).toBe("1");
      expect(layer.style.transform).toBe("translateY(0px)");
    }
  });
});
