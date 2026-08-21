import { describe, expect, it } from "vitest";
import { fold, mentionToken, withoutMention } from "./composer-menu";

describe("mentionToken", () => {
  it("finds a bare `@`, which offers everything", () => {
    expect(mentionToken("@", 1)).toEqual({ start: 0, query: "" });
  });

  it("reads what has been typed after it", () => {
    expect(mentionToken("why did I fade on @morn", 23)).toEqual({
      start: 18,
      query: "morn",
    });
  });

  it("only counts an `@` that opens a word", () => {
    // Otherwise every email address in a question would open the run list.
    expect(mentionToken("mail me at ayoub@vivace.run", 27)).toBeNull();
  });

  it("ends the mention at a space", () => {
    expect(mentionToken("@morning run notes", 18)).toBeNull();
  });

  it("reads the caret, not the end of the draft", () => {
    // The athlete went back to add a run to a question already written.
    expect(mentionToken("@mor was that easy?", 4)).toEqual({
      start: 0,
      query: "mor",
    });
  });

  it("takes the `@` nearest the caret", () => {
    expect(mentionToken("@one and @two", 13)).toEqual({
      start: 9,
      query: "two",
    });
  });
});

describe("withoutMention", () => {
  it("cuts the mention out and leaves the rest of the sentence", () => {
    const draft = "why did I fade on @morn last week";
    expect(withoutMention(draft, { start: 18, query: "morn" }, 23)).toBe(
      "why did I fade on  last week",
    );
  });

  it("empties a draft that was only the mention", () => {
    expect(withoutMention("@morn", { start: 0, query: "morn" }, 5)).toBe("");
  });
});

describe("fold", () => {
  it("ignores case and accents, so a French name is typeable in ASCII", () => {
    expect(fold("Sortie Légère")).toBe("sortie legere");
  });
});
