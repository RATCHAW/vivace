// The composer, shaped like the questions runners actually ask.
//
// Three things the plain box didn't have: `@` attaches a run so "why did I
// fade?" names a session instead of hoping the model picks the right one, `/`
// opens the handful of questions asked over and over, and the chips underneath
// follow whatever the coach just drew.
import { useMemo } from "react";
import { AtSignIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import type { ChatStatus } from "ai";
import type { Run } from "@/api";
import {
  PromptInput,
  PromptInputActionAddAttachments,
  PromptInputActionMenu,
  PromptInputActionMenuContent,
  PromptInputActionMenuTrigger,
  PromptInputBody,
  PromptInputButton,
  PromptInputFooter,
  PromptInputHeader,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  usePromptInputAttachments,
  type PromptInputMessage,
} from "@/components/ai-elements/prompt-input";
import {
  Attachment,
  AttachmentInfo,
  AttachmentPreview,
  AttachmentRemove,
  Attachments,
} from "@/components/ai-elements/attachments";
import {
  Suggestion,
  Suggestions,
} from "@/components/ai-elements/suggestion";
import { MonoLabel } from "@/components/mono";
import { formatPace } from "@/remotion/run-video/data";
import { cn } from "@/lib/utils";

/** Gemini takes images and PDFs; anything else would just cost tokens. */
const ACCEPTED_FILES = "image/*,application/pdf";
const MAX_FILE_SIZE = 8 * 1024 * 1024;
const MAX_FILES = 4;

/** How many recent runs the `@` picker offers before you have to scroll. */
const PICKER_RUNS = 8;

/** The five questions worth a keystroke. */
export const SLASH_COMMANDS = [
  { name: "/week", desc: "Write the next seven days", ask: "Plan my week" },
  {
    name: "/review",
    desc: "Read my last long run split by split",
    ask: "Read my last long run split by split",
  },
  {
    name: "/race",
    desc: "Predict my races from best efforts",
    ask: "What could I race today?",
  },
  {
    name: "/load",
    desc: "Check my volume ramp and load ratio",
    ask: "Am I ramping too fast?",
  },
  {
    name: "/goal",
    desc: "Set or change the goal race",
    ask: "I want to change my goal race",
  },
] as const;

/** The run a message is about, as the chip renders it. */
export interface RunMention {
  id: number;
  name: string;
  /** `YYYY-MM-DD` — the run's own local day. */
  date: string;
}

/** `Aug 5 · 15.02 km` — how a run reads in a chip or a picker row. */
export function runLabel(run: Run): string {
  const date = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(run.start_date_local));
  return `${date} · ${(run.distance / 1000).toFixed(2)} km`;
}

export function toMention(run: Run): RunMention {
  return { id: run.id, name: run.name, date: run.start_date_local.slice(0, 10) };
}

/** `Aug 5` from a mention's stored date, without re-reading the run. */
export function mentionLabel(mention: RunMention): string {
  return `${mention.name} · ${new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${mention.date}T00:00:00Z`))}`;
}

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

export interface CoachComposerProps {
  runs: Run[] | undefined;
  draft: string;
  onDraftChange: (draft: string) => void;
  attached: RunMention | null;
  onAttach: (mention: RunMention | null) => void;
  pickerOpen: boolean;
  onPickerOpenChange: (open: boolean) => void;
  onSubmit: (message: PromptInputMessage) => void;
  onAsk: (text: string) => void;
  suggestions: string[];
  status: ChatStatus;
  onStop: () => void;
}

export function CoachComposer({
  runs,
  draft,
  onDraftChange,
  attached,
  onAttach,
  pickerOpen,
  onPickerOpenChange,
  onSubmit,
  onAsk,
  suggestions,
  status,
  onStop,
}: CoachComposerProps) {
  const isBusy = status === "submitted" || status === "streaming";

  // `/lo` narrows to /load; a bare `/` shows the lot.
  const commands = useMemo(() => {
    const typed = draft.trim();
    if (!typed.startsWith("/")) return [];
    return SLASH_COMMANDS.filter((command) =>
      command.name.startsWith(typed.split(/\s/)[0]),
    );
  }, [draft]);

  return (
    <div className="flex flex-col gap-3">
      {commands.length > 0 && (
        <ul className="border-border bg-card overflow-hidden rounded-md border">
          {commands.map((command) => (
            <li className="border-border border-t first:border-t-0" key={command.name}>
              <button
                className="hover:bg-muted focus-visible:ring-ring/50 flex w-full items-center gap-3.5 px-4 py-2.5 text-left outline-none focus-visible:ring-3 focus-visible:ring-inset"
                onClick={() => {
                  onDraftChange("");
                  onAsk(command.ask);
                }}
                type="button"
              >
                <span className="text-caption text-brand w-16 font-mono">
                  {command.name}
                </span>
                <span className="text-caption text-muted-foreground">
                  {command.desc}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {pickerOpen && (
        <div className="border-border bg-card max-h-52 overflow-y-auto rounded-md border">
          {runs?.length ? (
            <ul>
              {runs.slice(0, PICKER_RUNS).map((run) => (
                <li className="border-border border-t first:border-t-0" key={run.id}>
                  <button
                    className="hover:bg-muted focus-visible:ring-ring/50 flex w-full items-center gap-3.5 px-4 py-2.5 text-left outline-none focus-visible:ring-3 focus-visible:ring-inset"
                    onClick={() => {
                      onAttach(toMention(run));
                      onPickerOpenChange(false);
                    }}
                    type="button"
                  >
                    <span className="text-caption truncate font-semibold">
                      {run.name}
                    </span>
                    <MonoLabel className="text-mono-badge ml-auto shrink-0">
                      {runLabel(run)} ·{" "}
                      {formatPace(
                        run.average_speed > 0 ? 1000 / run.average_speed : null,
                      )}
                      /km
                    </MonoLabel>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-caption text-muted-foreground px-4 py-3">
              No runs synced from Strava yet.
            </p>
          )}
        </div>
      )}

      {suggestions.length > 0 && (
        <Suggestions>
          {suggestions.map((suggestion) => (
            <Suggestion
              key={suggestion}
              onClick={(text) => onAsk(text)}
              suggestion={suggestion}
            />
          ))}
        </Suggestions>
      )}

      {attached && (
        <div className="flex">
          <span className="bg-brand/15 text-brand text-mono-badge inline-flex h-8 items-center gap-2.5 rounded-full py-0 pr-1.5 pl-3.5 font-mono uppercase">
            <AtSignIcon className="size-3" />
            {mentionLabel(attached)}
            <button
              aria-label="Remove the attached run"
              className="bg-foreground/10 hover:bg-foreground/20 focus-visible:ring-ring/50 flex size-5 items-center justify-center rounded-full outline-none focus-visible:ring-2"
              onClick={() => onAttach(null)}
              type="button"
            >
              <XIcon className="size-3" />
            </button>
          </span>
        </div>
      )}

      <PromptInput
        accept={ACCEPTED_FILES}
        globalDrop
        maxFileSize={MAX_FILE_SIZE}
        maxFiles={MAX_FILES}
        multiple
        onError={(err) => toast.error(err.message)}
        onSubmit={onSubmit}
      >
        <ComposerAttachments />
        <PromptInputBody>
          <PromptInputTextarea
            disabled={isBusy}
            onChange={(event) => onDraftChange(event.target.value)}
            placeholder="Ask about a run, or / for commands"
            value={draft}
          />
        </PromptInputBody>
        <PromptInputFooter>
          <PromptInputTools>
            <PromptInputButton
              aria-label="Attach a run"
              className={cn(pickerOpen && "bg-muted text-foreground")}
              onClick={() => onPickerOpenChange(!pickerOpen)}
              variant="ghost"
            >
              <AtSignIcon />
              <span className="sr-only sm:not-sr-only">Run</span>
            </PromptInputButton>
            <PromptInputActionMenu>
              <PromptInputActionMenuTrigger tooltip="Attach a file" />
              <PromptInputActionMenuContent>
                <PromptInputActionAddAttachments />
              </PromptInputActionMenuContent>
            </PromptInputActionMenu>
          </PromptInputTools>
          <PromptInputSubmit onStop={onStop} status={status} />
        </PromptInputFooter>
      </PromptInput>
    </div>
  );
}
