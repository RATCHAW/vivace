// Speaking a question instead of typing it.
//
// The transcription is the browser's own — the Web Speech API, which Chrome,
// Edge and Safari implement and Firefox does not. That is the whole reason this
// is a browser module and not an API route: no audio reaches our server, no
// model is billed per minute, and the athlete's half-formed question never
// leaves the tab except to the recogniser their browser already trusts.
//
// Everything below the constructor is pure, so the two things worth getting
// right — where the words land in a half-typed question, and which failures the
// athlete should hear about — are tested without a microphone.
import { INTL_LOCALES, type Locale } from "@/i18n/locales";

/**
 * The slice of the Web Speech API this app uses.
 *
 * Declared by hand because TypeScript's DOM library stops short of it: it
 * describes a `SpeechRecognitionResultList` but not the recogniser that
 * produces one, nor its events, nor the `webkit` prefix Safari still ships it
 * under.
 */
export interface SpeechRecogniser {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechResultEvent) => void) | null;
  onerror: ((event: SpeechErrorEvent) => void) | null;
  onend: (() => void) | null;
}

export interface SpeechResultEvent {
  /** Every result of the session, not just the newest one. */
  results: SpeechRecognitionResultList;
}

export interface SpeechErrorEvent {
  /** `not-allowed`, `no-speech`, `audio-capture`, `network`, … */
  error: string;
}

type SpeechRecogniserConstructor = new () => SpeechRecogniser;

function constructorFor(): SpeechRecogniserConstructor | null {
  if (typeof window === "undefined") return null;
  const global = window as unknown as {
    SpeechRecognition?: SpeechRecogniserConstructor;
    webkitSpeechRecognition?: SpeechRecogniserConstructor;
  };
  return global.SpeechRecognition ?? global.webkitSpeechRecognition ?? null;
}

/** Whether this browser can transcribe at all. False hides the button. */
export function dictationSupported(): boolean {
  return constructorFor() !== null;
}

/**
 * A recogniser listening in the language the app is being read in.
 *
 * `INTL_LOCALES` rather than the bare locale because the service wants a
 * region — the same reason the date formatters read it.
 */
export function createRecogniser(locale: Locale): SpeechRecogniser | null {
  const Recogniser = constructorFor();
  if (!Recogniser) return null;

  const recogniser = new Recogniser();
  recogniser.lang = INTL_LOCALES[locale];
  // Without this the recogniser closes itself on the first pause, which turns
  // one question into three taps of the button.
  recogniser.continuous = true;
  // The half-heard words, so the box fills while the athlete is still talking
  // rather than all at once when they stop.
  recogniser.interimResults = true;
  // Nothing here offers alternatives, so paying for them is pointless.
  recogniser.maxAlternatives = 1;
  return recogniser;
}

export interface Heard {
  /** What the service has committed to and will not revise. */
  final: string;
  /** What it is still revising — shown, never relied on. */
  interim: string;
}

/**
 * Everything said this session, split by whether the service still might
 * change its mind about it.
 *
 * Read from the whole list rather than from `resultIndex`, so this is a pure
 * function of one event and the caller keeps no running total to lose.
 */
export function heard(results: SpeechRecognitionResultList): Heard {
  let final = "";
  let interim = "";
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const text = result[0]?.transcript ?? "";
    if (result.isFinal) final += text;
    else interim += text;
  }
  return { final: final.trim(), interim: interim.trim() };
}

/**
 * Dictation, appended to whatever was already typed.
 *
 * On the end rather than over the top: an athlete who typed half a question
 * and then reached for the microphone meant to finish it, not to start again.
 * The recogniser's own leading space is dropped so the join is ours to decide.
 */
export function joinDictated(typed: string, spoken: string): string {
  const said = spoken.trim();
  if (!said) return typed;
  if (!typed) return said;
  return /\s$/.test(typed) ? typed + said : `${typed} ${said}`;
}

/**
 * Why the microphone produced nothing, as a token rather than a sentence — the
 * same shape as `CoachFailure` in apps/api, and for the same reason: the spec's
 * own codes are written for whoever reads a spec.
 *
 * `null` is a code the athlete is better off not hearing about: silence, and
 * the abort we asked for ourselves. Both are ordinary ends to a session, and a
 * toast for either would fire every time somebody thought before speaking.
 */
export type DictationFailure = "denied" | "noMicrophone" | "network" | "failed";

export function dictationFailure(code: string): DictationFailure | null {
  switch (code) {
    case "aborted":
    case "no-speech":
      return null;
    // Chrome sends the first when the athlete refuses the prompt and the second
    // when the page was never allowed to ask — an insecure origin, or a policy.
    case "not-allowed":
    case "service-not-allowed":
      return "denied";
    case "audio-capture":
      return "noMicrophone";
    case "network":
      return "network";
    default:
      return "failed";
  }
}
