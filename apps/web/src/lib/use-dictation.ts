import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { currentLocale } from "@/i18n";
import type { TranslationKey } from "@/i18n";
import { trackError, trackEvent } from "@/lib/logger";
import {
  createRecogniser,
  dictationFailure,
  dictationSupported,
  heard,
  joinDictated,
  type DictationFailure,
  type SpeechRecogniser,
} from "@/lib/dictation";

/**
 * The sentence for each reason the microphone gave up. Mirrors
 * `FAILURE_COPY` in coach-chat.tsx: the module says what happened, the
 * catalogue says it in the athlete's language.
 */
const FAILURE_COPY = {
  denied: "composer.dictation.errors.denied",
  noMicrophone: "composer.dictation.errors.noMicrophone",
  network: "composer.dictation.errors.network",
  failed: "composer.dictation.errors.failed",
} satisfies Record<DictationFailure, TranslationKey>;

export interface Dictation {
  /** False on a browser with no recogniser, where the button isn't drawn. */
  supported: boolean;
  listening: boolean;
  /** Open the microphone onto `typed`; close it if it is already open. */
  toggle: (typed: string) => void;
  /** Close it, keeping every word the service had committed to. */
  stop: () => void;
  /** Close it and abandon whatever it was still weighing. */
  cancel: () => void;
}

/**
 * The microphone, wired to a text box.
 *
 * `onText` is handed the whole box each time the recogniser revises itself —
 * what was typed before the microphone opened, plus everything said since — so
 * the caller can stay a plain controlled input and own no dictation state.
 *
 * The text typed before the microphone opened is captured at that moment and
 * held for the session: a result arriving is the recogniser's best account of
 * the *whole* utterance, including corrections to words it delivered a second
 * ago, so the only stable way to apply one is to rewrite everything after the
 * caret it started from. Typing mid-sentence is therefore overwritten by the
 * next syllable, which is the trade every dictation box makes.
 */
export function useDictation(onText: (text: string) => void): Dictation {
  const { t } = useTranslation();
  // State rather than a ref: it decides whether the button is drawn at all.
  // Read once — no browser grows a recogniser between renders.
  const [supported] = useState(dictationSupported);
  const [listening, setListening] = useState(false);
  const session = useRef<SpeechRecogniser | null>(null);

  const stop = useCallback(() => {
    // `stop`, never `abort`: it flushes whatever the service was still weighing
    // as a final result, so the last word spoken is in the box. This is the
    // square the athlete presses when they have finished talking and want to
    // read the question back before sending it.
    session.current?.stop();
  }, []);

  /**
   * The other way a session ends: the question has just been sent.
   *
   * `stop` would deliver one last result into a box the athlete has already
   * emptied — the sent question typed straight back out again — so the pending
   * words are dropped, and the handler with them, because `abort` is allowed to
   * flush on its way out.
   */
  const cancel = useCallback(() => {
    const recogniser = session.current;
    if (!recogniser) return;
    recogniser.onresult = null;
    recogniser.abort();
  }, []);

  // Leaving the composer — for another conversation, or another page — closes
  // the microphone. A recogniser nobody is listening to still holds the tab's,
  // and `abort` here rather than `stop` because there is no box left to write
  // the last word into.
  useEffect(() => () => session.current?.abort(), []);

  const start = (typed: string) => {
    const recogniser = createRecogniser(currentLocale());
    if (!recogniser) return;

    recogniser.onresult = (event) => {
      const { final, interim } = heard(event.results);
      onText(joinDictated(typed, joinDictated(final, interim)));
    };

    recogniser.onerror = (event) => {
      const failure = dictationFailure(event.error);
      // Silence and our own abort end a session without anything going wrong.
      if (!failure) return;
      // The code is for Grafana, the sentence is for the athlete, and the two
      // are deliberately not the same words.
      trackError("ui.dictation_failed", new Error(event.error), {
        code: event.error,
      });
      toast.error(t(FAILURE_COPY[failure]));
    };

    // Fires however the session ended — stopped, aborted, or given up on after
    // an error — which makes it the one place the button can be trusted to go
    // back to its resting state.
    recogniser.onend = () => {
      session.current = null;
      setListening(false);
    };

    try {
      recogniser.start();
    } catch (error) {
      // A recogniser already running throws rather than firing `onerror`.
      trackError("ui.dictation_failed", error);
      toast.error(t(FAILURE_COPY.failed));
      return;
    }

    session.current = recogniser;
    setListening(true);
    trackEvent("ui.dictation_started", { locale: currentLocale() });
  };

  return {
    supported,
    listening,
    stop,
    cancel,
    toggle: (typed: string) => (listening ? stop() : start(typed)),
  };
}
