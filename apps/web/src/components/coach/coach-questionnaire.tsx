// The coach asking, rather than answering.
//
// Renders the `askAthlete` tool result (`buildQuestionnaire` in
// apps/api/src/coach.ts) as a form the athlete taps through one question at a
// time. Their answers become the athlete's next message, which is what the
// model reads and what puts them into `setAthleteContext`. Nothing new is
// persisted — the questions live in the transcript as the tool's output, and
// the answers live in it as the message underneath them.
//
// It is *not* a card. A card is something the coach drew for the athlete to
// read, and it sits in the transcript forever; a questionnaire is a turn the
// athlete has to take, so it takes the composer's place at the foot of the
// screen — the one part of the screen that already means "your turn" — and
// gives it back the moment they answer. What stays in the transcript is a
// single line saying it was asked, and whether it was answered.
//
// Standing where the text box was is what makes the escapes structural rather
// than decoration. No question is ever required, so Skip always leads out;
// every choice question carries a free-text box under its options, so an answer
// the model never thought of doesn't cost the athlete the form; and Dismiss
// hands the composer back for the case neither of those covers — the coach
// guessed the wrong subject entirely, and an answer to every question would
// still be beside the point. Skipping four questions to reach a text box is a
// way past the form, not a way out of it.
//
// Dismiss is deliberately not an undo button. It sends nothing and tells the
// coach nothing: what it gives back is the athlete's turn, and taking a turn
// includes saying something else instead. Which is also why the line it leaves
// in the transcript can be pressed back while the ask is still the coach's last
// word — the questions belong to the coach, and waving them off is not the same
// as destroying them.
import { useMemo, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { MessageCircleQuestionMarkIcon, XIcon } from "lucide-react";
import { MonoLabel } from "@/components/mono";
import { Button } from "@/components/ui/button";
import {
  Questionnaire,
  QuestionnaireActions,
  QuestionnaireChoice,
  QuestionnaireChoiceDescription,
  QuestionnaireChoices,
  QuestionnaireDescription,
  QuestionnaireError,
  QuestionnaireInput,
  QuestionnaireItem,
  QuestionnaireNext,
  QuestionnairePrevious,
  QuestionnaireProgress,
  QuestionnaireSkip,
  QuestionnaireSubmit,
  QuestionnaireTitle,
} from "@/components/ui/questionnaire";
import { cn } from "@/lib/utils";

/** Mirrors `AskedQuestion` in apps/api/src/coach.ts. */
export interface AskedQuestion {
  id: string;
  question: string;
  hint: string | null;
  kind: "single" | "multi" | "text" | "number";
  choices: { value: string; label: string; hint: string | null }[];
  unit: string | null;
  placeholder: string | null;
}

export interface QuestionnaireCard {
  card: "questionnaire";
  intro: string | null;
  questions: AskedQuestion[];
}

/**
 * The tool's output, if it is a questionnaire this version knows how to draw.
 *
 * Tool output arrives as `unknown` — it round-trips through the database as a
 * stored message part, so a questionnaire asked by an older version of the API
 * can still be sitting in a transcript. Anything unrecognised falls back to the
 * plain tool chip rather than breaking the thread.
 */
export function asQuestionnaire(output: unknown): QuestionnaireCard | null {
  if (typeof output !== "object" || output === null) return null;
  const card = output as Partial<QuestionnaireCard>;
  return card.card === "questionnaire" && Array.isArray(card.questions)
    ? (output as QuestionnaireCard)
    : null;
}

/** The answers, per question id, as the athlete gave them. */
type Answers = Record<string, string>;

/**
 * What one question's answer reads as in the message that goes back.
 *
 * Choice questions send their *labels*, not the `c1`/`c2` values the form
 * carries: the model wrote the labels and they are what it will recognise.
 */
function answerOf(question: AskedQuestion, data: FormData): string | null {
  const raw = data
    .getAll(question.id)
    .map((value) => String(value).trim())
    .filter(Boolean);
  if (raw.length === 0) return null;

  if (question.choices.length > 0) {
    return raw
      .map(
        (value) =>
          question.choices.find((choice) => choice.value === value)?.label ??
          value,
      )
      .join(", ");
  }
  return question.unit ? `${raw[0]} ${question.unit}` : raw[0];
}

// --- the line it leaves in the transcript -------------------------------------

/** Where an ask got to: waiting on the athlete, answered, or waved off. */
export type QuestionnaireStatus = "awaiting" | "answered" | "dismissed";

const STATUS_COPY = {
  awaiting: "cards.questionnaireAwaiting",
  answered: "cards.questionnaireAnswered",
  dismissed: "cards.questionnaireDismissed",
} as const;

export interface CoachQuestionnaireStatusProps {
  status: QuestionnaireStatus;
  /**
   * Stands the form back up. Given only while the ask is still the coach's
   * last word — a questionnaire the conversation has moved past is one the
   * athlete has answered in prose, and reopening it would ask them again.
   */
  onRestore?: () => void;
}

/**
 * One line: the coach asked, and where that got to.
 *
 * Deliberately not the questions themselves. They are in the composer while
 * they matter, and afterwards the athlete's own answers are the next message —
 * repeating them here would put the same words on screen three times.
 */
export function CoachQuestionnaireStatus({
  status,
  onRestore,
}: CoachQuestionnaireStatusProps) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-wrap items-center gap-2">
      <MessageCircleQuestionMarkIcon className="text-stone size-3.5 shrink-0" />
      <MonoLabel className="text-mono-badge">
        {t("cards.questionnaire")}
      </MonoLabel>
      <span
        className={cn(
          // Only the colour transitions. The words are different lengths, so
          // crossfading them would read as two labels overlapping rather than
          // as one changing its mind.
          "text-mono-badge rounded-full border px-2 py-0.5 font-mono uppercase transition-colors duration-200",
          status === "awaiting"
            ? "border-brand/35 bg-brand/10 text-brand"
            : "border-border text-muted-foreground",
        )}
      >
        {t(STATUS_COPY[status])}
      </span>
      {/* The way back, and only while there is one. `-my-1` keeps a 32px pill
          from making the whole line 32px tall — the row is a badge, not a
          toolbar. */}
      {status === "dismissed" && onRestore && (
        <Button
          className="-my-1"
          onClick={onRestore}
          size="xs"
          variant="subtle"
        >
          {t("cards.questionnaireReopen")}
        </Button>
      )}
    </div>
  );
}

// --- the form, where the composer usually is ----------------------------------

export interface CoachQuestionnaireProps {
  card: QuestionnaireCard;
  /** Sends the answers as the athlete's next message. */
  onAnswer: (text: string) => void;
  /** Hands the composer back, having sent nothing. */
  onDismiss: () => void;
}

export function CoachQuestionnaire({
  card,
  onAnswer,
  onDismiss,
}: CoachQuestionnaireProps) {
  const { t } = useTranslation();
  /** Guards the send, not the rendering: the parent unmounts this the moment
   *  the answers become a message, but a stray Enter must not beat it there. */
  const [sent, setSent] = useState(false);

  // The questionnaire's own collection — what it counts steps against and hangs
  // the number shortcuts off. Memoised because a fresh array on every render
  // re-runs the component's registration effects for no change.
  const items = useMemo(
    () =>
      card.questions.map((question) => ({
        name: question.id,
        choices: question.choices.map((choice) => ({ value: choice.value })),
      })),
    [card.questions],
  );

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (sent) return;
    setSent(true);

    const data = new FormData(event.currentTarget);
    const given: Answers = {};
    const lines: string[] = [];
    for (const question of card.questions) {
      given[question.id] =
        answerOf(question, data) ?? t("cards.questionnaireSkipped");
      lines.push(`${question.question} — ${given[question.id]}`);
    }

    onAnswer([t("cards.questionnaireAnswers"), ...lines].join("\n"));
  };

  return (
    <div
      className={cn(
        "border-input dark:bg-input/30 rounded-lg border p-4",
        // It takes the composer's place, so it arrives from where the composer
        // was rather than from nowhere. Once per questionnaire — rare enough to
        // be worth animating, short enough not to be in the way.
        "animate-in fade-in slide-in-from-bottom-1 duration-200 ease-out",
      )}
      onKeyDown={(event) => {
        // Escape leaves, exactly as it does in the message editor: whatever
        // took the athlete's place to type gives it back on the key that means
        // "not this". On the wrapper rather than on the form, so it catches the
        // key wherever focus is inside — an option, the free-text box, one of
        // the buttons. It costs no more than pressing Dismiss does, because
        // Dismiss discards the half-filled form too.
        if (event.key !== "Escape") return;
        event.preventDefault();
        onDismiss();
      }}
    >
      <Questionnaire items={items} onSubmit={handleSubmit} shortcuts="numbers">
        <div className="flex items-center justify-between gap-3">
          <MonoLabel className="text-mono-badge">
            {t("cards.questionnaire")}
          </MonoLabel>
          <div className="flex items-center gap-1">
            {/* `render`, not children: the step counter is a function of the
                questionnaire's own state, and the component's default children
                — and its `aria-valuetext` — are an English sentence it writes
                itself. Both are replaced, or a French athlete hears "Question 2
                of 4" read out. */}
            <QuestionnaireProgress
              className="w-auto min-w-0 text-right"
              render={(props, state) => {
                const step = t("cards.questionnaireStep", {
                  current: state.current,
                  total: state.total,
                });
                return (
                  <div
                    {...props}
                    aria-label={t("cards.questionnaire")}
                    aria-valuetext={step}
                  >
                    {step}
                  </div>
                );
              }}
            />
            {/* `type="button"`, or the first thing this does inside a form is
                submit it. The negative margins pull the 44px touch target into
                the card's own padding, so the row stays the height of the two
                labels in it while the tap target stays the size a thumb needs
                — and put the X where every dismiss in this app already is. */}
            <Button
              aria-label={t("cards.questionnaireDismiss")}
              className="-my-1.5 -me-1.5"
              onClick={onDismiss}
              size="icon-sm"
              type="button"
              variant="ghost"
            >
              <XIcon />
            </Button>
          </div>
        </div>

        {card.intro && (
          <p className="text-body-sm text-muted-foreground text-pretty">
            {card.intro}
          </p>
        )}

        {card.questions.map((question) => (
          <QuestionnaireItem
            key={question.id}
            multiple={question.kind === "multi"}
            name={question.id}
          >
            <QuestionnaireTitle>{question.question}</QuestionnaireTitle>
            {question.hint && (
              <QuestionnaireDescription>
                {question.hint}
              </QuestionnaireDescription>
            )}

            {/* One column at the choices' own spacing, so the free-text box
                reads as the last option rather than as a second question. The
                model is told not to write an "Other" choice — this is it, and
                it is here on every choice question whether the model thought of
                one or not. Picking an option clears what was typed and typing
                clears the picked option, which the primitive does for us: an
                input is just another answer to the same question. */}
            {question.choices.length > 0 ? (
              <div className="flex flex-col gap-2">
                <QuestionnaireChoices>
                  {question.choices.map((choice) => (
                    <QuestionnaireChoice
                      key={choice.value}
                      value={choice.value}
                    >
                      {choice.label}
                      {choice.hint && (
                        <QuestionnaireChoiceDescription>
                          {choice.hint}
                        </QuestionnaireChoiceDescription>
                      )}
                    </QuestionnaireChoice>
                  ))}
                </QuestionnaireChoices>
                <QuestionnaireInput
                  className="ph-no-capture"
                  placeholder={t("cards.questionnaireOther")}
                />
              </div>
            ) : (
              // ph-no-capture: session replay is on, and "my left achilles has
              // been sore since Tuesday" is exactly what it must never record.
              <QuestionnaireInput
                className="ph-no-capture"
                placeholder={question.placeholder ?? undefined}
                type={question.kind === "number" ? "number" : "text"}
              />
            )}

            {/* The primitive blocks Next and Send on a question that has been
                neither answered nor skipped, so the sentence names both ways
                on. There is no third: no question here is ever required. */}
            <QuestionnaireError>
              {t("cards.questionnaireAnswerOrSkip")}
            </QuestionnaireError>
          </QuestionnaireItem>
        ))}

        <QuestionnaireActions>
          <QuestionnairePrevious>
            {t("cards.questionnairePrevious")}
          </QuestionnairePrevious>
          <QuestionnaireSkip>{t("cards.questionnaireSkip")}</QuestionnaireSkip>
          <QuestionnaireNext>{t("cards.questionnaireNext")}</QuestionnaireNext>
          <QuestionnaireSubmit>
            {t("cards.questionnaireSend")}
          </QuestionnaireSubmit>
        </QuestionnaireActions>
      </Questionnaire>
    </div>
  );
}
