/**
 * `/llms-full.txt` — every page, in both languages, as one document.
 *
 * The convention beside `llms.txt`: the index says what exists, this says all
 * of it, so an agent that has decided Vivace is relevant can read the whole
 * site in a single request instead of crawling twelve URLs.
 */
import { fullMarkdown } from "@/lib/markdown";

export const dynamic = "force-static";

export function GET(): Response {
  return new Response(fullMarkdown(), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=0, must-revalidate",
    },
  });
}
