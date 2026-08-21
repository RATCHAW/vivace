// The composer, shaped like the questions runners actually ask.
//
// Four things the plain box didn't have: `@` attaches a run so "why did I
// fade?" names a session instead of hoping the model picks the right one, `/`
// opens the handful of questions asked over and over, the microphone takes a
// question asked out loud with a phone in a pocket after a run, and the chips
// underneath follow whatever the coach just drew.
import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { AtSignIcon, MicIcon, SquareIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import type { ChatStatus } from "ai";
import type { Run } from "@/api";
import { useFormatters, type Formatters } from "@/i18n/format";
import type { TranslationKey } from "@/i18n";
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
import { Suggestion, Suggestions } from "@/components/ai-elements/suggestion";
import { MonoLabel } from "@/components/mono";
import { formatPace } from "@repo/video";
import { useDictation } from "@/lib/use-dictation";
import { useMediaQuery } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";

/**
 * What a multimodal model takes; anything else would just cost tokens.
 *
 * Whether the model behind `COACH_MODEL` reads either is the server's business
 * — deepseek-v4-flash, the default, is text-only, and a text-only model turns
 * an attachment into a failed turn rather than an ignored one.
 */
const ACCEPTED_FILES = "image/*,application/pdf";
const MAX_FILE_SIZE = 8 * 1024 * 1024;
const MAX_FILES = 4;

/** How many recent runs the `@` picker offers before you have to scroll. */
const PICKER_RUNS = 8;

/**
 * The five questions worth a keystroke.
 *
 * The trigger itself is translated along with the description — `/semaine`
 * rather than `/week` — because a shortcut nobody can guess is not a shortcut.
 * The filter below matches on whatever string the catalogue supplies, so
 * nothing else has to know which language is in force.
 */
const SLASH_COMMANDS = [
  { key: "composer.commands.week", ask: "coach.suggestions.planWeek" },
  {
    key: "composer.commands.review",
    ask: "coach.suggestions.readLongRunSplits",
  },
  { key: "composer.commands.race", ask: "coach.followUps.raceToday" },
  { key: "composer.commands.load", ask: "coach.followUps.rampingTooFast" },
  { key: "composer.commands.goal", ask: "rail.askChangeGoal" },
] as const satisfies readonly { key: string; ask: TranslationKey }[];

/** The run a message is about, as the chip renders it. */
export interface RunMention {
  id: number;
  name: string;
  /** `YYYY-MM-DD` — the run's own local day. */
  date: string;
}

/** `5 Aug · 15.02 km` — how a run reads in a chip or a picker row. */
export function runLabel(run: Run, format: Formatters): string {
  return `${format.shortDate(run.start_date_local)} · ${(
    run.distance / 1000
  ).toFixed(2)} km`;
}

export function toMention(run: Run): RunMention {
  return {
    id: run.id,
    name: run.name,
    date: run.start_date_local.slice(0, 10),
  };
}

/**
 * `Evening Run · 5 Aug` from a mention's stored date, without re-reading the run.
 *
 * A hook rather than a plain function: the chip it renders sits in two
 * components, and both want the date in the language on screen.
 */
export function useMentionLabel(): (mention: RunMention) => string {
  const format = useFormatters();
  return (mention) =>
    `${mention.name} · ${format.shortDate(`${mention.date}T00:00:00Z`)}`;
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
  const { t } = useTranslation();
  const format = useFormatters();
  const mentionLabel = useMentionLabel();
  const isBusy = status === "submitted" || status === "streaming";
  const dictation = useDictation(onDraftChange);

  // The other ways a turn starts — a slash command, a suggestion chip, a card's
  // button — never touch the form, and all of them empty the box. A microphone
  // left open across one would type the sent question straight back out.
  // `isBusy` is where all of them meet.
  const { cancel: cancelDictation } = dictation;
  useEffect(() => {
    if (isBusy) cancelDictation();
  }, [isBusy, cancelDictation]);

  /**
   * Whether the caret lands in the box the moment a conversation opens.
   *
   * It does, because typing is the first thing anybody does on this screen, and
   * it does for a conversation reopened as well as a fresh one — `CoachChat` is
   * keyed by thread id, so switching thread remounts this and the focus comes
   * with the mount rather than needing to watch which id is selected.
   *
   * Except on a touch device, where the same line is a keyboard sliding up over
   * the transcript nobody asked to leave. `(pointer: coarse)` rather than a
   * width breakpoint: a phone held sideways is still a phone, and a tablet with
   * a keyboard attached reports itself fine. A browser with no `matchMedia`
   * reads false and gets the desktop behaviour.
   */
  const touch = useMediaQuery("(pointer: coarse)");

  // `/ch` narrows to /charge; a bare `/` shows the lot.
  const commands = useMemo(() => {
    const typed = draft.trim();
    if (!typed.startsWith("/")) return [];
    const head = typed.split(/\s/)[0];
    return SLASH_COMMANDS.map((command) => ({
      ask: command.ask,
      name: t(`${command.key}.name`),
      desc: t(`${command.key}.desc`),
    })).filter((command) => command.name.startsWith(head));
  }, [draft, t]);

  return (
    <div className="flex flex-col gap-3">
      {commands.length > 0 && (
        <ul className="border-border bg-card overflow-hidden rounded-md border">
          {commands.map((command) => (
            <li
              className="border-border border-t first:border-t-0"
              key={command.name}
            >
              <button
                className="hover:bg-muted focus-visible:ring-ring/50 flex w-full items-center gap-3.5 px-4 py-2.5 text-left transition-colors duration-100 ease-out outline-none focus-visible:ring-3 focus-visible:ring-inset"
                onClick={() => {
                  onDraftChange("");
                  onAsk(t(command.ask));
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
        <div className="border-border bg-card scrollbar-subtle max-h-52 overflow-y-auto rounded-md border">
          {runs?.length ? (
            <ul>
              {runs.slice(0, PICKER_RUNS).map((run) => (
                <li
                  className="border-border border-t first:border-t-0"
                  key={run.id}
                >
                  <button
                    className="hover:bg-muted focus-visible:ring-ring/50 flex w-full items-center gap-3.5 px-4 py-2.5 text-left transition-colors duration-100 ease-out outline-none focus-visible:ring-3 focus-visible:ring-inset"
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
                      {runLabel(run, format)} ·{" "}
                      {formatPace(
                        run.average_speed > 0 ? 1000 / run.average_speed : null,
                      )}
                      {t("common.perKm")}
                    </MonoLabel>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-caption text-muted-foreground px-4 py-3">
              {t("composer.noRunsSynced")}
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
              aria-label={t("composer.removeAttached")}
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
        onSubmit={(message) => {
          // Send is the athlete saying they have finished talking. The question
          // is what is in the box; a syllable still being weighed is not part
          // of it, and the effect above would only drop it a frame too late —
          // `useEffect` runs after the paint that cleared the draft.
          cancelDictation();
          onSubmit(message);
        }}
      >
        <ComposerAttachments />
        <PromptInputBody>
          <PromptInputTextarea
            autoFocus={!touch}
            disabled={isBusy}
            onChange={(event) => onDraftChange(event.target.value)}
            placeholder={t("composer.placeholder")}
            value={draft}
          />
        </PromptInputBody>
        <PromptInputFooter>
          <PromptInputTools>
            <PromptInputButton
              aria-label={t("composer.attachRun")}
              className={cn(pickerOpen && "bg-muted text-foreground")}
              onClick={() => onPickerOpenChange(!pickerOpen)}
              variant="ghost"
            >
              <AtSignIcon />
              <span className="sr-only sm:not-sr-only">
                {t("composer.runShort")}
              </span>
            </PromptInputButton>
            <PromptInputActionMenu>
              <PromptInputActionMenuTrigger
                tooltip={t("composer.attachFile")}
              />
              <PromptInputActionMenuContent>
                <PromptInputActionAddAttachments />
              </PromptInputActionMenuContent>
            </PromptInputActionMenu>
            {/* The words appearing in the box are the sighted athlete's whole
                indicator; this is the same fact said once, out loud. */}
            <span aria-live="polite" className="sr-only" role="status">
              {dictation.listening ? t("composer.dictation.listening") : ""}
            </span>
          </PromptInputTools>
          {/* Talking and sending are one gesture, so the two controls sit
              together at the end of the row rather than at opposite ends of
              it. Send never leaves: an athlete who has said enough presses it
              mid-sentence and the question goes as it reads. */}
          <div className="flex shrink-0 items-center gap-1.5">
            {/* Absent rather than disabled where the browser has no recogniser:
                a microphone that can never be switched on is a promise, and
                Firefox would wear it on every conversation. */}
            {dictation.supported && (
              <PromptInputButton
                aria-label={t(
                  dictation.listening
                    ? "composer.dictation.stop"
                    : "composer.dictation.start",
                )}
                aria-pressed={dictation.listening}
                className={cn(
                  dictation.listening && "bg-muted text-foreground",
                )}
                disabled={isBusy}
                onClick={() => dictation.toggle(draft)}
                tooltip={t(
                  dictation.listening
                    ? "composer.dictation.stop"
                    : "composer.dictation.start",
                )}
                variant="ghost"
              >
                {/* The same square the submit button wears while an answer is
                    streaming — on this surface it is already the word "stop",
                    and a microphone with a slash through it reads as muted
                    rather than as a control. */}
                {dictation.listening ? (
                  <SquareIcon className="fill-current" />
                ) : (
                  <MicIcon />
                )}
              </PromptInputButton>
            )}
            <PromptInputSubmit onStop={onStop} status={status} />
          </div>
        </PromptInputFooter>
      </PromptInput>
    </div>
  );
}
