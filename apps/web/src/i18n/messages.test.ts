import { describe, expect, it } from "vitest";
import { TEMPLATE_IDS, THEME_NAMES } from "@repo/video";
import { formatters } from "./format";
import { LOCALES } from "./locales";
import { en } from "./messages/en";
import { fr } from "./messages/fr";

const CATALOGUES = { en, fr } as const;

/** Every leaf key, dotted — `coach.tools.listRuns`, `days.short.0`. */
function leaves(value: unknown, prefix = ""): string[] {
  if (typeof value === "string") return [prefix];
  if (Array.isArray(value)) {
    return value.flatMap((item, i) => leaves(item, `${prefix}.${i}`));
  }
  if (typeof value === "object" && value !== null) {
    return Object.entries(value).flatMap(([key, child]) =>
      leaves(child, prefix ? `${prefix}.${key}` : key),
    );
  }
  return [];
}

/** `{{name}}` — what a sentence expects the caller to hand it. */
function placeholders(text: string): string[] {
  return [...text.matchAll(/\{\{(\w+)\}\}/g)].map((match) => match[1]).sort();
}

function entries(catalogue: unknown): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (value: unknown, prefix: string) => {
    if (typeof value === "string") {
      out.set(prefix, value);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item, i) => walk(item, `${prefix}.${i}`));
      return;
    }
    if (typeof value === "object" && value !== null) {
      for (const [key, child] of Object.entries(value)) {
        walk(child, prefix ? `${prefix}.${key}` : key);
      }
    }
  };
  walk(catalogue, "");
  return out;
}

describe("message catalogues", () => {
  // TypeScript already enforces the shape — `fr` is typed as `Translated<Messages>`.
  // This catches what the type cannot: an array that lost an entry, and a
  // string left empty.
  it("answer exactly the same keys", () => {
    const english = leaves(en).sort();
    const french = leaves(fr).sort();
    expect(french).toEqual(english);
  });

  it.each(LOCALES)("%s has no empty strings", (locale) => {
    const blank = [...entries(CATALOGUES[locale])]
      .filter(([, value]) => value.trim() === "")
      .map(([key]) => key);
    expect(blank).toEqual([]);
  });

  /**
   * The one mistake a translator makes that nothing else catches: dropping a
   * `{{count}}` from a sentence, so the number silently disappears from the
   * screen rather than the build.
   */
  it("keep every interpolation placeholder", () => {
    const english = entries(en);
    const french = entries(fr);
    const drifted = [...english]
      .filter(([key, text]) => {
        const other = french.get(key);
        return (
          other && placeholders(other).join() !== placeholders(text).join()
        );
      })
      .map(([key]) => key);
    expect(drifted).toEqual([]);
  });

  /**
   * The video catalogue lives in `@repo/video` and is translated by id. A
   * template or theme added there without an entry here still renders — it
   * falls back to the package's English — but that is worth knowing about
   * rather than discovering in production.
   */
  it("cover every template and theme in the video catalogue", () => {
    expect(Object.keys(en.video.template).sort()).toEqual(
      [...TEMPLATE_IDS].sort(),
    );
    expect(Object.keys(en.video.theme).sort()).toEqual([...THEME_NAMES].sort());
  });
});

describe("date formatting", () => {
  it("follows the locale", () => {
    // Deliberately the same instant, read two ways.
    expect(formatters("en-GB").runDate("2026-08-05T18:30:00Z")).toContain(
      "2026",
    );
    expect(formatters("fr-FR").runDate("2026-08-05T18:30:00Z")).toContain(
      "août",
    );
  });

  it("reads a run's day in UTC, not the machine's timezone", () => {
    // `start_date_local` carries the athlete's wall clock with a Z suffix; read
    // locally, a run at 23:30 on New Year's Eve lands in the wrong year.
    expect(formatters("en-GB").runDate("2025-12-31T23:30:00Z")).toContain(
      "2025",
    );
  });
});
