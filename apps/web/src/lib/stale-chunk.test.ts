import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { flushClientLogs, trackEvent } from "@/lib/logger";
import { installStaleChunkReload } from "@/lib/stale-chunk";

// The real logger would try to POST the batch; what it was asked to record is
// the part that matters here.
vi.mock("@/lib/logger", () => ({
  trackEvent: vi.fn(),
  flushClientLogs: vi.fn(),
}));

const reload = vi.fn();

/** jsdom proxies `Storage`, so a spy on its methods doesn't take — swap the
 * whole object, and put the real one back before the next test. */
const realStorage = window.sessionStorage;

function setSessionStorage(value: Storage): void {
  Object.defineProperty(window, "sessionStorage", {
    configurable: true,
    value,
  });
}

/** What Vite dispatches when a dynamic import can't be fetched. */
function dispatchPreloadError(): Event {
  const event = new Event("vite:preloadError", { cancelable: true });
  window.dispatchEvent(event);
  return event;
}

beforeAll(() => {
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { pathname: "/runs", reload },
  });
  // Installed once, as in main.tsx — a second listener would answer every
  // event twice and the guard would race itself.
  installStaleChunkReload();
});

beforeEach(() => {
  vi.clearAllMocks();
  setSessionStorage(realStorage);
  window.sessionStorage.clear();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-14T21:38:49Z"));
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("stale chunk reload", () => {
  it("reloads the tab when a chunk from the previous deploy is gone", () => {
    const event = dispatchPreloadError();

    expect(reload).toHaveBeenCalledOnce();
    // Suppressed, so the spinner stays up rather than the crash screen
    // flashing in the moment before the document goes away.
    expect(event.defaultPrevented).toBe(true);
    expect(trackEvent).toHaveBeenCalledWith("ui.stale_chunk_reload", {
      path: "/runs",
    });
    // The queue dies with the page unless it leaves as a beacon.
    expect(flushClientLogs).toHaveBeenCalledWith({ beacon: true });
  });

  it("leaves a second failure to the error boundary rather than looping", () => {
    dispatchPreloadError();
    const second = dispatchPreloadError();

    expect(reload).toHaveBeenCalledOnce();
    // Not suppressed: a chunk still missing after a reload is missing from the
    // current deploy, which is a crash worth seeing in Grafana.
    expect(second.defaultPrevented).toBe(false);
  });

  it("recovers again for a later deploy in the same session", () => {
    dispatchPreloadError();
    vi.setSystemTime(new Date("2026-08-14T22:38:49Z"));

    expect(dispatchPreloadError().defaultPrevented).toBe(true);
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it("does not reload when storage can't hold the guard", () => {
    const blocked = () => {
      throw new Error("storage blocked");
    };
    setSessionStorage({
      getItem: blocked,
      setItem: blocked,
    } as unknown as Storage);

    const event = dispatchPreloadError();

    expect(reload).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });
});
