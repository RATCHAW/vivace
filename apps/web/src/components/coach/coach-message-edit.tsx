// Rewriting a question the coach has already answered.
//
// The box takes the bubble's place rather than opening below it: same surface,
// same rounding, same type at the same size, so the swap reads as the sentence
// becoming editable rather than as a form appearing. It doesn't animate in for
// the same reason the composer doesn't — the first thing that happens is a
// keystroke, and nothing should be moving underneath it.
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export interface CoachMessageEditProps {
  /** The question as it stands — what the box opens with. */
  text: string;
  onCancel: () => void;
  /** The rewritten question, already trimmed and never empty. */
  onSubmit: (text: string) => void;
}

export function CoachMessageEdit({
  text,
  onCancel,
  onSubmit,
}: CoachMessageEditProps) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(text);
  const [composing, setComposing] = useState(false);
  const field = useRef<HTMLTextAreaElement>(null);

  // The caret lands after the last character rather than over the whole
  // message: an athlete opening this is changing a word, and a full selection
  // loses the sentence on the next keystroke.
  useEffect(() => {
    const element = field.current;
    if (!element) return;
    element.focus();
    element.setSelectionRange(element.value.length, element.value.length);
  }, []);

  const send = () => {
    const trimmed = draft.trim();
    if (trimmed) onSubmit(trimmed);
  };

  // The focus ring is on the bubble, not on the field inside it: what the
  // athlete is editing *is* the message, and a second rectangle drawn around
  // the words would say otherwise. It arrives with the focus that lands a tick
  // after mount, which reads as the bubble waking up.
  return (
    <div className="bg-secondary text-secondary-foreground focus-within:ring-ring/50 flex w-full flex-col gap-2 rounded-lg rounded-br-sm px-3.5 pt-3.5 pb-3 ring-0 transition-shadow duration-150 focus-within:ring-3">
      {/* Padding that lands the first character exactly where it was reading a
          moment ago: 3.5 here plus 1 there is the bubble's own px-4.5. The
          primitive's `field-sizing-content` grows the box with the answer, and
          the cap keeps a long one from pushing the buttons off screen. */}
      <Textarea
        aria-label={t("coach.editLabel")}
        className="text-body-md md:text-body-md max-h-48 min-h-0 resize-none border-0 bg-transparent px-1 py-0 leading-relaxed focus-visible:border-0 focus-visible:ring-0"
        onChange={(event) => setDraft(event.target.value)}
        onCompositionEnd={() => setComposing(false)}
        onCompositionStart={() => setComposing(true)}
        onKeyDown={(event) => {
          // Enter sends and Escape leaves, as in the composer — including its
          // guard: an IME candidate window is mid-word, and shift is a newline.
          if (event.key === "Enter") {
            if (composing || event.nativeEvent.isComposing || event.shiftKey) {
              return;
            }
            event.preventDefault();
            send();
          }
          if (event.key === "Escape") {
            event.preventDefault();
            onCancel();
          }
        }}
        ref={field}
        value={draft}
      />
      <div className="flex items-center justify-end gap-2">
        <Button onClick={onCancel} size="sm" type="button" variant="ghost">
          {t("coach.editCancel")}
        </Button>
        <Button
          disabled={draft.trim().length === 0}
          onClick={send}
          size="sm"
          type="button"
        >
          {t("coach.editSend")}
        </Button>
      </div>
    </div>
  );
}
