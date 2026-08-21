/**
 * The Markdown representation of every page.
 *
 * Nothing links here. `proxy.ts` rewrites to it — either because the client
 * asked for `text/markdown`, or because it fetched a `.md` sibling URL — so
 * the address bar keeps saying `/en/about` while the body is Markdown. That is
 * what content negotiation means, and it is why the alternative (a parallel
 * `/md/...` tree) would have been wrong: an agent and a browser must be able
 * to cite the same URL.
 *
 * Under `app/api/` because `proxy.ts` deliberately does not run on that
 * prefix; a rewrite that re-entered the proxy would loop.
 */
import { DEFAULT_LOCALE, isLocale, LOCALES } from "@/i18n/config";
import { notFoundMarkdown, pageMarkdown } from "@/lib/markdown";
import { pagePaths, resolvePage, SITE_PAGES } from "@/lib/pages";

/**
 * The twelve real documents are rendered at build time; an unknown path falls
 * through to a 404 rendered on demand, which is the only thing here that can
 * ever be dynamic.
 */
export function generateStaticParams(): { slug: string[] }[] {
  return LOCALES.flatMap((locale) =>
    SITE_PAGES.map((page) => ({
      slug: pagePaths(page)[locale].split("/").filter(Boolean),
    })),
  );
}

function markdownResponse(body: string, status: number): Response {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      // The reason this header matters is a CDN, not a client: without it the
      // HTML variant cached for a browser would be handed to the next agent
      // that asked for Markdown, or the other way round.
      Vary: "Accept",
      "Cache-Control": "public, max-age=0, must-revalidate",
    },
  });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug?: string[] }> },
): Promise<Response> {
  const { slug = [] } = await params;
  const [first, ...rest] = slug;

  // The proxy always prefixes a locale, so a missing one means somebody came
  // here directly. Answer in the default language rather than 500.
  const locale = isLocale(first) ? first : DEFAULT_LOCALE;
  const segments = isLocale(first) ? rest : slug;
  const page = resolvePage(locale, segments);

  // Deliberately without the path that was asked for: by the time a rewrite
  // lands here, `/typo` and `/en/typo` are the same request, and echoing a
  // guess at which one the client sent is worse than saying nothing.
  if (!page) return markdownResponse(notFoundMarkdown(locale), 404);

  return markdownResponse(pageMarkdown(locale, page), 200);
}
