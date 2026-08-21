import { StrictMode } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { useReorderAnimation } from "./use-reorder-animation";

/** Every row is 60px tall, so a row's slot index is readable from its offset. */
const ROW_HEIGHT = 60;

const animate = vi.fn();
const cancel = vi.fn();

beforeAll(() => {
  // jsdom lays nothing out, so `offsetTop` is 0 for every element. The rows
  // carry the position the test wants them to have and the hook reads that.
  Object.defineProperty(HTMLElement.prototype, "offsetTop", {
    configurable: true,
    get(this: HTMLElement) {
      return Number(this.dataset.top ?? 0);
    },
  });
  // Neither of these exists in jsdom either; the hook checks for both before
  // it animates anything, which is what keeps a test run from needing them.
  HTMLElement.prototype.animate = animate as unknown as HTMLElement["animate"];
  HTMLElement.prototype.getAnimations = () =>
    [{ cancel }] as unknown as Animation[];
});

afterEach(() => {
  cleanup();
  animate.mockClear();
  cancel.mockClear();
});

function List({ order }: { order: string[] }) {
  const registerRow = useReorderAnimation();
  return (
    <ul>
      {order.map((id, index) => (
        <li
          data-testid={id}
          data-top={index * ROW_HEIGHT}
          key={id}
          ref={registerRow(id)}
        />
      ))}
    </ul>
  );
}

/**
 * Where each row was told to start from, keyed by row.
 *
 * A map rather than the list of calls, because the hook walks the rows in the
 * order they registered and not in the order they ended up in — which row
 * travels how far is the assertion; who was asked first is not.
 */
function travelled(): Record<string, string> {
  return Object.fromEntries(
    animate.mock.calls.map(([keyframes], index) => {
      const row = animate.mock.instances[index] as HTMLElement;
      const [from] = keyframes as [{ transform: string }];
      return [row.dataset.testid, from.transform];
    }),
  );
}

describe("useReorderAnimation", () => {
  it("does not animate rows on their first render", () => {
    render(<List order={["a", "b", "c"]} />);
    expect(animate).not.toHaveBeenCalled();
  });

  it("draws a moved row back where it was and animates it to where it is", () => {
    const { rerender } = render(<List order={["a", "b", "c"]} />);
    // `c` is pinned: it goes to the top, and the other two shift down one slot.
    rerender(<List order={["c", "a", "b"]} />);

    expect(travelled()).toEqual({
      // c was at 120 and is now at 0 — drawn 120px back down, then released.
      c: "translateY(120px)",
      // a and b were each pushed down a slot, so each starts 60px up.
      a: "translateY(-60px)",
      b: "translateY(-60px)",
    });
  });

  it("leaves a row that did not move alone", () => {
    const { rerender } = render(<List order={["a", "b", "c"]} />);
    // `c` unpinned back into a list of the same length: nothing moves.
    rerender(<List order={["a", "b", "c"]} />);
    expect(animate).not.toHaveBeenCalled();
  });

  it("animates only the rows a removal displaced", () => {
    const { rerender } = render(<List order={["a", "b", "c"]} />);
    rerender(<List order={["a", "c"]} />);
    // `a` held its slot; `c` came up one.
    expect(travelled()).toEqual({ c: "translateY(60px)" });
  });

  it("gives a row that arrives nothing to travel from", () => {
    const { rerender } = render(<List order={["a", "b"]} />);
    rerender(<List order={["new", "a", "b"]} />);
    // Two rows, not three: `new` has no previous position to come from, and a
    // and b each moved down one slot to make room for it.
    expect(travelled()).toEqual({
      a: "translateY(-60px)",
      b: "translateY(-60px)",
    });
  });

  it("keeps its hold on a row through StrictMode's second mount", () => {
    // StrictMode attaches every ref, detaches it and attaches it again. A row
    // whose registration didn't survive that would be treated as newly arrived
    // on the first reorder, so the first pin of a dev session wouldn't move.
    const { rerender } = render(
      <StrictMode>
        <List order={["a", "b", "c"]} />
      </StrictMode>,
    );
    rerender(
      <StrictMode>
        <List order={["c", "a", "b"]} />
      </StrictMode>,
    );

    expect(travelled()).toEqual({
      c: "translateY(120px)",
      a: "translateY(-60px)",
      b: "translateY(-60px)",
    });
  });

  it("clears the flight a row is already on before starting the next", () => {
    const { rerender } = render(<List order={["a", "b", "c"]} />);
    rerender(<List order={["c", "a", "b"]} />);
    expect(cancel).toHaveBeenCalledTimes(3);
  });

  it("reorders without travelling when motion is reduced", () => {
    vi.spyOn(window, "matchMedia").mockReturnValue({
      matches: true,
    } as MediaQueryList);

    const { rerender } = render(<List order={["a", "b", "c"]} />);
    rerender(<List order={["c", "a", "b"]} />);
    expect(animate).not.toHaveBeenCalled();

    vi.mocked(window.matchMedia).mockRestore();
  });
});
