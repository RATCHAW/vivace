import { afterEach, describe, expect, it, vi } from "vitest";
import { client } from "@/api";
import { flushClientLogs, trackError, trackEvent } from "@/lib/logger";

/** Stands in for POST /api/logs, so the generated SDK is exercised for real. */
function mockFetch() {
  const fetchMock = vi.fn(
    async (_request: Request) =>
      new Response(JSON.stringify({ accepted: 1 }), {
        status: 202,
        headers: { "Content-Type": "application/json" },
      }),
  );
  client.setConfig({
    // The app's "/" base URL relies on a document to resolve against; Node's
    // Request constructor wants an absolute one.
    baseUrl: "http://api.test",
    fetch: fetchMock as unknown as typeof fetch,
  });
  return fetchMock;
}

/** The batch the last request carried. */
async function sentEvents(fetchMock: ReturnType<typeof mockFetch>) {
  const request = fetchMock.mock.calls.at(-1)![0];
  const body = (await request.json()) as { events: unknown[] };
  return body.events;
}

afterEach(() => {
  // The queue is module state — don't leak a pending event into the next test.
  flushClientLogs();
  vi.restoreAllMocks();
});

describe("client logger", () => {
  it("batches user actions and posts them to /api/logs", async () => {
    const fetchMock = mockFetch();

    trackEvent("ui.render_clicked", { activityId: 7 });
    trackEvent("ui.video_downloaded", { activityId: 7 });
    // Nothing goes out until the batch is flushed.
    expect(fetchMock).not.toHaveBeenCalled();

    flushClientLogs();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());

    const request = fetchMock.mock.calls[0][0];
    expect(request.method).toBe("POST");
    expect(new URL(request.url).pathname).toBe("/api/logs");
    expect(await sentEvents(fetchMock)).toEqual([
      {
        level: "info",
        event: "ui.render_clicked",
        path: "/",
        ts: expect.any(String),
        context: { activityId: 7 },
      },
      {
        level: "info",
        event: "ui.video_downloaded",
        path: "/",
        ts: expect.any(String),
        context: { activityId: 7 },
      },
    ]);
  });

  it("sends an error straight away, with its name and stack", async () => {
    const fetchMock = mockFetch();

    trackError("ui.render_crashed", new TypeError("nope"), { activityId: 7 });

    // No flush call: an error is the reason someone opens Grafana.
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const [event] = (await sentEvents(fetchMock)) as [
      { level: string; message: string; context: Record<string, string> },
    ];
    expect(event.level).toBe("error");
    expect(event.message).toBe("nope");
    expect(event.context.name).toBe("TypeError");
    expect(event.context.stack).toContain("TypeError: nope");
  });

  it("survives a thrower that isn't an Error", async () => {
    const fetchMock = mockFetch();

    trackError("browser.unhandled_rejection", "just a string");

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const [event] = (await sentEvents(fetchMock)) as [{ message: string }];
    expect(event.message).toBe("just a string");
  });

  it("uses sendBeacon for the flush that races page unload", async () => {
    const fetchMock = mockFetch();
    const sendBeacon = vi.fn((_url: string, _body?: BodyInit) => true);
    vi.stubGlobal("navigator", { ...navigator, sendBeacon });

    trackEvent("ui.page_view");
    flushClientLogs({ beacon: true });

    expect(sendBeacon).toHaveBeenCalledOnce();
    expect(sendBeacon.mock.calls[0][0]).toBe("/api/logs");
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("never posts an empty batch", () => {
    const fetchMock = mockFetch();
    flushClientLogs();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
