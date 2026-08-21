/**
 * What the proxy decides, without standing up Next.
 *
 * Three decisions and their interactions: the representation, the language and
 * whether the URL names a page at all. The one that used to be wrong is the
 * last — a typo answered 307, and an agent that does not follow redirects reads
 * a 307 as "this page exists".
 */
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { proxy } from "./proxy";
import { LOCALE_COOKIE } from "./i18n/config";

const ORIGIN = "https://www.vivace.run";

function request(
  path: string,
  { accept, acceptLanguage, cookie }: Partial<Record<string, string>> = {},
) {
  const headers = new Headers();
  if (accept) headers.set("accept", accept);
  if (acceptLanguage) headers.set("accept-language", acceptLanguage);
  if (cookie) headers.set("cookie", `${LOCALE_COOKIE}=${cookie}`);
  return new NextRequest(new URL(path, ORIGIN), { headers });
}

/** Where a rewrite sent the request, as a path. */
function rewrittenTo(response: Response): string | null {
  const target = response.headers.get("x-middleware-rewrite");
  return target ? new URL(target).pathname : null;
}

const BROWSER =
  "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8";

describe("existence", () => {
  it("answers a path that names no page with a 404, not a redirect", () => {
    const response = proxy(request("/some-path-that-does-not-exist"));

    expect(response.status).toBe(404);
    expect(response.headers.get("location")).toBeNull();
    expect(rewrittenTo(response)).toBe("/en/404");
  });

  it.each([
    "/en/nope",
    "/fr/nope",
    "/en/about/deeper",
    "/de",
    "/wp-admin/setup",
  ])("404s %s where it stands", (path) => {
    const response = proxy(request(path, { accept: BROWSER }));
    expect(response.status).toBe(404);
    expect(response.headers.get("location")).toBeNull();
  });

  it("keeps the 404 in the language the visitor reads", () => {
    expect(
      rewrittenTo(proxy(request("/nope", { acceptLanguage: "fr-FR" }))),
    ).toBe("/fr/404");
    expect(rewrittenTo(proxy(request("/fr/nope")))).toBe("/fr/404");
  });

  it("lets a real page through untouched", () => {
    const response = proxy(request("/en/about", { accept: BROWSER }));

    expect(response.status).toBe(200);
    expect(rewrittenTo(response)).toBeNull();
    expect(response.headers.get("link")).toBe(
      '</en/about.md>; rel="alternate"; type="text/markdown"',
    );
  });
});

describe("language", () => {
  it("sends the bare root to a language", () => {
    const response = proxy(request("/", { acceptLanguage: "fr-CA,fr;q=0.9" }));

    expect(response.status).toBe(307);
    expect(new URL(response.headers.get("location")!).pathname).toBe("/fr");
  });

  it("prefers an explicit choice over the browser's list", () => {
    const response = proxy(
      request("/", { acceptLanguage: "fr-FR", cookie: "en" }),
    );
    expect(new URL(response.headers.get("location")!).pathname).toBe("/en");
  });

  /** An old link, or one shared by a reader of the other language. */
  it("sends an unlocalised page slug to the reader's own language", () => {
    const response = proxy(
      request("/a-propos", { acceptLanguage: "en-GB", accept: BROWSER }),
    );
    expect(new URL(response.headers.get("location")!).pathname).toBe(
      "/en/about",
    );
  });

  it("remembers a language the visitor landed on", () => {
    const response = proxy(request("/fr", { accept: BROWSER }));
    expect(response.cookies.get(LOCALE_COOKIE)?.value).toBe("fr");
  });

  it("leaves the cookie alone when it already agrees", () => {
    const response = proxy(request("/fr", { accept: BROWSER, cookie: "fr" }));
    expect(response.cookies.get(LOCALE_COOKIE)).toBeUndefined();
  });
});

describe("representation", () => {
  it("hands Markdown to a client that asks for it, at the same URL", () => {
    const response = proxy(request("/en/about", { accept: "text/markdown" }));

    expect(rewrittenTo(response)).toBe("/api/markdown/en/about");
    expect(response.headers.get("vary")).toContain("Accept");
  });

  it("negotiates the root without making an agent follow a redirect", () => {
    const response = proxy(
      request("/", { accept: "text/markdown", acceptLanguage: "fr" }),
    );

    expect(response.headers.get("location")).toBeNull();
    expect(rewrittenTo(response)).toBe("/api/markdown/fr");
  });

  it("serves the .md sibling whatever the Accept header says", () => {
    expect(rewrittenTo(proxy(request("/fr/confidentialite.md")))).toBe(
      "/api/markdown/fr/confidentialite",
    );
    expect(rewrittenTo(proxy(request("/en.md", { accept: "text/html" })))).toBe(
      "/api/markdown/en",
    );
  });

  it("sends an unknown path to the Markdown route, which 404s it", () => {
    expect(
      rewrittenTo(proxy(request("/nope", { accept: "text/markdown" }))),
    ).toBe("/api/markdown/en/nope");
  });

  it("serves a page to a browser", () => {
    expect(rewrittenTo(proxy(request("/en", { accept: BROWSER })))).toBeNull();
  });

  it("refuses, rather than guessing, when nothing we have is acceptable", () => {
    const response = proxy(request("/en", { accept: "application/pdf" }));

    expect(response.status).toBe(406);
    expect(response.headers.get("vary")).toContain("Accept");
  });

  it("varies on Accept everywhere it still owns the response", () => {
    for (const response of [
      proxy(request("/", { accept: BROWSER })),
      proxy(request("/en", { accept: "text/markdown" })),
      proxy(request("/en.md")),
      proxy(request("/nope", { accept: "text/markdown" })),
    ]) {
      expect(response.headers.get("vary")).toContain("Accept");
    }
  });
});

describe("what the proxy never sees", () => {
  const matcher = new RegExp(
    `^${
      // The one matcher entry, as Next compiles it: anchored, optional
      // trailing slash.
      "/((?!_next/|api/)(?!.*\\.(?!md$)).*)"
    }/?$`,
  );

  it.each([
    "/robots.txt",
    "/sitemap.xml",
    "/llms.txt",
    "/llms-full.txt",
    "/og-image.png",
    "/favicon.svg",
    "/_next/static/chunk.js",
    "/api/markdown/en",
  ])("skips %s", (path) => {
    expect(matcher.test(path)).toBe(false);
  });

  it.each(["/", "/en", "/fr/a-propos", "/en.md", "/fr/contact.md", "/typo"])(
    "runs on %s",
    (path) => {
      expect(matcher.test(path)).toBe(true);
    },
  );
});
