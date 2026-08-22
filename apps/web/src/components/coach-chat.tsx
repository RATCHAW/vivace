import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useChat } from "@ai-sdk/react";
import { getToolName, isToolUIPart, type UIMessage } from "ai";
import { useTranslation } from "react-i18next";
import {
  CheckIcon,
  CopyIcon,
  PencilIcon,
  RefreshCcwIcon,
  SparklesIcon,
} from "lucide-react";
import { toast } from "sonner";
import { useFormatters } from "@/i18n/format";
import type { TranslationKey } from "@/i18n";
import {
  acceptCoachPlanMutation,
  getCoachBriefingQueryKey,
  type Run,
} from "@/api";
import {
  adoptTranscript,
  coachChatFor,
  setCoachChatRange,
} from "@/lib/coach-chats";
import { coachFeedbackEnabled } from "@/lib/posthog";
import { CoachFeedback } from "@/components/coach/coach-feedback";
import {
  Attachment,
  AttachmentPreview,
  Attachments,
} from "@/components/ai-elements/attachments";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
  Message,
  MessageAction,
  MessageActions,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import { type PromptInputMessage } from "@/components/ai-elements/prompt-input";
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@/components/ai-elements/reasoning";
import { CoachTyping } from "@/components/coach/coach-typing";
import {
  asCoachCard,
  CoachCardView,
  type CardActions,
  type CoachCard,
  type PlanCard,
} from "@/components/coach/coach-cards";
import {
  CoachComposer,
  useMentionLabel,
  type RunMention,
} from "@/components/coach/coach-composer";
import { CoachMessageEdit } from "@/components/coach/coach-message-edit";
import {
  asQuestionnaire,
  CoachQuestionnaire,
  CoachQuestionnaireStatus,
  type QuestionnaireCard,
} from "@/components/coach/coach-questionnaire";
import { CoachSteps } from "@/components/coach/coach-steps";
import { MonoLabel } from "@/components/mono";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * The chips, as catalogue keys.
 *
 * They are keys rather than sentences because these arrays are module-level
 * and `t` is a hook's return value — and because the text is sent to the coach
 * as well as shown on the chip, so the athlete's question reaches the model in
 * the language they asked it in.
 */
const SUGGESTIONS = [
  "coach.suggestions.month",
  "coach.suggestions.planWeek",
  "coach.suggestions.easyTooFast",
  "coach.suggestions.readLongRunSplits",
] as const;

/** Where a conversation goes next, given what the coach just drew. */
const NEXT_QUESTIONS: Record<CoachCard["card"], readonly TranslationKey[]> = {
  "run-debrief": [
    "coach.followUps.readSplitBySplit",
    "coach.suggestions.planWeek",
    "coach.followUps.rampingTooFast",
  ],
  "run-splits": [
    "coach.followUps.whyFade",
    "coach.suggestions.planWeek",
    "coach.followUps.raceToday",
  ],
  "training-volume": [
    "coach.followUps.capNextWeek",
    "coach.suggestions.planWeek",
    "coach.followUps.raceShape",
  ],
  "week-plan": [
    "coach.followUps.missWednesday",
    "coach.followUps.volumeRamp",
    "coach.followUps.raceToday",
  ],
  "race-prediction": [
    "coach.followUps.writeTaper",
    "coach.suggestions.planWeek",
    "coach.followUps.paceSunday",
  ],
};

const DEFAULT_QUESTIONS = [
  "coach.suggestions.planWeek",
  "coach.followUps.readLongRun",
  "coach.followUps.rampingTooFast",
] as const;

/** The tools the API exposes, in catalogue order. A tool absent from this list
 *  falls back to its own name, which is what an older transcript may carry. */
const TOOL_NAMES = [
  "getAthleteProfile",
  "getAthleteContext",
  "setAthleteContext",
  "askAthlete",
  "listRuns",
  "summariseTraining",
  "getRunDebrief",
  "getRunSplits",
  "getTrainingSignals",
  "predictRaces",
  "proposeWeek",
] as const;

type ToolName = (typeof TOOL_NAMES)[number];

function isToolName(value: string): value is ToolName {
  return (TOOL_NAMES as readonly string[]).includes(value);
}

/**
 * The runs attached to a message, in the order the athlete attached them.
 *
 * `run` is read as well as `runs` because it is what every transcript written
 * before a question could carry more than one holds — the same two fields the
 * API reads, for the same reason (`attachedRuns` in apps/api/src/coach.ts).
 */
function mentionsOf(message: UIMessage): RunMention[] {
  const metadata = message.metadata;
  if (typeof metadata !== "object" || metadata === null) return [];
  const { run, runs } = metadata as { run?: RunMention; runs?: RunMention[] };
  const attached = Array.isArray(runs) ? runs : run ? [run] : [];
  return attached.filter((mention) => typeof mention?.id === "number");
}

/**
 * The part an automatically posted debrief travels in.
 *
 * Mirrors DEBRIEF_PART in apps/api/src/debrief.ts. It is a data part rather
 * than a tool part because nothing called a tool: the webhook built the card,
 * and a function call at the head of a thread with no question before it is
 * rejected by the model on the athlete's next message.
 */
const DEBRIEF_PART = "data-runDebrief";

/** The card inside a part, whichever kind of part is carrying it. */
function cardOf(part: UIMessage["parts"][number]): CoachCard | null {
  if (part.type === DEBRIEF_PART) {
    return asCoachCard((part as { data?: unknown }).data);
  }
  if (isToolUIPart(part) && part.state === "output-available") {
    return asCoachCard(part.output);
  }
  return null;
}

/** What a message says, as plain text — what Copy puts on the clipboard and
 *  what the editor opens with. */
function textOf(message: UIMessage): string {
  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("\n\n");
}

/** The tool whose result is a questionnaire. Mirrors `askAthlete` in coach.ts. */
const QUESTIONNAIRE_TOOL = "askAthlete";

/** The questionnaire a message asked, if it asked one. */
function questionnaireOf(message: UIMessage): QuestionnaireCard | null {
  for (const part of message.parts) {
    if (
      isToolUIPart(part) &&
      getToolName(part) === QUESTIONNAIRE_TOOL &&
      part.state === "output-available"
    ) {
      const card = asQuestionnaire(part.output);
      if (card) return card;
    }
  }
  return null;
}

/**
 * Whether a part shows the coach *working* rather than what it concluded.
 *
 * The distinction is what collapses and what doesn't: the steps fold into one
 * row once the turn is over, and the answer — the text, and any card a tool
 * drew — never does. A tool still running is a step too, but it is never
 * collapsed, because nothing collapses while the turn is live.
 */
function isStepPart(part: UIMessage["parts"][number]): boolean {
  if (part.type === "reasoning") return true;
  if (!isToolUIPart(part)) return false;
  if (part.state !== "output-available") return true;
  return asCoachCard(part.output) === null;
}

/** Every card drawn in one message. */
function cardsOf(message: UIMessage): CoachCard[] {
  return message.parts.flatMap((part) => {
    const card = cardOf(part);
    return card ? [card] : [];
  });
}

/**
 * The runs an answer was actually built on.
 *
 * Derived from the tool results rather than asked of the model: a citation the
 * model wrote could be wrong, but a run whose splits it just read cannot be.
 */
function sourcesOf(message: UIMessage, runs: Run[] | undefined): Run[] {
  if (!runs?.length) return [];
  const ids = new Set<number>();
  for (const card of cardsOf(message)) {
    if (card.card === "run-debrief" || card.card === "run-splits") {
      ids.add(card.run_id);
    }
    if (card.card === "race-prediction") {
      for (const effort of card.efforts) ids.add(effort.activity_id);
    }
  }
  return [...ids]
    .map((id) => runs.find((run) => run.id === id))
    .filter((run): run is Run => run !== undefined)
    .slice(0, 4);
}

/**
 * The sentence for each reason the API can give for an unanswered turn — the
 * `CoachFailure` union in `apps/api/src/coach.ts`. A reason the catalogue has
 * never heard of reads as `failed`, so the two can be added in either order.
 */
const FAILURE_COPY = {
  not_configured: "coach.errors.notConfigured",
  rate_limited: "coach.errors.rateLimited",
  unavailable: "coach.errors.unavailable",
  failed: "coach.errors.failed",
} satisfies Record<string, TranslationKey>;

function isFailure(reason: string): reason is keyof typeof FAILURE_COPY {
  return reason in FAILURE_COPY;
}

/**
 * What the athlete is told when a turn produced no answer.
 *
 * Never the error itself. A failed turn arrives here two ways — as the stream's
 * error text, or as the response body, which the chat transport throws verbatim
 * rather than through `@/api`'s interceptor — and both of them carry a reason
 * the API chose. Anything else is a dropped connection or the SDK's own
 * wording, which is a developer's sentence and reads as the generic line; the
 * error the athlete can do nothing about is on the server, in the log.
 */
function failureKey(error: Error): TranslationKey {
  let reason = error.message;
  try {
    const body: unknown = JSON.parse(error.message);
    if (
      typeof body === "object" &&
      body !== null &&
      "error" in body &&
      typeof body.error === "string"
    ) {
      reason = body.error;
    }
  } catch {
    // Not JSON — the stream's error chunk, or a connection that dropped.
  }
  return isFailure(reason) ? FAILURE_COPY[reason] : FAILURE_COPY.failed;
}

/** The PostHog trace an answer was written under, when the API sent one. */
function traceOf(message: UIMessage): string | null {
  const metadata = message.metadata;
  if (
    typeof metadata !== "object" ||
    metadata === null ||
    !("trace_id" in metadata)
  ) {
    return null;
  }
  const traceId = (metadata as { trace_id?: unknown }).trace_id;
  return typeof traceId === "string" && traceId ? traceId : null;
}

function CopyAction({ text }: { text: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  return (
    <MessageAction
      label={t("coach.copy")}
      tooltip={copied ? t("coach.copied") : t("coach.copy")}
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
    </MessageAction>
  );
}

/** The files that travelled with a message, shown above what was said. */
function MessageAttachments({ message }: { message: UIMessage }) {
  const files = message.parts.filter((part) => part.type === "file");
  if (files.length === 0) return null;

  return (
    <Attachments variant="grid">
      {files.map((file, index) => (
        <Attachment
          data={{ ...file, id: `${message.id}-file-${index}` }}
          key={`${message.id}-file-${index}`}
        >
          <AttachmentPreview />
        </Attachment>
      ))}
    </Attachments>
  );
}

/** The runs behind an answer, as chips that open the replay. */
function Sources({
  runs,
  onOpen,
}: {
  runs: Run[];
  onOpen: (run: Run) => void;
}) {
  const { t } = useTranslation();
  const format = useFormatters();
  if (runs.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <MonoLabel className="text-mono-badge mr-1">
        {t("coach.sources")}
      </MonoLabel>
      {runs.map((run) => (
        <Button
          key={run.id}
          onClick={() => onOpen(run)}
          size="xs"
          variant="subtle"
        >
          <span className="bg-brand size-1.5 rounded-full" />
          {format.shortDate(run.start_date_local)} ·{" "}
          {(run.distance / 1000).toFixed(2)} {t("common.km")}
        </Button>
      ))}
    </div>
  );
}

export interface CoachChatProps {
  threadId: string;
  /** The transcript already on the server, loaded before this mounts. */
  initialMessages: UIMessage[];
  /** The athlete's runs, for the `@` picker and the source chips. */
  runs: Run[] | undefined;
  /** The window selected in the thread header. */
  rangeWeeks: number;
  /** The week already accepted, so a plan card knows it is live. */
  acceptedWeek: string | null;
  /** Runs to attach on mount — how "Ask the coach" arrives from a replay. */
  initialMentions?: RunMention[];
  /** Hands the page a way to ask from the rails. */
  registerAsk?: (ask: (text: string, runId?: number) => void) => void;
  /** Opening a run from a source chip or a card. */
  onOpenRun: (runId: number) => void;
}

/**
 * One conversation.
 *
 * The chat itself lives in `@/lib/coach-chats`, not here: this component is a
 * subscription to it, remounted with a `key` of the thread id to switch
 * conversations. Leaving — for another thread, or another page — leaves the
 * conversation and any answer still streaming intact, and coming back picks
 * both up where they got to. Only the message just typed goes up — the
 * transport trims the request to it, and the API reloads the history it
 * already has.
 */
export function CoachChat({
  threadId,
  initialMessages,
  runs,
  rangeWeeks,
  acceptedWeek,
  initialMentions,
  registerAsk,
  onOpenRun,
}: CoachChatProps) {
  const { t } = useTranslation();
  const mentionLabel = useMentionLabel();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");
  const [attached, setAttached] = useState<RunMention[]>(initialMentions ?? []);
  const [pickerOpen, setPickerOpen] = useState(false);
  /** The question being rewritten, if one is — one at a time. */
  const [editingId, setEditingId] = useState<string | null>(null);

  // The runs list is a Strava round trip, so it is often still in flight when
  // the conversation opens and the run "Ask the coach" arrived with lands a
  // moment after this mounted. Taken exactly once, and never over runs the
  // athlete has chosen for themselves since.
  const tookMentions = useRef((initialMentions?.length ?? 0) > 0);
  useEffect(() => {
    if (tookMentions.current || !initialMentions?.length) return;
    tookMentions.current = true;
    setAttached(initialMentions);
  }, [initialMentions]);

  const chat = coachChatFor(threadId, initialMessages);
  const { messages, sendMessage, regenerate, status, stop, error } = useChat({
    chat,
  });

  // The window is read at send time, and sends only come from event handlers,
  // which run after effects — so a send never sees yesterday's selection.
  useEffect(() => {
    setCoachChatRange(threadId, rangeWeeks);
  }, [threadId, rangeWeeks]);

  // A conversation reopened after the webhook wrote into it: the freshly
  // loaded server transcript wins only when it knows strictly more — the live
  // chat is otherwise the newer of the two (see adoptTranscript).
  useEffect(() => {
    adoptTranscript(chat, initialMessages);
  }, [chat, initialMessages]);

  const isBusy = status === "submitted" || status === "streaming";

  /**
   * The questionnaire the coach is waiting on, if it is waiting on one.
   *
   * Only ever the last message's: anything the conversation has moved past is
   * a question the athlete has already answered — in the form, or in prose —
   * and a late submit would patch context they have since contradicted.
   */
  const pending = useMemo(() => {
    const last = messages.at(-1);
    if (last?.role !== "assistant") return null;
    const card = questionnaireOf(last);
    return card ? { messageId: last.id, card } : null;
  }, [messages]);

  /**
   * Whether the form stands where the composer usually does.
   *
   * Not while an answer is arriving: `ask` drops a send mid-turn, so a form
   * that accepted answers then would swallow them without a word.
   */
  const asking = pending && !isBusy ? pending : null;

  const accept = useMutation({
    ...acceptCoachPlanMutation(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: getCoachBriefingQueryKey(),
      });
      toast.success(t("coach.planAccepted"));
    },
    onError: (err) => toast.error(err.error),
  });

  /**
   * Ask something. Everything that can start a turn — the composer, a card
   * button, a signal in the rail, an item in the queue — comes through here, so
   * the attached runs are consumed exactly once wherever the question came from.
   */
  const ask = (text: string, runId?: number) => {
    const trimmed = text.trim();
    if (!trimmed || isBusy) return;
    // A caller that names a run means *that* run and nothing else: a rail
    // asking about last Sunday's long run is not also asking about whatever is
    // sitting in the composer.
    const named = runId ? toMentionFromRuns(runId, runs) : null;
    const mentions = named ? [named] : attached;
    void sendMessage({
      text: trimmed,
      ...(mentions.length > 0 ? { metadata: { runs: mentions } } : {}),
    });
    setDraft("");
    setAttached([]);
    setPickerOpen(false);
    // A question asked from anywhere else settles the one being rewritten:
    // leaving that box open over a message the conversation has moved past
    // would arm it to cut off everything just said.
    setEditingId(null);
  };

  // The rails live outside this component but ask through it.
  useEffect(() => {
    registerAsk?.(ask);
    // `ask` closes over the send function and the attachment, both of which are
    // allowed to change between renders; re-registering is cheap.
  });

  /**
   * Ask the same question again, in different words.
   *
   * `messageId` is what makes this a rewrite rather than a new question: the
   * SDK cuts its transcript back to that message and reuses its id, and the
   * transport passes the id on so the server cuts the stored one to match.
   * Everything the old wording produced goes with it, on both sides.
   */
  const resend = (message: UIMessage, text: string) => {
    if (isBusy) return;
    setEditingId(null);
    void sendMessage({
      text,
      // The attached runs and any files travelled with the original question;
      // only the words are being rewritten, so they travel again.
      files: message.parts.filter((part) => part.type === "file"),
      ...(message.metadata ? { metadata: message.metadata } : {}),
      messageId: message.id,
    });
  };

  const handleSubmit = (message: PromptInputMessage) => {
    if (!message.text.trim() && message.files.length === 0) return;
    void sendMessage({
      text: message.text,
      files: message.files,
      ...(attached.length > 0 ? { metadata: { runs: attached } } : {}),
    });
    setDraft("");
    setAttached([]);
    setEditingId(null);
  };

  /**
   * Whether to show the indicator at the foot of the thread, and what it says.
   *
   * Only for the gaps nothing else covers: a running tool draws its own, and a
   * streaming reasoning block draws the Reasoning component's, so showing one
   * here as well would put two spinners on screen for the same second.
   */
  const { working, workingLabel } = useMemo(() => {
    if (status === "submitted") {
      return { working: true, workingLabel: t("coach.workingReading") };
    }
    if (status !== "streaming") return { working: false, workingLabel: "" };

    const latest = messages.at(-1);
    if (latest?.role !== "assistant") {
      return { working: true, workingLabel: t("coach.workingReading") };
    }

    const covered = latest.parts.some(
      (part) =>
        (part.type === "text" && part.text.length > 0) ||
        (part.type === "reasoning" && part.state === "streaming") ||
        (isToolUIPart(part) &&
          part.state !== "output-available" &&
          part.state !== "output-error"),
    );
    return { working: !covered, workingLabel: t("coach.workingWriting") };
  }, [status, messages, t]);

  // Chips follow the last thing drawn, so the next question is one tap away.
  // Translated here rather than in the tables above, so switching language
  // re-labels the chips that are already on screen.
  const suggestions = useMemo(() => {
    const keys = (() => {
      if (messages.length === 0) return SUGGESTIONS;
      for (let i = messages.length - 1; i >= 0; i--) {
        const card = cardsOf(messages[i]).at(-1);
        if (card) return NEXT_QUESTIONS[card.card];
      }
      return DEFAULT_QUESTIONS;
    })();
    return keys.map((key) => t(key));
  }, [messages, t]);

  const actions: CardActions = {
    onAsk: ask,
    onAcceptPlan: (card: PlanCard) =>
      accept.mutate({
        body: {
          week_starting: card.week_starting,
          label: card.label,
          sessions: card.sessions,
        },
      }),
    accepting: accept.isPending,
    acceptedWeek,
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Conversation>
        {/* The thread scrolls under the header's hairline, which slices a line
            of the answer in half. The canvas fades in over the top instead, so
            what leaves the viewport reads as passing behind it. */}
        <div
          aria-hidden
          className="from-background pointer-events-none absolute inset-x-0 top-0 z-10 h-6 bg-linear-to-b to-transparent"
        />
        <ConversationContent className="mx-auto flex w-full max-w-[760px] flex-col gap-6 px-4 pt-6 pb-4 sm:px-6">
          {messages.length === 0 && (
            // The one place in the app the delight budget is spent. An athlete
            // sees this on their first conversation and each time they start a
            // new one, so it is short and it never blocks the composer below —
            // which is a sibling of this block, live from the first frame.
            //
            // `fill-mode-backwards` is load-bearing: without it the delayed
            // lines paint at full opacity, wait, then snap back to start and
            // animate.
            <div className="flex flex-col items-start gap-4 py-10">
              <span className="bg-brand text-brand-foreground animate-in fade-in-0 zoom-in-95 slide-in-from-bottom-2 flex size-11 items-center justify-center rounded-full duration-300 ease-entrance fill-mode-backwards motion-reduce:animate-none">
                <SparklesIcon className="size-5" />
              </span>
              <h2 className="font-heading text-display-md animate-in fade-in-0 slide-in-from-bottom-2 text-balance delay-75 duration-300 ease-entrance fill-mode-backwards motion-reduce:animate-none">
                {t("coach.emptyTitle")}
              </h2>
              <p className="text-body-lg text-muted-foreground animate-in fade-in-0 slide-in-from-bottom-2 max-w-[460px] delay-150 duration-300 ease-entrance fill-mode-backwards motion-reduce:animate-none">
                {t("coach.emptyBody")}
              </p>
            </div>
          )}

          {messages.map((message, position) => {
            const mentions = mentionsOf(message);
            const sources = sourcesOf(message, runs);
            const editing = editingId === message.id;
            const traceId = traceOf(message);
            const isLast = position === messages.length - 1;

            /** One part, whichever kind it turned out to be. */
            const renderPart = ({
              part,
              key,
            }: {
              part: UIMessage["parts"][number];
              key: string;
            }) => {
              if (part.type === "text") {
                return (
                  <MessageContent key={key}>
                    <MessageResponse>{part.text}</MessageResponse>
                  </MessageContent>
                );
              }

              if (part.type === DEBRIEF_PART) {
                const card = cardOf(part);
                return card ? (
                  <CoachCardView actions={actions} card={card} key={key} />
                ) : null;
              }

              if (part.type === "reasoning") {
                return (
                  <Reasoning isStreaming={part.state === "streaming"} key={key}>
                    <ReasoningTrigger />
                    <ReasoningContent>{part.text}</ReasoningContent>
                  </Reasoning>
                );
              }

              if (isToolUIPart(part)) {
                const name = getToolName(part);
                const title = isToolName(name)
                  ? t(`coach.tools.${name}`)
                  : name;

                if (part.state === "output-error") {
                  // `errorText` is whatever the tool threw — a stack's worth of
                  // Strava SDK wording, written for us and not for the athlete.
                  // The API logs it; this says which tool it was.
                  return (
                    <p className="text-caption text-destructive" key={key}>
                      {t("coach.toolFailed", { title })}
                    </p>
                  );
                }

                if (part.state !== "output-available") {
                  return <CoachTyping key={key} label={title} />;
                }

                // The questions themselves are in the composer, or they have
                // been answered and the answers are the message below. Either
                // way what belongs in the transcript is one line saying so.
                if (
                  name === QUESTIONNAIRE_TOOL &&
                  asQuestionnaire(part.output)
                ) {
                  return (
                    <CoachQuestionnaireStatus
                      answered={pending?.messageId !== message.id}
                      key={key}
                    />
                  );
                }

                const card = asCoachCard(part.output);
                if (card) {
                  return (
                    <CoachCardView actions={actions} card={card} key={key} />
                  );
                }

                // A tool that reads rather than draws: the answer below is the
                // output, so this is only a note that it was read.
                const failure =
                  typeof part.output === "object" &&
                  part.output !== null &&
                  "error" in part.output
                    ? String((part.output as { error: unknown }).error)
                    : null;

                return (
                  <p
                    className={cn(
                      "text-mono-badge font-mono uppercase",
                      failure ? "text-destructive" : "text-stone",
                    )}
                    key={key}
                  >
                    {failure ?? title}
                  </p>
                );
              }

              return null;
            };

            // Keys come off the original position, so filtering the list into
            // working and answer doesn't renumber either half.
            const parts = message.parts.map((part, index) => ({
              part,
              key: `${message.id}-${index}`,
            }));
            const steps = parts.filter(({ part }) => isStepPart(part));
            const answer = parts.filter(({ part }) => !isStepPart(part));

            /**
             * Fold the working away once it is working no longer.
             *
             * Never while the turn is live — the steps are the only evidence
             * anything is happening — and never while a questionnaire is
             * waiting, because its "awaiting your answer" line is the label on
             * the form standing in the composer.
             */
            const collapsed =
              steps.length > 0 &&
              !(isBusy && isLast) &&
              !(isLast && pending?.messageId === message.id);

            return (
              <Message from={message.role} key={message.id}>
                {/* Wrapping, and still ending at the athlete's edge: a
                    question can name five runs, and five chips on one line
                    would run off the side of a phone. */}
                {mentions.length > 0 && message.role === "user" && (
                  <div className="flex flex-wrap justify-end gap-1.5 self-end">
                    {mentions.map((mention) => (
                      <span
                        className="bg-brand/15 text-brand text-mono-badge inline-flex h-7 max-w-full items-center gap-2 rounded-full px-3 font-mono uppercase"
                        key={mention.id}
                      >
                        <span className="truncate">
                          @ {mentionLabel(mention)}
                        </span>
                      </span>
                    ))}
                  </div>
                )}

                <MessageAttachments message={message} />

                {editing && (
                  <CoachMessageEdit
                    onCancel={() => setEditingId(null)}
                    onSubmit={(text) => resend(message, text)}
                    text={textOf(message)}
                  />
                )}

                {!editing && (
                  <>
                    {steps.length > 0 &&
                      (collapsed ? (
                        <CoachSteps count={steps.length}>
                          {steps.map(renderPart)}
                        </CoachSteps>
                      ) : (
                        steps.map(renderPart)
                      ))}
                    {answer.map(renderPart)}
                  </>
                )}

                {/* Copy and rewrite, on the athlete's own turn. Hidden while
                    an answer is arriving for the same reason the coach's own
                    row is: rewriting a question mid-answer would throw away
                    the one being written. */}
                {message.role === "user" && !editing && !isBusy && (
                  <MessageActions>
                    <CopyAction text={textOf(message)} />
                    <MessageAction
                      label={t("coach.edit")}
                      onClick={() => setEditingId(message.id)}
                      tooltip={t("coach.edit")}
                    >
                      <PencilIcon />
                    </MessageAction>
                  </MessageActions>
                )}

                {message.role === "assistant" &&
                  !isBusy &&
                  (() => {
                    // Copy and try again either sit in a plain row, or in the
                    // one the thumbs own — the follow-up they open has to be a
                    // sibling of the row rather than inside it, because the row
                    // itself is only visible on hover.
                    const actions = (
                      <>
                        <CopyAction text={textOf(message)} />
                        <MessageAction
                          label={t("coach.tryAgain")}
                          onClick={() => regenerate({ messageId: message.id })}
                          tooltip={t("coach.tryAgain")}
                        >
                          <RefreshCcwIcon />
                        </MessageAction>
                      </>
                    );

                    return (
                      <>
                        <Sources
                          onOpen={(run) => onOpenRun(run.id)}
                          runs={sources}
                        />
                        {coachFeedbackEnabled && traceId ? (
                          <CoachFeedback
                            countAsSeen={message.id === messages.at(-1)?.id}
                            key={traceId}
                            traceId={traceId}
                          >
                            {actions}
                          </CoachFeedback>
                        ) : (
                          <MessageActions>{actions}</MessageActions>
                        )}
                      </>
                    );
                  })()}
              </Message>
            );
          })}

          {/* Every silent moment of the turn is accounted for: the wait before
              anything arrives, and the gap between a tool finishing and the
              first token. In-flight tools carry their own indicator inline, and
              a streaming reasoning block carries the Reasoning component's. */}
          {working && <CoachTyping label={workingLabel} />}

          {error && (
            <Alert variant="destructive">
              <AlertTitle>{t("coach.errorTitle")}</AlertTitle>
              <AlertDescription>{t(failureKey(error))}</AlertDescription>
            </Alert>
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div className="mx-auto w-full max-w-[760px] shrink-0 px-4 pb-4 sm:px-6 sm:pb-6">
        {/* The coach's turn to ask takes the athlete's place to type. It is the
            one spot on the screen that already means "your move", and the
            questions leave it the moment they are answered — keyed by the
            message that asked, so a second questionnaire is a fresh form and
            not the last one with new words in it. */}
        {asking ? (
          <CoachQuestionnaire
            card={asking.card}
            key={asking.messageId}
            onAnswer={ask}
          />
        ) : (
          <CoachComposer
            attached={attached}
            draft={draft}
            onAsk={ask}
            onAttach={setAttached}
            onDraftChange={setDraft}
            onPickerOpenChange={setPickerOpen}
            onStop={stop}
            onSubmit={handleSubmit}
            pickerOpen={pickerOpen}
            runs={runs}
            status={status}
            suggestions={suggestions}
          />
        )}
      </div>
    </div>
  );
}

/** The mention for a run id, when a card or a rail names one. */
function toMentionFromRuns(
  runId: number,
  runs: Run[] | undefined,
): RunMention | null {
  const run = runs?.find((candidate) => candidate.id === runId);
  return run
    ? { id: run.id, name: run.name, date: run.start_date_local.slice(0, 10) }
    : null;
}
