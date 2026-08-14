/**
 * Sends `/` to `/en` or `/fr`, and remembers which.
 *
 * The page itself lives under `app/[locale]`, so every URL that reaches a
 * visitor carries its language — which is what lets both versions prerender at
 * build time and what gives the `hreflang` pair something to point at. This is
 * the only piece that runs per-request, and all it does is choose.
 *
 * Order of preference: an explicit choice in the cookie, then the browser's
 * `Accept-Language`, then English. Landing on `/fr` *is* an explicit choice —
 * that is how the switcher works — so the cookie is rewritten to match the
 * path on the way through.
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
} from "@/i18n/config";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const [, first] = pathname.split("/");

  if (isLocale(first)) {
    // Already localised. Only touch the cookie when it disagrees, so an
    // otherwise-cacheable response isn't given a `Set-Cookie` for nothing.
    if (request.cookies.get(LOCALE_COOKIE)?.value === first) {
      return NextResponse.next();
    }
    const response = NextResponse.next();
    response.cookies.set(LOCALE_COOKIE, first, {
      maxAge: LOCALE_COOKIE_MAX_AGE,
      path: "/",
      sameSite: "lax",
    });
    return response;
  }

  const locale = negotiateLocale(
    request.cookies.get(LOCALE_COOKIE)?.value,
    request.headers.get("accept-language"),
  );

  const url = request.nextUrl.clone();
  url.pathname = `/${locale}${pathname === "/" ? "" : pathname}`;
  return NextResponse.redirect(url);
}

export const config = {
  /**
   * Everything except Next's own assets and the files served from `public/`.
   * A `robots.txt` or an OG image must not be redirected into a locale.
   */
  matcher: ["/((?!_next/|api/|.*\\..*).*)"],
};
