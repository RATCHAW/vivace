// Was the answer any good?
//
// The one question the numbers can't answer for themselves: a turn that cost
// little and answered fast can still be wrong. A rating carries the answer's
// trace id, so in PostHog it lands on the same trace as the tokens, the tool
// calls and the replay that produced it — see `@/lib/posthog`.
//
// The row is drawn here rather than by PostHog's own survey widget. The events
// are identical; what differs is that this one is in the app's type scale, in
// the athlete's language, and inline in the transcript instead of a pop-up over
// it. It also asks the follow-up only when there is something to ask about.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ThumbsDownIcon, ThumbsUpIcon } from "lucide-react";
import {
  coachAnswerRating,
  noteCoachAnswer,
  rateCoachAnswer,
  trackCoachFeedbackShown,
} from "@/lib/posthog";
import {
  MessageAction,
  MessageActions,
} from "@/components/ai-elements/message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface CoachFeedbackProps {
  /** The answer's other actions — copy, try again — which share the row. */
  children: ReactNode;
  /**
   * Whether to count this answer as seen. Only the newest one does: every
   * answer in a thread is rendered when it is opened, and counting thirty of
   * them as impressions because the athlete came back to read one would make
   * the response rate a smaller number every time someone scrolls up.
   */
  countAsSeen: boolean;
  traceId: string;
}

export function CoachFeedback({
  children,
  countAsSeen,
  traceId,
}: CoachFeedbackProps) {
  const { t } = useTranslation();
  // What this browser already said about the answer, so coming back to a
  // conversation shows the thumb that was pressed rather than offering the
  // question again.
  const [rating, setRating] = useState<"up" | "down" | null>(() =>
    coachAnswerRating(traceId),
  );
  /** Ties the note to the rating it belongs to, as one response. */
  const submission = useRef<string | null>(null);
  const [note, setNote] = useState("");
  const [asking, setAsking] = useState(false);
  /** The acknowledgement, on its way in, on its way out, or gone. */
  const [thanks, setThanks] = useState<"shown" | "leaving" | null>(null);

  useEffect(() => {
    if (countAsSeen) trackCoachFeedbackShown(traceId);
  }, [countAsSeen, traceId]);

  // "Thanks" is a moment, not a state: it says the note arrived and then gets
  // out of the transcript, which the athlete is going to read again. What stays
  // is the filled thumb — the answer to "did I already rate this?".
  useEffect(() => {
    if (!thanks) return;
    const timer = setTimeout(
      () => setThanks(thanks === "shown" ? "leaving" : null),
      thanks === "shown" ? 2800 : 200,
    );
    return () => clearTimeout(timer);
  }, [thanks]);

  const rate = (value: "up" | "down") => {
    // One answer, one rating. The click already went to PostHog.
    if (rating) return;
    setRating(value);
    submission.current = rateCoachAnswer(traceId, value);
    // Nothing to ask someone who liked it — "what was wrong with it?" under a
    // thumbs up is a question about a problem they didn't report.
    setAsking(value === "down");
  };

  const sendNote = () => {
    const written = note.trim();
    if (!written || !submission.current) return;
    noteCoachAnswer(traceId, submission.current, written);
    setAsking(false);
    setThanks("shown");
  };

  return (
    <>
      {/* The row fades in on hover like every other message action, but not
          while the athlete is part-way through answering it. */}
      <MessageActions className={cn(asking && "opacity-100")}>
        {children}
        <MessageAction
          disabled={rating !== null}
          label={t("coach.helpful")}
          onClick={() => rate("up")}
          tooltip={t("coach.helpful")}
        >
          <ThumbsUpIcon className={cn(rating === "up" && "fill-current")} />
        </MessageAction>
        <MessageAction
          disabled={rating !== null}
          label={t("coach.notHelpful")}
          onClick={() => rate("down")}
          tooltip={t("coach.notHelpful")}
        >
          <ThumbsDownIcon className={cn(rating === "down" && "fill-current")} />
        </MessageAction>
      </MessageActions>

      {asking && (
        <form
          // Enters from just under the row it came out of, and only moves for
          // athletes who haven't asked for less motion. 150ms: long enough to
          // be followed, short enough that the caret is there when they type.
          className="flex max-w-md animate-in items-center gap-2 pt-1 duration-150 ease-out fade-in-0 motion-safe:slide-in-from-top-1"
          onSubmit={(event) => {
            event.preventDefault();
            sendNote();
          }}
        >
          <Input
            // The athlete has just said it wasn't helpful; the next thing they
            // want is somewhere to say why, not another click to get there.
            autoFocus
            className="h-11"
            onChange={(event) => setNote(event.target.value)}
            onKeyDown={(event) => {
              // A way out that doesn't need a button of its own. The rating is
              // already recorded; only the note is being abandoned.
              if (event.key === "Escape") setAsking(false);
            }}
            placeholder={t("coach.feedbackPlaceholder")}
            value={note}
          />
          <Button disabled={!note.trim()} size="sm" type="submit">
            {t("coach.feedbackSend")}
          </Button>
        </form>
      )}

      {thanks && (
        <p
          className={cn(
            "text-caption text-muted-foreground",
            // Out on a plain fade rather than the animation it came in on:
            // leaving should be quieter than arriving, and it is the last thing
            // the athlete needs to watch.
            thanks === "leaving"
              ? "opacity-0 transition-opacity duration-200 ease-out"
              : "animate-in duration-150 ease-out fade-in-0",
          )}
          role="status"
        >
          {t("coach.feedbackThanks")}
        </p>
      )}
    </>
  );
}
