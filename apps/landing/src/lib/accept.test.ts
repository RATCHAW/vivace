import { describe, expect, it } from "vitest";
import {
  appendVaryAccept,
  HTML_TYPE,
  MARKDOWN_TYPE,
  preferredMediaType,
} from "./accept";

describe("preferredMediaType", () => {
  it("serves a page when nobody asked for anything", () => {
    expect(preferredMediaType(null)).toBe(HTML_TYPE);
    expect(preferredMediaType(undefined)).toBe(HTML_TYPE);
    expect(preferredMediaType("")).toBe(HTML_TYPE);
  });

  it("serves a page to a browser", () => {
    expect(
      preferredMediaType(
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      ),
    ).toBe(HTML_TYPE);
  });

  it("serves Markdown to an agent that asks for it", () => {
    expect(preferredMediaType("text/markdown")).toBe(MARKDOWN_TYPE);
  });

  it("serves a page to a crawler with no opinion", () => {
    expect(preferredMediaType("*/*")).toBe(HTML_TYPE);
  });

  it("honours quality values over header order", () => {
    expect(preferredMediaType("text/html;q=0.5, text/markdown;q=0.9")).toBe(
      MARKDOWN_TYPE,
    );
    expect(preferredMediaType("text/markdown;q=0.2, text/html;q=0.8")).toBe(
      HTML_TYPE,
    );
  });

  it("breaks a tie on the order the client named them in", () => {
    expect(preferredMediaType("text/markdown, text/html, */*")).toBe(
      MARKDOWN_TYPE,
    );
    expect(preferredMediaType("text/html, text/markdown")).toBe(HTML_TYPE);
  });

  /**
   * RFC 9110 §12.5.1: a more specific range beats a less specific one whatever
   * their quality values say. Ranking by `q` alone would read this as "HTML at
   * 1.0 via the wildcard" and serve the one thing the client refused.
   */
  it("lets a specific refusal beat a permissive wildcard", () => {
    expect(preferredMediaType("text/html;q=0, */*")).toBe(MARKDOWN_TYPE);
    expect(preferredMediaType("text/markdown;q=0, */*")).toBe(HTML_TYPE);
  });

  it("reads a type range", () => {
    expect(preferredMediaType("text/*")).toBe(HTML_TYPE);
    expect(preferredMediaType("image/*, text/markdown")).toBe(MARKDOWN_TYPE);
  });

  it("answers null when the client refuses everything we have", () => {
    // A 406, which is the fourth of acceptmarkdown.com's compliance checks.
    expect(preferredMediaType("application/pdf")).toBeNull();
    expect(preferredMediaType("text/html;q=0, text/markdown;q=0")).toBeNull();
    expect(preferredMediaType("*/*;q=0")).toBeNull();
  });

  it("treats an unreadable quality value as full weight, not a refusal", () => {
    expect(preferredMediaType("text/markdown;q=banana")).toBe(MARKDOWN_TYPE);
  });

  it("ignores parameters that are not q", () => {
    expect(preferredMediaType("text/markdown;variant=CommonMark")).toBe(
      MARKDOWN_TYPE,
    );
  });
});

describe("appendVaryAccept", () => {
  it("sets the header when nothing varies yet", () => {
    const headers = new Headers();
    appendVaryAccept(headers);
    expect(headers.get("Vary")).toBe("Accept");
  });

  it("keeps what already varies", () => {
    const headers = new Headers({ Vary: "rsc, Accept-Encoding" });
    appendVaryAccept(headers);
    expect(headers.get("Vary")).toBe("rsc, Accept-Encoding, Accept");
  });

  it("does not say Accept twice", () => {
    const headers = new Headers({ Vary: "Accept-Encoding, accept" });
    appendVaryAccept(headers);
    expect(headers.get("Vary")).toBe("Accept-Encoding, accept");
  });

  it("leaves a wildcard alone", () => {
    const headers = new Headers({ Vary: "*" });
    appendVaryAccept(headers);
    expect(headers.get("Vary")).toBe("*");
  });
});
