import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useChat } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  getToolName,
  isToolUIPart,
  type UIMessage,
} from "ai";
import { CheckIcon, CopyIcon, RefreshCcwIcon, SparklesIcon } from "lucide-react";
import { toast } from "sonner";
import { COACH_CHAT_PATH, listCoachThreadsQueryKey } from "@/api";
import {
  Attachment,
  AttachmentInfo,
  AttachmentPreview,
  AttachmentRemove,
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
import {
  PromptInput,
  PromptInputActionAddAttachments,
  PromptInputActionMenu,
  PromptInputActionMenuContent,
  PromptInputActionMenuTrigger,
  PromptInputBody,
  PromptInputFooter,
  PromptInputHeader,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  usePromptInputAttachments,
  type PromptInputMessage,
} from "@/components/ai-elements/prompt-input";
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@/components/ai-elements/reasoning";
import { Shimmer } from "@/components/ai-elements/shimmer";
import {
  Suggestion,
  Suggestions,
} from "@/components/ai-elements/suggestion";
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from "@/components/ai-elements/tool";
import { MonoLabel } from "@/components/mono";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

/** Openers for a thread with nothing in it yet. */
const SUGGESTIONS = [
  "How has my training looked over the last month?",
  "Build me a 12-week half marathon plan",
  "Are my easy runs too fast?",
  "Read my last long run split by split",
];

/** Gemini takes images and PDFs; anything else would just cost tokens. */
const ACCEPTED_FILES = "image/*,application/pdf";
const MAX_FILE_SIZE = 8 * 1024 * 1024;
const MAX_FILES = 4;

/** What the coach is doing while it is doing it, for the tool header. */
const TOOL_TITLES: Record<string, string> = {
  getAthleteProfile: "Reading your profile",
  listRuns: "Reading your recent runs",
  summariseTraining: "Adding up your weeks",
  getRunSplits: "Reading that run split by split",
};

/** The attachments queued in the composer, above the textarea. */
function ComposerAttachments() {
  const attachments = usePromptInputAttachments();
  if (attachments.files.length === 0) return null;

  return (
    <PromptInputHeader>
      <Attachments variant="inline">
        {attachments.files.map((file) => (
          <Attachment
            data={file}
            key={file.id}
            onRemove={() => attachments.remove(file.id)}
          >
            <AttachmentPreview />
            <AttachmentInfo />
            <AttachmentRemove />
          </Attachment>
        ))}
      </Attachments>
    </PromptInputHeader>
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

export interface CoachChatProps {
  threadId: string;
  /** The transcript already on the server, loaded before this mounts. */
  initialMessages: UIMessage[];
}

/**
 * One conversation.
 *
 * `useChat` owns the live transcript; the server owns the stored one. Only the
 * message just typed goes up — `prepareSendMessagesRequest` trims the request
 * to it, and the API reloads the history it already has. Remount this with a
 * `key` of the thread id to switch conversations.
 */
export function CoachChat({ threadId, initialMessages }: CoachChatProps) {
  const queryClient = useQueryClient();

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
          ? { body: { thread_id: id, trigger, message_id: messageId } }
          : { body: { thread_id: id, trigger, message: messages.at(-1) } },
    }),
    // The first message names the thread and every message reorders the list.
    onFinish: () =>
      queryClient.invalidateQueries({ queryKey: listCoachThreadsQueryKey() }),
  });

  const isBusy = status === "submitted" || status === "streaming";

  const handleSubmit = async (message: PromptInputMessage) => {
    if (!message.text.trim() && message.files.length === 0) return;
    await sendMessage({ text: message.text, files: message.files });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Conversation>
        <ConversationContent className="mx-auto w-full max-w-[760px] gap-7 px-1 py-6">
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

          {messages.map((message) => (
            <Message from={message.role} key={message.id}>
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
                  return (
                    <Tool key={key}>
                      <ToolHeader
                        state={part.state}
                        title={TOOL_TITLES[name] ?? name}
                        type={part.type}
                      />
                      <ToolContent>
                        <ToolInput input={part.input} />
                        <ToolOutput
                          errorText={part.errorText}
                          output={part.output}
                        />
                      </ToolContent>
                    </Tool>
                  );
                }

                return null;
              })}

              {message.role === "assistant" && !isBusy && (
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
              )}
            </Message>
          ))}

          {/* Nothing has streamed back yet — say so rather than sit blank. */}
          {status === "submitted" && (
            <Shimmer className="text-body-sm">Reading your training…</Shimmer>
          )}

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
        {messages.length === 0 && (
          <Suggestions className="mb-3">
            {SUGGESTIONS.map((suggestion) => (
              <Suggestion
                key={suggestion}
                onClick={(text) => sendMessage({ text })}
                suggestion={suggestion}
              />
            ))}
          </Suggestions>
        )}

        <PromptInput
          accept={ACCEPTED_FILES}
          globalDrop
          maxFileSize={MAX_FILE_SIZE}
          maxFiles={MAX_FILES}
          multiple
          onError={(err) => toast.error(err.message)}
          onSubmit={handleSubmit}
        >
          <ComposerAttachments />
          <PromptInputBody>
            <PromptInputTextarea disabled={isBusy} />
          </PromptInputBody>
          <PromptInputFooter>
            <PromptInputTools>
              <PromptInputActionMenu>
                <PromptInputActionMenuTrigger tooltip="Attach" />
                <PromptInputActionMenuContent>
                  <PromptInputActionAddAttachments />
                </PromptInputActionMenuContent>
              </PromptInputActionMenu>
            </PromptInputTools>
            <PromptInputSubmit onStop={stop} status={status} />
          </PromptInputFooter>
        </PromptInput>

        <MonoLabel className="mt-3 block">
          Grounded in your Strava history · check anything that matters
        </MonoLabel>
      </div>
    </div>
  );
}
