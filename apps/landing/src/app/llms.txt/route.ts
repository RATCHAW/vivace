/**
 * `/llms.txt` — the index an agent reads before deciding whether Vivace is the
 * tool for what it was asked to do. See `lib/llms.ts` for the format.
 *
 * `text/plain`, which is what llmstxt.org itself serves and what the `.txt`
 * extension promises. The body is Markdown; the media type is not the place to
 * say so.
 */
import { llmsTxt } from "@/lib/llms";

export const dynamic = "force-static";

export function GET(): Response {
  return new Response(llmsTxt(), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=0, must-revalidate",
    },
  });
}
