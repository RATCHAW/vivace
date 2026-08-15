import { describe, expect, it } from "vitest";
import { DEFAULT_NEXT, safeNextPath, signInPath } from "./next-path";

describe("safeNextPath", () => {
  it("keeps a path on this origin, query and all", () => {
    expect(safeNextPath("/replays?run=123")).toBe("/replays?run=123");
    expect(safeNextPath("/coach")).toBe("/coach");
  });

  it("falls back when there is nothing to remember", () => {
    expect(safeNextPath(null)).toBe(DEFAULT_NEXT);
    expect(safeNextPath(undefined)).toBe(DEFAULT_NEXT);
    expect(safeNextPath("")).toBe(DEFAULT_NEXT);
  });

  it("refuses anything that could leave this origin", () => {
    // The whole reason this function exists: the value reaches an OAuth
    // callbackURL, and a `next` that leaves is an open redirect on the one
    // screen where the athlete has just been asked to trust the page.
    expect(safeNextPath("https://evil.example")).toBe(DEFAULT_NEXT);
    expect(safeNextPath("//evil.example")).toBe(DEFAULT_NEXT);
    expect(safeNextPath("/\\evil.example")).toBe(DEFAULT_NEXT);
    expect(safeNextPath("javascript:alert(1)")).toBe(DEFAULT_NEXT);
    expect(safeNextPath("replays")).toBe(DEFAULT_NEXT);
  });

  it("refuses the sign-in screen itself", () => {
    // Otherwise signing in returns you to signing in.
    expect(safeNextPath("/login")).toBe(DEFAULT_NEXT);
    expect(safeNextPath("/login?lang=fr")).toBe(DEFAULT_NEXT);
  });
});

describe("signInPath", () => {
  it("remembers where the athlete was going", () => {
    expect(signInPath({ pathname: "/replays", search: "?run=123" })).toBe(
      "/login?next=%2Freplays%3Frun%3D123",
    );
  });

  it("stays clean when there is nothing worth remembering", () => {
    expect(signInPath({ pathname: "/", search: "" })).toBe("/login");
    expect(signInPath({ pathname: "/login", search: "" })).toBe("/login");
  });
});
