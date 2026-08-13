import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useChat } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  getToolName,
  isToolUIPart,
  type UIMessage,
} from "ai";
import { CheckIcon, CopyIcon, RefreshCcwIcon, SparklesIcon } from "lucide-react";
import { toast } from "sonner";
import {
  acceptCoachPlanMutation,
  COACH_CHAT_PATH,
  getCoachBriefingQueryKey,
  listCoachThreadsQueryKey,
  type Run,
} from "@/api";
import { trackError } from "@/lib/logger";
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
  mentionLabel,
  type RunMention,
} from "@/components/coach/coach-composer";
import { MonoLabel } from "@/components/mono";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Openers for a thread with nothing in it yet. */
const SUGGESTIONS = [
  "How has my training looked over the last month?",
  "Plan my week",
  "Are my easy runs too fast?",
  "Read my last long run split by split",
];

/** Where a conversation goes next, given what the coach just drew. */
const NEXT_QUESTIONS: Record<CoachCard["card"], string[]> = {
  "run-debrief": ["Read it split by split", "Plan my week", "Am I ramping too fast?"],
  "run-splits": ["Why did I fade?", "Plan my week", "What could I race today?"],
  "training-volume": ["Cap next week", "Plan my week", "Am I in race shape?"],
  "week-plan": [
    "What if I miss Wednesday?",
    "Show me my volume ramp",
    "What could I race today?",
  ],
  "race-prediction": ["Write my taper", "Plan my week", "What pace for Sunday?"],
};

const DEFAULT_QUESTIONS = [
  "Plan my week",
  "Read my last long run",
  "Am I ramping too fast?",
];

/** What the coach is doing while it is doing it. */
const TOOL_TITLES: Record<string, string> = {
  getAthleteProfile: "Reading your profile",
  getAthleteContext: "Checking what you're training for",
  setAthleteContext: "Remembering that",
  listRuns: "Reading your recent runs",
  summariseTraining: "Adding up your weeks",
  getRunDebrief: "Reading that run",
  getRunSplits: "Reading it split by split",
  getTrainingSignals: "Measuring your training",
  predictRaces: "Reading your best efforts",
  proposeWeek: "Writing your week",
};

/** The run attached to a message, if the athlete attached one. */
function mentionOf(message: UIMessage): RunMention | null {
  const metadata = message.metadata;
  if (typeof metadata !== "object" || metadata === null || !("run" in metadata)) {
    return null;
  }
  const run = (metadata as { run?: RunMention }).run;
  return run && typeof run.id === "number" ? run : null;
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
 * The chat transport throws the response body verbatim, which for this API is
 * the `ApiError` JSON — so a missing key would otherwise reach the athlete as
 * `{"error":"The coach is not configured…"}`. `@/api`'s interceptor unwraps this
 * for the generated client; the stream doesn't go through it.
 */
function readableError(error: Error): string {
  try {
    const body: unknown = JSON.parse(error.message);
    if (
      typeof body === "object" &&
      body !== null &&
      "error" in body &&
      typeof body.error === "string"
    ) {
      return body.error;
    }
  } catch {
    // Not JSON — a dropped connection, or the SDK's own message.
  }
  return error.message;
}

function CopyAction({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <MessageAction
      label="Copy"
      tooltip={copied ? "Copied" : "Copy"}
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
  if (runs.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <MonoLabel className="text-mono-badge mr-1">From</MonoLabel>
      {runs.map((run) => (
        <Button
          key={run.id}
          onClick={() => onOpen(run)}
          size="xs"
          variant="subtle"
        >
          <span className="bg-brand size-1.5 rounded-full" />
          {new Intl.DateTimeFormat("en-US", {
            month: "short",
            day: "numeric",
            timeZone: "UTC",
          }).format(new Date(run.start_date_local))}{" "}
          · {(run.distance / 1000).toFixed(2)} km
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
  /** A run to attach on mount — how "Ask the coach" arrives from a replay. */
  initialMention?: RunMention | null;
  /** Hands the page a way to ask from the rails. */
  registerAsk?: (ask: (text: string, runId?: number) => void) => void;
  /** Opening a run from a source chip or a card. */
  onOpenRun: (runId: number) => void;
}

/**
 * One conversation.
 *
 * `useChat` owns the live transcript; the server owns the stored one. Only the
 * message just typed goes up — `prepareSendMessagesRequest` trims the request
 * to it, and the API reloads the history it already has. Remount this with a
 * `key` of the thread id to switch conversations.
 */
export function CoachChat({
  threadId,
  initialMessages,
  runs,
  rangeWeeks,
  acceptedWeek,
  initialMention = null,
  registerAsk,
  onOpenRun,
}: CoachChatProps) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");
  const [attached, setAttached] = useState<RunMention | null>(initialMention);
  const [pickerOpen, setPickerOpen] = useState(false);

  const { messages, sendMessage, regenerate, status, stop, error } = useChat({
    id: threadId,
    messages: initialMessages,
    transport: new DefaultChatTransport({
      api: COACH_CHAT_PATH,
      // Same-origin in dev via the Vite proxy, but the session cookie has to be
      // asked for explicitly all the same.
      credentials: "include",
      prepareSendMessagesRequest: ({ id, messages, trigger, messageId }) =>
        trigger === "regenerate-message"
          ? {
              body: {
                thread_id: id,
                trigger,
                message_id: messageId,
                range_weeks: rangeWeeks,
              },
            }
          : {
              body: {
                thread_id: id,
                trigger,
                message: messages.at(-1),
                range_weeks: rangeWeeks,
              },
            },
    }),
    // The first message names the thread and every message reorders the list.
    onFinish: () =>
      queryClient.invalidateQueries({ queryKey: listCoachThreadsQueryKey() }),
    // useChat sits outside React Query, so the cache-level logger in
    // @/lib/query-client never sees this one. A stream that dies on the way to
    // the browser leaves no server line either — this is the only report.
    onError: (err) => trackError("coach.chat_failed", err, { threadId }),
  });

  const isBusy = status === "submitted" || status === "streaming";

  const accept = useMutation({
    ...acceptCoachPlanMutation(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: getCoachBriefingQueryKey() });
      toast.success("That's your week. It's in the rail now.");
    },
    onError: (err) => toast.error(err.error),
  });

  /**
   * Ask something. Everything that can start a turn — the composer, a card
   * button, a signal in the rail, an item in the queue — comes through here, so
   * an attached run is consumed exactly once wherever the question came from.
   */
  const ask = (text: string, runId?: number) => {
    const trimmed = text.trim();
    if (!trimmed || isBusy) return;
    const mention =
      (runId ? toMentionFromRuns(runId, runs) : null) ?? attached ?? null;
    void sendMessage({
      text: trimmed,
      ...(mention ? { metadata: { run: mention } } : {}),
    });
    setDraft("");
    setAttached(null);
    setPickerOpen(false);
  };

  // The rails live outside this component but ask through it.
  useEffect(() => {
    registerAsk?.(ask);
    // `ask` closes over the send function and the attachment, both of which are
    // allowed to change between renders; re-registering is cheap.
  });

  const handleSubmit = (message: PromptInputMessage) => {
    if (!message.text.trim() && message.files.length === 0) return;
    void sendMessage({
      text: message.text,
      files: message.files,
      ...(attached ? { metadata: { run: attached } } : {}),
    });
    setDraft("");
    setAttached(null);
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
      return { working: true, workingLabel: "Reading your Strava history" };
    }
    if (status !== "streaming") return { working: false, workingLabel: "" };

    const latest = messages.at(-1);
    if (latest?.role !== "assistant") {
      return { working: true, workingLabel: "Reading your Strava history" };
    }

    const covered = latest.parts.some(
      (part) =>
        (part.type === "text" && part.text.length > 0) ||
        (part.type === "reasoning" && part.state === "streaming") ||
        (isToolUIPart(part) &&
          part.state !== "output-available" &&
          part.state !== "output-error"),
    );
    return { working: !covered, workingLabel: "Writing" };
  }, [status, messages]);

  // Chips follow the last thing drawn, so the next question is one tap away.
  const suggestions = useMemo(() => {
    if (messages.length === 0) return SUGGESTIONS;
    for (let i = messages.length - 1; i >= 0; i--) {
      const card = cardsOf(messages[i]).at(-1);
      if (card) return NEXT_QUESTIONS[card.card];
    }
    return DEFAULT_QUESTIONS;
  }, [messages]);

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
        <ConversationContent className="mx-auto flex w-full max-w-[760px] flex-col gap-7 px-1 py-6">
          {messages.length === 0 && (
            <div className="flex flex-col items-start gap-4 py-10">
              <span className="bg-brand text-brand-foreground flex size-11 items-center justify-center rounded-full">
                <SparklesIcon className="size-5" />
              </span>
              <h2 className="font-heading text-display-md text-balance">
                What are we training for?
              </h2>
              <p className="text-body-lg text-muted-foreground max-w-[460px]">
                Ask for a plan, a taper, or an honest read on last week. I can
                see every run you&rsquo;ve synced from Strava.
              </p>
            </div>
          )}

          {messages.map((message) => {
            const mention = mentionOf(message);
            const sources = sourcesOf(message, runs);

            return (
              <Message from={message.role} key={message.id}>
                {mention && message.role === "user" && (
                  <span className="bg-brand/15 text-brand text-mono-badge inline-flex h-7 items-center gap-2 self-end rounded-full px-3 font-mono uppercase">
                    @ {mentionLabel(mention)}
                  </span>
                )}

                <MessageAttachments message={message} />

                {message.parts.map((part, index) => {
                  const key = `${message.id}-${index}`;

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
                      <Reasoning
                        isStreaming={part.state === "streaming"}
                        key={key}
                      >
                        <ReasoningTrigger />
                        <ReasoningContent>{part.text}</ReasoningContent>
                      </Reasoning>
                    );
                  }

                  if (isToolUIPart(part)) {
                    const name = getToolName(part);
                    const title = TOOL_TITLES[name] ?? name;

                    if (part.state === "output-error") {
                      return (
                        <p className="text-caption text-destructive" key={key}>
                          {title} failed: {part.errorText}
                        </p>
                      );
                    }

                    if (part.state !== "output-available") {
                      return <CoachTyping key={key} label={title} />;
                    }

                    const card = asCoachCard(part.output);
                    if (card) {
                      return (
                        <CoachCardView actions={actions} card={card} key={key} />
                      );
                    }

                    // A tool that reads rather than draws: the answer below is
                    // the output, so this is only a note that it was read.
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
                })}

                {message.role === "assistant" && !isBusy && (
                  <>
                    <Sources
                      onOpen={(run) => onOpenRun(run.id)}
                      runs={sources}
                    />
                    <MessageActions>
                      <CopyAction
                        text={message.parts
                          .filter((part) => part.type === "text")
                          .map((part) => part.text)
                          .join("\n\n")}
                      />
                      <MessageAction
                        label="Try again"
                        onClick={() => regenerate({ messageId: message.id })}
                        tooltip="Try again"
                      >
                        <RefreshCcwIcon />
                      </MessageAction>
                    </MessageActions>
                  </>
                )}
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
              <AlertTitle>The coach could not answer</AlertTitle>
              <AlertDescription>{readableError(error)}</AlertDescription>
            </Alert>
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div className="mx-auto w-full max-w-[760px] shrink-0 px-1 pb-6">
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

        <MonoLabel className="mt-3 block">
          Grounded in your Strava history · check anything that matters
        </MonoLabel>
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
