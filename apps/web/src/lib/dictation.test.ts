import { afterEach, describe, expect, it } from "vitest";
import {
  createRecogniser,
  dictationFailure,
  dictationSupported,
  heard,
  joinDictated,
  type SpeechRecogniser,
} from "./dictation";

/** A result list shaped the way the Web Speech API hands one over. */
function results(
  spoken: { text: string; final: boolean }[],
): SpeechRecognitionResultList {
  const list = spoken.map((said) => ({
    isFinal: said.final,
    length: 1,
    0: { transcript: said.text, confidence: 1 },
    item: () => ({ transcript: said.text, confidence: 1 }),
  }));
  return Object.assign(list, {
    item: (index: number) => list[index],
  }) as unknown as SpeechRecognitionResultList;
}

/** A recogniser that records what it was configured with and never listens. */
class FakeRecogniser {
  lang = "";
  continuous = false;
  interimResults = false;
  maxAlternatives = 0;
  start() {}
  stop() {}
  abort() {}
  onresult: SpeechRecogniser["onresult"] = null;
  onerror: SpeechRecogniser["onerror"] = null;
  onend: SpeechRecogniser["onend"] = null;
}

afterEach(() => {
  delete (window as { SpeechRecognition?: unknown }).SpeechRecognition;
  delete (window as { webkitSpeechRecognition?: unknown })
    .webkitSpeechRecognition;
});

describe("heard", () => {
  it("keeps what the service settled on apart from what it may still revise", () => {
    expect(
      heard(
        results([
          { text: "why did I fade ", final: true },
          { text: "on Sunday", final: false },
        ]),
      ),
    ).toEqual({ final: "why did I fade", interim: "on Sunday" });
  });

  it("reads the whole session, not just the newest result", () => {
    expect(
      heard(
        results([
          { text: "plan my week ", final: true },
          { text: "around a race ", final: true },
        ]),
      ).final,
    ).toBe("plan my week around a race");
  });

  it("has nothing to report before anything is said", () => {
    expect(heard(results([]))).toEqual({ final: "", interim: "" });
  });
});

describe("joinDictated", () => {
  it("puts the words on the end of a half-typed question", () => {
    expect(joinDictated("why did I", "fade on Sunday")).toBe(
      "why did I fade on Sunday",
    );
  });

  it("does not double the space where one was already typed", () => {
    expect(joinDictated("why did I ", "fade")).toBe("why did I fade");
  });

  it("leaves an empty box holding only what was said", () => {
    expect(joinDictated("", "  plan my week ")).toBe("plan my week");
  });

  it("leaves a typed question alone when nothing was heard", () => {
    expect(joinDictated("why did I fade", "   ")).toBe("why did I fade");
  });
});

describe("dictationFailure", () => {
  it("says nothing about silence or an abort we asked for", () => {
    expect(dictationFailure("no-speech")).toBeNull();
    expect(dictationFailure("aborted")).toBeNull();
  });

  it("reads both refusals as a blocked microphone", () => {
    expect(dictationFailure("not-allowed")).toBe("denied");
    expect(dictationFailure("service-not-allowed")).toBe("denied");
  });

  it("names the failures an athlete can act on", () => {
    expect(dictationFailure("audio-capture")).toBe("noMicrophone");
    expect(dictationFailure("network")).toBe("network");
  });

  it("falls back rather than inventing a sentence for a new code", () => {
    expect(dictationFailure("language-not-supported")).toBe("failed");
  });
});

describe("createRecogniser", () => {
  it("listens in the language the app is being read in", () => {
    (window as { SpeechRecognition?: unknown }).SpeechRecognition =
      FakeRecogniser;

    expect(createRecogniser("fr")?.lang).toBe("fr-FR");
    expect(createRecogniser("en")?.lang).toBe("en-GB");
  });

  it("stays open across a pause and shows the half-heard words", () => {
    (window as { SpeechRecognition?: unknown }).SpeechRecognition =
      FakeRecogniser;

    const recogniser = createRecogniser("en");
    expect(recogniser?.continuous).toBe(true);
    expect(recogniser?.interimResults).toBe(true);
  });

  it("still finds the recogniser Safari hides behind a prefix", () => {
    (window as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition =
      FakeRecogniser;

    expect(dictationSupported()).toBe(true);
    expect(createRecogniser("en")).not.toBeNull();
  });

  it("has nothing to offer a browser without one", () => {
    expect(dictationSupported()).toBe(false);
    expect(createRecogniser("en")).toBeNull();
  });
});
