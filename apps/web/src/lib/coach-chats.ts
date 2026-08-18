// Coach conversations that outlive their component.
//
// `useChat` builds a throwaway chat per mount, so switching threads — or
// leaving the Coach page entirely — dropped the live transcript, and an answer
// still streaming kept arriving into an instance nothing could see again. The
// instances live here instead, keyed by thread id: leaving a conversation
// leaves its stream running, and coming back finds the transcript exactly
// where it got to, still arriving if the coach is mid-answer.
import { Chat } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  getToolName,
  isToolUIPart,
  type UIMessage,
} from "ai";
import {
  COACH_CHAT_PATH,
  getCoachBriefingQueryKey,
  listCoachThreadsQueryKey,
} from "@/api";
import { currentLocale } from "@/i18n";
import { trackError } from "@/lib/logger";
import { replaySessionId } from "@/lib/posthog";
import { queryClient } from "@/lib/query-client";

/** RANGES[0] on the Coach page — what a send uses before the header has said
 *  otherwise, which can't happen: sends come from event handlers, and the
 *  page's effect has set the real value by then. */
const DEFAULT_RANGE_WEEKS = 6;

interface CoachChatEntry {
  chat: Chat<UIMessage>;
  /** Mutable on purpose: the transport reads it at send time, so the window
   *  picked in the thread header applies to a chat built before it was. */
  options: { rangeWeeks: number };
}

/** One entry per conversation opened this session — bounded by the thread
 *  list, and small: a transcript is text and card JSON. */
const entries = new Map<string, CoachChatEntry>();

/** The tool the coach stores a goal race, a target time or a long-run day
 *  through. Mirrors `setAthleteContext` in apps/api/src/coach.ts. */
const CONTEXT_TOOL = "setAthleteContext";

/**
 * Whether a turn changed what the briefing says.
 *
 * The goal race the rail draws — and the card on the home page — comes from
 * `GET /api/coach/briefing`, which is cached for a minute like every other
 * query. So a race the coach had just been told about was written to the
 * database and then read back from a snapshot taken before it existed: the
 * athlete answered "which race?", the coach confirmed it in prose, and the
 * panel beside the answer still said no goal race was set. A turn that called
 * the tool is exactly the moment that snapshot became wrong.
 *
 * Read off the tool part rather than the coach's words, for the same reason
 * the citations are: what it says it saved could be wrong, what it saved
 * cannot. A call that failed leaves the part in `output-error`, and nothing
 * was stored.
 */
export function wroteAthleteContext(message: UIMessage): boolean {
  return message.parts.some(
    (part) =>
      isToolUIPart(part) &&
      getToolName(part) === CONTEXT_TOOL &&
      part.state === "output-available",
  );
}

/**
 * PostHog's own header name for the replay in progress. The API reads it off
 * the coach turn and hangs it on every LLM event the answer produces, so a
 * trace in AI observability links back to the session it came from.
 *
 * Empty when PostHog is off, which is a fresh clone and every test run.
 */
function sessionHeader(): Record<string, string> {
  const session = replaySessionId();
  return session ? { "X-POSTHOG-SESSION-ID": session } : {};
}

function createEntry(
  threadId: string,
  initialMessages: UIMessage[],
): CoachChatEntry {
  const options = { rangeWeeks: DEFAULT_RANGE_WEEKS };

  const chat = new Chat<UIMessage>({
    id: threadId,
    messages: initialMessages,
    transport: new DefaultChatTransport({
      api: COACH_CHAT_PATH,
      // Same-origin in dev via the Vite proxy, but the session cookie has to be
      // asked for explicitly all the same.
      credentials: "include",
      prepareSendMessagesRequest: ({ id, messages, trigger, messageId }) => ({
        // Read per request, not once at creation: a replay rotates, and a trace
        // pointing at yesterday's session is worse than one pointing at none.
        // The API reads it as `$session_id` on the turn's LLM events, which is
        // what makes a slow answer watchable — see ai-observability.ts.
        //
        // What is returned here replaces the transport's own headers, which is
        // safe because it sets none — `Content-Type` is the SDK's own and is
        // added after this.
        headers: sessionHeader(),
        body:
          trigger === "regenerate-message"
            ? {
                thread_id: id,
                trigger,
                message_id: messageId,
                range_weeks: options.rangeWeeks,
                // Read per request for the same reason as the window: the
                // toggle in the header can move between a chat being created
                // and a message being sent.
                language: currentLocale(),
              }
            : {
                thread_id: id,
                trigger,
                message: messages.at(-1),
                // Set only when the athlete rewrote a question already in the
                // conversation. The SDK has cut its own transcript back to it
                // and reused its id; naming it here is what has the server cut
                // the stored one to the same place instead of appending a
                // second copy of the question.
                ...(messageId ? { message_id: messageId } : {}),
                range_weeks: options.rangeWeeks,
                language: currentLocale(),
              },
      }),
    }),
    // The first message names the thread and every message reorders the list.
    // Invalidated here rather than in the component because a finish can now
    // land while another screen is open.
    onFinish: ({ message }) => {
      void queryClient.invalidateQueries({
        queryKey: listCoachThreadsQueryKey(),
      });
      // And the briefing, but only when the turn actually wrote what the
      // briefing reads: it is a Strava round trip and four stored reads
      // (buildBriefing), and most answers change nothing it shows.
      if (wroteAthleteContext(message)) {
        void queryClient.invalidateQueries({
          queryKey: getCoachBriefingQueryKey(),
        });
      }
    },
    // The chat sits outside React Query, so the cache-level logger in
    // @/lib/query-client never sees this one. A stream that dies on the way to
    // the browser leaves no server line either — this is the only report.
    onError: (err) => trackError("coach.chat_failed", err, { threadId }),
  });

  const entry = { chat, options };
  entries.set(threadId, entry);
  return entry;
}

/**
 * The chat for a conversation, created from the stored transcript the first
 * time the thread is opened this session and reused ever after.
 */
export function coachChatFor(
  threadId: string,
  initialMessages: UIMessage[],
): Chat<UIMessage> {
  return (entries.get(threadId) ?? createEntry(threadId, initialMessages)).chat;
}

/** Points the thread's next send at the window selected in its header. */
export function setCoachChatRange(threadId: string, rangeWeeks: number): void {
  const entry = entries.get(threadId);
  if (entry) entry.options.rangeWeeks = rangeWeeks;
}

/**
 * Folds a freshly loaded server transcript into a chat that already exists —
 * how a debrief the webhook posted while the conversation was closed shows up
 * on return.
 *
 * Only when the server knows strictly more: while an answer is streaming the
 * live instance is ahead of anything stored, and even at rest React Query may
 * hand back a snapshot cached from before the last answer — same length or
 * shorter always means the instance is the truth.
 */
export function adoptTranscript(
  chat: Chat<UIMessage>,
  serverMessages: UIMessage[],
): void {
  if (chat.status !== "ready") return;
  if (serverMessages.length > chat.messages.length) {
    chat.messages = serverMessages;
  }
}

/** Deleting a thread deletes its conversation — stop anything still arriving
 *  and let the instance go. */
export function disposeCoachChat(threadId: string): void {
  const entry = entries.get(threadId);
  if (!entry) return;
  entries.delete(threadId);
  void entry.chat.stop();
}
