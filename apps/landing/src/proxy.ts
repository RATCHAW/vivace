/**
 * The one piece of this site that runs per request. It decides three things,
 * in this order: which representation the client asked for, which language it
 * reads, and whether the URL names a page at all.
 *
 * **Representation.** `Accept: text/markdown` gets Markdown from the same URL
 * a browser gets HTML from — acceptmarkdown.com's content negotiation, so an
 * agent spends its context on the prose rather than on the DOM. `.md` on the
 * end of any path is the same thing for a crawler that sends no `Accept` at
 * all. Every response carries `Vary: Accept`, without which a CDN would hand
 * an agent the HTML it cached for the last browser.
 *
 * **Language.** The page lives under `app/[locale]`, so every URL a visitor
 * ever sees carries its language — which is what lets both versions prerender
 * at build time and what gives the `hreflang` pair something to point at. An
 * explicit choice in the cookie beats the browser's `Accept-Language`, which
 * beats English. Landing on `/fr` *is* an explicit choice — that is how the
 * switcher works — so the cookie is rewritten to match the path on the way
 * through.
 *
 * **Existence.** A path that names no page is rewritten, not redirected, to a
 * 404. This used to send `/typo` to `/en/typo` and let that 404 instead, which
 * meant the honest answer to "does this URL exist?" was a 307 — and an agent
 * that does not follow redirects reads a 307 as "yes". A rewrite keeps the
 * URL, returns the status straight away, and lands on a page that lists what
 * *does* exist.
 *
 * `proxy`, not `middleware`: Next 16 renamed the file and the export, and runs
 * it on the Node runtime. Nothing here needs the edge, which is the only
 * reason left to keep the old name.
 */
import { NextResponse, type NextRequest } from "next/server";
import {
  isLocale,
  LOCALE_COOKIE,
  LOCALE_COOKIE_MAX_AGE,
  negotiateLocale,
  type Locale,
} from "@/i18n/config";
import {
  appendVaryAccept,
  MARKDOWN_TYPE,
  preferredMediaType,
} from "@/lib/accept";
import {
  markdownPath,
  NOT_FOUND_SLUG,
  pagePaths,
  resolvePage,
  resolveUnlocalizedPage,
} from "@/lib/pages";

/** Where the Markdown representation is rendered. Never a URL anybody types. */
const MARKDOWN_ROUTE = "/api/markdown";

function segmentsOf(pathname: string): string[] {
  return pathname.split("/").filter(Boolean);
}

/** The locale and page a URL names, with the locale prefix already stripped. */
function readPath(pathname: string, request: NextRequest) {
  const segments = segmentsOf(pathname);
  const [first, ...rest] = segments;

  if (isLocale(first)) {
    return { locale: first, rest, localized: true as const };
  }
  return {
    locale: negotiateLocale(
      request.cookies.get(LOCALE_COOKIE)?.value,
      request.headers.get("accept-language"),
    ),
    rest: segments,
    localized: false as const,
  };
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // `/en/about.md` is `/en/about`, always Markdown, whatever `Accept` says.
  // This is what `<link rel="alternate" type="text/markdown">` points at, and
  // what a crawler that sends no `Accept` header can still fetch.
  if (pathname.endsWith(".md")) {
    return rewriteToMarkdown(request, pathname.slice(0, -3));
  }

  const chosen = preferredMediaType(request.headers.get("accept"));

  // Nothing we produce is acceptable. Saying so is the point of `Accept`;
  // answering with HTML anyway is how a negotiation stops meaning anything.
  if (chosen === null) {
    return new NextResponse(
      "Not Acceptable\n\nAvailable: text/html, text/markdown\n",
      {
        status: 406,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          Vary: "Accept",
        },
      },
    );
  }

  if (chosen === MARKDOWN_TYPE) return rewriteToMarkdown(request, pathname);

  return respondWithHtml(request, pathname);
}

/**
 * Hand the path to the Markdown route, locale-prefixed so the handler never
 * has to negotiate one itself. An unknown path goes there too — the handler
 * answers it with a 404 whose body is the site's directory.
 */
function rewriteToMarkdown(request: NextRequest, pathname: string) {
  const { locale, rest } = readPath(pathname, request);
  const url = request.nextUrl.clone();
  url.pathname = `${MARKDOWN_ROUTE}/${[locale, ...rest].join("/")}`;

  const response = NextResponse.rewrite(url);
  appendVaryAccept(response.headers);
  return response;
}

function respondWithHtml(request: NextRequest, pathname: string) {
  const { locale, rest, localized } = readPath(pathname, request);
  const page = localized
    ? resolvePage(locale, rest)
    : resolveUnlocalizedPage(rest);

  // An unlocalised path that does name a page — `/`, or `/about` from an old
  // link — is a redirect, because the URL a visitor keeps must carry its
  // language. Everything else that reaches here is a 404 and stays where it is.
  if (!localized) {
    if (!page) return rewriteToNotFound(request, locale);
    const url = request.nextUrl.clone();
    url.pathname = pagePaths(page)[locale];
    const response = NextResponse.redirect(url);
    appendVaryAccept(response.headers);
    return response;
  }

  if (!page) return rewriteToNotFound(request, locale);

  const response = NextResponse.next();
  // Only touch the cookie when it disagrees, so an otherwise-cacheable
  // response isn't given a `Set-Cookie` for nothing.
  if (request.cookies.get(LOCALE_COOKIE)?.value !== locale) {
    response.cookies.set(LOCALE_COOKIE, locale, {
      maxAge: LOCALE_COOKIE_MAX_AGE,
      path: "/",
      sameSite: "lax",
    });
  }
  // `Vary` is set here and then overwritten: App Router writes its own router
  // list (`rsc, next-router-state-tree, …`) over whatever a proxy left on a
  // page response, and neither `append` nor a `next.config` header survives it.
  // It costs this deployment nothing — negotiation happens here, above the
  // page cache, so an agent asking for Markdown never reaches the HTML entry —
  // but a CDN put in front of Vercel would need the header, which is why the
  // call stays: the moment Next merges instead of replacing, it starts working.
  appendVaryAccept(response.headers);
  // RFC 8288: the same content, in the other media type, at a URL a crawler
  // can follow without knowing about `Accept` at all. This one does survive.
  response.headers.set(
    "Link",
    `<${markdownPath(locale, page)}>; rel="alternate"; type="text/markdown"`,
  );
  return response;
}

function rewriteToNotFound(request: NextRequest, locale: Locale) {
  const url = request.nextUrl.clone();
  url.pathname = `/${locale}/${NOT_FOUND_SLUG}`;
  // `status` is load-bearing, and it is the whole reason this is a rewrite and
  // not a `notFound()`. `/{locale}/404` is a prerendered page like any other
  // and answers 200 on its own; this is what makes the response a real 404
  // without giving up the static build. Drop it and every typo on the site
  // becomes a soft 404 — a 200 whose body says "not found", which is the exact
  // thing that teaches a crawler every path exists.
  //
  // `notFound()` would carry the status for free, but not here: this app has no
  // `app/layout.tsx` — `[locale]/layout.tsx` *is* the root, so it can set
  // `<html lang>` — and Next renders a not-found boundary outside that layout,
  // in a bare `__next_error__` document with no stylesheet. It also renders it
  // without `params`, so it could not tell which language to apologise in.
  const response = NextResponse.rewrite(url, { status: 404 });
  appendVaryAccept(response.headers);
  return response;
}

export const config = {
  /**
   * Everything except Next's own assets, the Markdown route it rewrites into,
   * and the files served from `public/` — a `robots.txt` or an OG image must
   * not be redirected into a locale. `.md` is the one extension let through,
   * because those are pages rather than files.
   */
  matcher: ["/((?!_next/|api/)(?!.*\\.(?!md$)).*)"],
};
