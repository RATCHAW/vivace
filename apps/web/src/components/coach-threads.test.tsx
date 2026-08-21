import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import {
  cleanup,
  fireEvent,
  render as renderComponent,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
// Type-only, so it survives the module mock below.
import type { CoachThread } from "@/api";
import { CoachThreads, compareThreads, reorderPinned } from "./coach-threads";

const mocks = vi.hoisted(() => ({
  list: vi.fn(async (): Promise<CoachThread[]> => []),
  create: vi.fn(),
  remove: vi.fn(),
  update: vi.fn(),
  disposeCoachChat: vi.fn(),
}));

vi.mock("@/api", () => ({
  listCoachThreadsOptions: () => ({
    queryKey: ["coach-threads"],
    queryFn: mocks.list,
  }),
  listCoachThreadsQueryKey: () => ["coach-threads"],
  createCoachThreadMutation: () => ({ mutationFn: mocks.create }),
  deleteCoachThreadMutation: () => ({ mutationFn: mocks.remove }),
  updateCoachThreadMutation: () => ({ mutationFn: mocks.update }),
}));

vi.mock("@/lib/coach-chats", () => ({
  disposeCoachChat: mocks.disposeCoachChat,
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function thread(
  id: string,
  updated: string,
  pinned: string | null = null,
): CoachThread {
  return {
    id,
    title: id,
    pinned_at: pinned,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: updated,
  };
}

/** Ids only: the order is the whole assertion. */
function order(threads: CoachThread[]): string[] {
  return threads.map((t) => t.id);
}

describe("compareThreads", () => {
  it("puts every pinned conversation above every unpinned one", () => {
    // `b` is the one used most recently, and still sorts under the pin.
    const list = [
      thread("a", "2026-08-01T10:00:00.000Z", "2026-07-01T10:00:00.000Z"),
      thread("b", "2026-08-20T10:00:00.000Z"),
    ];
    expect(order([...list].sort(compareThreads))).toEqual(["a", "b"]);
  });

  it("orders pins by when they were pinned, not by when they were used", () => {
    const list = [
      // Pinned first, but used yesterday.
      thread("old", "2026-08-20T10:00:00.000Z", "2026-07-01T10:00:00.000Z"),
      // Pinned this morning, untouched since June.
      thread("new", "2026-06-01T10:00:00.000Z", "2026-08-21T09:00:00.000Z"),
    ];
    expect(order([...list].sort(compareThreads))).toEqual(["new", "old"]);
  });

  it("falls back to most recently used for the rest", () => {
    const list = [
      thread("older", "2026-08-01T10:00:00.000Z"),
      thread("newer", "2026-08-20T10:00:00.000Z"),
    ];
    expect(order([...list].sort(compareThreads))).toEqual(["newer", "older"]);
  });
});

describe("reorderPinned", () => {
  const list = [
    thread("c", "2026-08-20T10:00:00.000Z"),
    thread("b", "2026-08-10T10:00:00.000Z"),
    thread("a", "2026-08-01T10:00:00.000Z"),
  ];

  it("lifts the pinned conversation to the top", () => {
    const next = reorderPinned(list, "a", true, "2026-08-21T09:00:00.000Z");
    expect(order(next)).toEqual(["a", "c", "b"]);
    expect(next[0].pinned_at).toBe("2026-08-21T09:00:00.000Z");
  });

  it("drops an unpinned conversation back among the rest", () => {
    const pinned = reorderPinned(list, "a", true, "2026-08-21T09:00:00.000Z");
    const next = reorderPinned(pinned, "a", false, "2026-08-21T09:01:00.000Z");
    expect(order(next)).toEqual(["c", "b", "a"]);
    expect(next[2].pinned_at).toBeNull();
  });

  it("re-stamping a pin moves it above the pins made before it", () => {
    const first = reorderPinned(list, "a", true, "2026-08-21T09:00:00.000Z");
    const second = reorderPinned(first, "b", true, "2026-08-21T09:01:00.000Z");
    expect(order(second)).toEqual(["b", "a", "c"]);

    const again = reorderPinned(second, "a", true, "2026-08-21T09:02:00.000Z");
    expect(order(again)).toEqual(["a", "b", "c"]);
  });

  it("leaves the list alone when the id isn't in it", () => {
    const next = reorderPinned(list, "gone", true, "2026-08-21T09:00:00.000Z");
    expect(order(next)).toEqual(["c", "b", "a"]);
  });

  it("does not mutate the list it was given", () => {
    reorderPinned(list, "a", true, "2026-08-21T09:00:00.000Z");
    expect(order(list)).toEqual(["c", "b", "a"]);
    expect(list[2].pinned_at).toBeNull();
  });
});

async function renderList(threads: CoachThread[], inSheet = false) {
  mocks.list.mockResolvedValue(threads);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const view = renderComponent(
    <CoachThreads inSheet={inSheet} onSelect={() => {}} selectedId={null} />,
    { wrapper: Wrapper },
  );
  await waitFor(() =>
    expect(screen.getAllByRole("listitem").length).toBe(threads.length),
  );
  return view;
}

/** The same list as the sheet draws it, where the actions live behind a `⋯`. */
const renderSheet = (threads: CoachThread[]) => renderList(threads, true);

/** The conversations on screen, top to bottom. */
function onScreen(): (string | null)[] {
  return screen
    .getAllByRole("listitem")
    .map((item) => item.querySelector("span")?.textContent ?? null);
}

/** Opens one row's `⋯`. Base UI's trigger comes up on the pointer, not the click. */
async function openMenu(title: string) {
  const trigger = screen.getByRole("button", { name: `Options for ${title}` });
  fireEvent.pointerDown(trigger, { button: 0 });
  fireEvent.click(trigger);
  return screen.findByRole("menu");
}

describe("CoachThreads", () => {
  it("names the two groups only once something is pinned", async () => {
    await renderList([
      thread("solo", "2026-08-20T10:00:00.000Z"),
      thread("other", "2026-08-10T10:00:00.000Z"),
    ]);
    expect(screen.queryByText("Pinned")).toBeNull();
    expect(screen.queryByText("Recent")).toBeNull();
  });

  it("draws the pinned group above the rest, and says which is which", async () => {
    await renderList([
      thread("kept", "2026-06-01T10:00:00.000Z", "2026-08-21T09:00:00.000Z"),
      thread("newest", "2026-08-20T10:00:00.000Z"),
    ]);

    expect(screen.getByText("Pinned")).toBeTruthy();
    expect(screen.getByText("Recent")).toBeTruthy();
    // The pin holds the older conversation above the one used yesterday.
    expect(onScreen()).toEqual(["kept", "newest"]);
  });

  it("keeps the column's two icons, named after the row they act on", async () => {
    await renderList([
      thread("kept", "2026-06-01T10:00:00.000Z", "2026-08-21T09:00:00.000Z"),
      thread("loose", "2026-08-20T10:00:00.000Z"),
    ]);

    const unpin = screen.getByRole("button", { name: "Unpin kept" });
    expect(unpin.getAttribute("aria-pressed")).toBe("true");
    expect(
      screen
        .getByRole("button", { name: "Pin loose" })
        .getAttribute("aria-pressed"),
    ).toBe("false");
    expect(screen.getByRole("button", { name: "Delete kept" })).toBeTruthy();
    // And no menu: the column reveals its actions on hover.
    expect(screen.queryByRole("button", { name: /^Options for/ })).toBeNull();
  });

  it("pins from the column in one click", async () => {
    mocks.update.mockReturnValue(new Promise(() => {}));
    await renderList([
      thread("c", "2026-08-20T10:00:00.000Z"),
      thread("a", "2026-08-01T10:00:00.000Z"),
    ]);

    fireEvent.click(screen.getByRole("button", { name: "Pin a" }));

    await waitFor(() => expect(onScreen()).toEqual(["a", "c"]));
    expect(mocks.update.mock.calls[0][0]).toEqual({
      path: { id: "a" },
      body: { pinned: true },
    });
  });

  it("gives the sheet a trigger per row, because a phone has no hover", async () => {
    await renderSheet([
      thread("kept", "2026-06-01T10:00:00.000Z", "2026-08-21T09:00:00.000Z"),
      thread("loose", "2026-08-20T10:00:00.000Z"),
    ]);

    expect(
      screen.getByRole("button", { name: "Options for kept" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Options for loose" }),
    ).toBeTruthy();
    // And none of the column's icons, which nothing there could reveal.
    expect(screen.queryByRole("button", { name: "Unpin kept" })).toBeNull();
  });

  it("offers to unpin what is held, and says so to a screen reader", async () => {
    await renderSheet([
      thread("kept", "2026-06-01T10:00:00.000Z", "2026-08-21T09:00:00.000Z"),
      thread("loose", "2026-08-20T10:00:00.000Z"),
    ]);

    const menu = await openMenu("kept");
    const unpin = within(menu).getByRole("menuitemcheckbox", {
      name: "Unpin",
    });
    // The checked state is what tells a screen reader the row is pinned — the
    // group heading beside it is `aria-hidden` precisely because of this.
    expect(unpin.getAttribute("aria-checked")).toBe("true");
    expect(within(menu).getByRole("menuitem", { name: "Delete" })).toBeTruthy();
  });

  it("offers to pin what is loose", async () => {
    await renderSheet([
      thread("kept", "2026-06-01T10:00:00.000Z", "2026-08-21T09:00:00.000Z"),
      thread("loose", "2026-08-20T10:00:00.000Z"),
    ]);

    const menu = await openMenu("loose");
    const pin = within(menu).getByRole("menuitemcheckbox", { name: "Pin" });
    expect(pin.getAttribute("aria-checked")).toBe("false");
  });

  it("moves the row before the request has answered", async () => {
    // Never resolves: the reorder on screen is the optimistic one, not a
    // refetch that happened to land first.
    mocks.update.mockReturnValue(new Promise(() => {}));
    await renderSheet([
      thread("c", "2026-08-20T10:00:00.000Z"),
      thread("b", "2026-08-10T10:00:00.000Z"),
      thread("a", "2026-08-01T10:00:00.000Z"),
    ]);
    expect(onScreen()).toEqual(["c", "b", "a"]);

    const menu = await openMenu("a");
    fireEvent.click(
      within(menu).getByRole("menuitemcheckbox", { name: "Pin" }),
    );

    await waitFor(() => expect(onScreen()).toEqual(["a", "c", "b"]));
    // The variables only; React Query hands the mutation a second argument.
    expect(mocks.update.mock.calls[0][0]).toEqual({
      path: { id: "a" },
      body: { pinned: true },
    });
    // And the group headings arrive with it.
    expect(screen.getByText("Pinned")).toBeTruthy();
  });

  it("puts the row back when the request fails", async () => {
    mocks.update.mockRejectedValue({ error: "Nope" });
    await renderSheet([
      thread("c", "2026-08-20T10:00:00.000Z"),
      thread("a", "2026-08-01T10:00:00.000Z"),
    ]);

    const menu = await openMenu("a");
    fireEvent.click(
      within(menu).getByRole("menuitemcheckbox", { name: "Pin" }),
    );

    await waitFor(() => expect(onScreen()).toEqual(["c", "a"]));
    expect(screen.queryByText("Pinned")).toBeNull();
  });

  it("asks before deleting, and names what it would delete", async () => {
    await renderList([thread("a", "2026-08-01T10:00:00.000Z")]);

    fireEvent.click(screen.getByRole("button", { name: "Delete a" }));

    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText("Delete this conversation?")).toBeTruthy();
    // The conversation is named, and so is the part that can't be undone.
    expect(
      within(dialog).getByText(/deletes a and every message/),
    ).toBeTruthy();
    // Asking is not doing.
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it("deletes nothing when the confirmation is cancelled", async () => {
    await renderList([thread("a", "2026-08-01T10:00:00.000Z")]);

    fireEvent.click(screen.getByRole("button", { name: "Delete a" }));
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it("deletes once confirmed", async () => {
    await renderList([thread("a", "2026-08-01T10:00:00.000Z")]);

    fireEvent.click(screen.getByRole("button", { name: "Delete a" }));
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));

    await waitFor(() =>
      expect(mocks.remove.mock.calls[0][0]).toEqual({ path: { id: "a" } }),
    );
  });

  it("asks the same question from the sheet's menu", async () => {
    await renderSheet([thread("a", "2026-08-01T10:00:00.000Z")]);

    const menu = await openMenu("a");
    fireEvent.click(within(menu).getByRole("menuitem", { name: "Delete" }));

    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText("Delete this conversation?")).toBeTruthy();
    expect(mocks.remove).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    await waitFor(() =>
      expect(mocks.remove.mock.calls[0][0]).toEqual({ path: { id: "a" } }),
    );
  });
});
