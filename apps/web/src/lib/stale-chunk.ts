// A deploy replaces every hashed file under /assets, so a tab that was open
// across one goes looking for a chunk that no longer exists. Only the lazy
// routes can hit it — everything already in the bundle is in memory — which is
// why it shows up as a render crash on /replays or /coach seconds after a release.
//
// Vite dispatches `vite:preloadError` for exactly this and reloading is what
// its docs recommend: `index.html` is served `must-revalidate`, so the reload
// fetches the new document and with it the new chunk names. There is no retry
// of the failed import — the file is gone rather than briefly unavailable, so
// a second request to the same URL can only fail again.
import { flushClientLogs, trackEvent } from "@/lib/logger";

/** When this tab last reloaded itself, so a bad deploy can't loop forever. */
const RELOAD_KEY = "vivace.stale_chunk_reload_at";

/**
 * Long enough that a reload landing on the same failure gives up and lets the
 * boundary show the crash screen, short enough that a second deploy an hour
 * later still recovers on its own.
 */
const RELOAD_DEBOUNCE_MS = 10_000;

let installed = false;

/**
 * `sessionStorage` throws rather than returning null when storage is blocked —
 * Safari's cross-site tracking prevention, a locked-down enterprise profile.
 * The guard is the only thing between a genuinely missing chunk and an endless
 * reload, so unreadable storage counts as "already reloaded": one crash screen
 * is recoverable, a reload loop is not.
 */
function reloadedRecently(): boolean {
  try {
    const at = window.sessionStorage.getItem(RELOAD_KEY);
    if (at === null) return false;
    return Date.now() - Number(at) < RELOAD_DEBOUNCE_MS;
  } catch {
    return true;
  }
}

/** False when the stamp couldn't be written, which means don't reload. */
function markReloaded(): boolean {
  try {
    window.sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
    return true;
  } catch {
    return false;
  }
}

/**
 * Recovers a tab left open across a deploy. Called once from main.tsx, and it
 * covers every dynamic import Vite builds rather than only the two lazy routes.
 */
export function installStaleChunkReload(): void {
  if (installed) return;
  installed = true;

  window.addEventListener("vite:preloadError", (event) => {
    // Both paths leave the error to propagate, so a chunk that is missing
    // rather than stale still reaches the boundary and Grafana.
    if (reloadedRecently() || !markReloaded()) return;

    // Stops Vite rethrowing, which would flash the crash screen over the
    // spinner in the moment before the document goes away.
    event.preventDefault();

    trackEvent("ui.stale_chunk_reload", { path: window.location.pathname });
    // The reload tears the queue down with the page; a beacon outlives it.
    flushClientLogs({ beacon: true });

    window.location.reload();
  });
}
