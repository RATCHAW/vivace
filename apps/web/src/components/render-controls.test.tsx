import { afterEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  render as renderComponent,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { Run, RunRenderState } from "@/api";
import { RenderControls } from "./render-controls";

const mocks = vi.hoisted(() => ({
  start: vi.fn(),
  subscribe: vi.fn(() => vi.fn()),
  trackEvent: vi.fn(),
}));

const renderKey = (template = "run-video") => ["run-render", "7", template];

vi.mock("@/api", () => ({
  getRunRenderQueryKey: ({ query }: { query: { template: string } }) =>
    renderKey(query.template),
  getRunRenderOptions: ({ query }: { query: { template: string } }) => ({
    queryKey: renderKey(query.template),
    queryFn: async () => ({ render: null }),
  }),
  startRunRenderMutation: () => ({ mutationFn: mocks.start }),
  subscribeRunRenderProgress: mocks.subscribe,
}));

vi.mock("@/lib/logger", () => ({ trackEvent: mocks.trackEvent }));
vi.mock("@/lib/posthog", () => ({ useFeatureFlag: () => true }));

const RUN = { id: 7 } as Run;

function rendering(progress = 0.42): RunRenderState {
  return {
    render: {
      activity_id: 7,
      template: "run-video",
      status: "rendering",
      show_avatar: false,
      theme: "charcoal",
      greenscreen: false,
      progress,
      output_url: null,
      error: null,
      created_at: "2026-08-15T20:00:00.000Z",
      updated_at: "2026-08-15T20:01:00.000Z",
    },
  };
}

function done(): RunRenderState {
  return {
    render: {
      ...rendering(1).render!,
      status: "done",
      progress: 1,
      output_url: "https://video.test/run.mp4",
      updated_at: "2026-08-15T20:02:00.000Z",
    },
  };
}

function renderControls(
  initial: RunRenderState,
  blocked: string | null = null,
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  client.setQueryData(renderKey(), initial);

  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  renderComponent(
    <div className="relative grid grid-cols-4">
      <RenderControls
        run={RUN}
        template="run-video"
        showAvatar={false}
        theme="charcoal"
        greenscreen={false}
        layout="tile"
        blocked={blocked}
      />
    </div>,
    { wrapper: Wrapper },
  );
  return client;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  mocks.start.mockReset();
  mocks.subscribe.mockClear();
  mocks.trackEvent.mockClear();
});

describe("mobile render controls", () => {
  it("shows both the percentage and a full-rail progress track", () => {
    renderControls(rendering());

    expect(
      screen.getByRole("button", { name: "Preparing your video… 42%" }),
    ).toBeDefined();
    expect(screen.getByText("42%")).toBeDefined();
    expect(
      document.querySelector('[data-slot="render-progress"]'),
    ).toBeDefined();
  });

  it("downloads once as soon as an observed render finishes", async () => {
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});
    const client = renderControls(rendering());

    await act(async () => {
      client.setQueryData(renderKey(), done());
    });

    await waitFor(() => expect(click).toHaveBeenCalledOnce());
    expect(mocks.trackEvent).toHaveBeenCalledWith("ui.video_downloaded", {
      activityId: 7,
      automatic: true,
    });

    await act(async () => {
      client.setQueryData(renderKey(), done());
    });
    expect(click).toHaveBeenCalledOnce();
  });

  it("stops a render the film cannot serve, and says which piece is missing", () => {
    // The duo cut with nobody in the other lane: the API answers that request
    // with a 409, so the tile carries the reason as its only word rather than
    // spending a Lambda invocation to come back with the same sentence.
    renderControls({ render: null }, "Needs someone you ran with to accept");

    const button = screen.getByRole<HTMLButtonElement>("button", {
      name: "Needs someone you ran with to accept",
    });
    expect(button.disabled).toBe(true);

    cleanup();

    // A film already on disk is still theirs, whatever the current cut is
    // missing — the block is on starting something new.
    renderControls(done(), "Needs someone you ran with to accept");
    expect(
      screen.getByRole("button", { name: "Download video" }),
    ).toBeDefined();
  });

  it("does not download a video that was already finished on arrival", () => {
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});

    renderControls(done());

    expect(click).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Download video" }),
    ).toBeDefined();
  });
});
