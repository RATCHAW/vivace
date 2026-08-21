/**
 * Which representation a client asked for — HTML for a browser, Markdown for
 * an agent — decided from the `Accept` header alone.
 *
 * The rules are RFC 9110 §12.5.1, and the two that are easy to get wrong are
 * the ones this file exists for:
 *
 * - **A more specific range wins over a less specific one regardless of `q`.**
 *   `text/html;q=0` beside a `q=1` wildcard refuses HTML; ranking by quality
 *   alone would hand it back anyway.
 * - **`q=0` is a refusal, not a low preference.** A client that refuses every
 *   type we produce gets a 406, which is the whole point of `Accept` — the
 *   fourth of acceptmarkdown.com's compliance checks, alongside serving
 *   Markdown, `Vary: Accept`, and honouring quality values.
 *
 * Pure and framework-free, so `proxy.ts` can import it and the table of cases
 * below can be tested without standing up a request.
 */
export const HTML_TYPE = "text/html";
export const MARKDOWN_TYPE = "text/markdown";

/**
 * What this site can return, in the order it prefers when a client expresses
 * no preference between them. HTML first: a bare wildcard `Accept` is a browser,
 * a link checker or a crawler with no opinion, and a page is the safe answer.
 */
export const PRODUCES = [HTML_TYPE, MARKDOWN_TYPE] as const;

export type MediaType = (typeof PRODUCES)[number];

interface AcceptEntry {
  type: string;
  q: number;
  /** A wildcard ranks below `text/*`, which ranks below `text/html`. */
  specificity: number;
}

function parseAccept(header: string): AcceptEntry[] {
  return header.split(",").map((raw) => {
    const parts = raw
      .trim()
      .split(";")
      .map((part) => part.trim());
    const type = parts[0].toLowerCase();
    let q = 1;
    for (const param of parts.slice(1)) {
      const [name, value] = param.split("=").map((part) => part.trim());
      if (name?.toLowerCase() === "q") {
        const parsed = Number(value);
        // An unparseable `q` is not a refusal — fall back to full weight.
        if (!Number.isNaN(parsed)) q = Math.max(0, Math.min(1, parsed));
      }
    }
    const specificity = type === "*/*" ? 0 : type.endsWith("/*") ? 1 : 2;
    return { type, q, specificity };
  });
}

function matches(entry: AcceptEntry, candidate: string): boolean {
  if (entry.type === "*/*") return true;
  if (entry.type.endsWith("/*")) {
    return candidate.startsWith(entry.type.slice(0, -1));
  }
  return entry.type === candidate;
}

/**
 * The type to serve, or `null` when the client refuses everything we produce —
 * which is a 406, not a reason to serve HTML anyway.
 *
 * A missing header means no preference, so it takes the first thing we
 * produce. An empty one is a header nonetheless, and answers nothing.
 */
export function preferredMediaType(
  header: string | null | undefined,
): MediaType | null {
  if (header == null) return PRODUCES[0];
  const entries = parseAccept(header).filter((entry) => entry.type !== "");
  if (entries.length === 0) return PRODUCES[0];

  let best: MediaType | null = null;
  let bestQuality = -1;
  let bestPosition = Infinity;

  for (const candidate of PRODUCES) {
    // The most specific range that covers this candidate decides its fate,
    // whatever the others say.
    let matched: AcceptEntry | undefined;
    let matchedPosition = Infinity;
    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index];
      if (!matches(entry, candidate)) continue;
      if (
        matched === undefined ||
        entry.specificity > matched.specificity ||
        (entry.specificity === matched.specificity && index < matchedPosition)
      ) {
        matched = entry;
        matchedPosition = index;
      }
    }
    if (matched === undefined || matched.q <= 0) continue;

    // Between candidates, quality decides; a tie goes to whichever the client
    // named first, so `Accept: text/markdown, text/html` picks Markdown.
    if (
      matched.q > bestQuality ||
      (matched.q === bestQuality && matchedPosition < bestPosition)
    ) {
      bestQuality = matched.q;
      bestPosition = matchedPosition;
      best = candidate;
    }
  }

  return best;
}

/**
 * Add `Accept` to whatever `Vary` already says, without dropping it.
 *
 * Next puts its own router headers in `Vary` on every response, and replacing
 * that list would make a CDN serve a prefetch payload to a full navigation.
 * Appending is also the reason this is a function: a CDN that has cached the
 * HTML variant must not hand it to an agent that asked for Markdown.
 */
export function appendVaryAccept(headers: Headers): void {
  const existing = headers.get("Vary");
  if (!existing) {
    headers.set("Vary", "Accept");
    return;
  }
  const tokens = existing.split(",").map((token) => token.trim().toLowerCase());
  if (tokens.includes("accept") || tokens.includes("*")) return;
  headers.set("Vary", `${existing}, Accept`);
}
