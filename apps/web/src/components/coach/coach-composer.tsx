// The composer, shaped like the questions runners actually ask.
//
// Four things the plain box didn't have: `@` attaches runs so "why did I fade?"
// names a session instead of hoping the model picks the right one, `/` opens the
// handful of questions asked over and over, the microphone takes a question
// asked out loud with a phone in a pocket after a run, and the chips underneath
// follow whatever the coach just drew.
//
// `@` is typed as often as it is clicked, so both open the same list, and the
// list is driven from the keyboard either way — see composer-menu.tsx for why
// the caret never leaves the box.
//
// The attached runs sit *inside* the box, on the same row as the files, because
// that is what they are: part of the message being written, not a status line
// above it. Which also settles what to do when there are several of them — they
// wrap where any other attachment would.
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
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
import {
  ComposerMenuCard,
  ComposerMenuKeys,
  ComposerMenuList,
  ComposerMenuOption,
  fold,
  mentionToken,
  optionId,
  withoutMention,
  type MentionToken,
} from "@/components/coach/composer-menu";
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

/** How many runs the `@` list offers before you have to scroll. Typing after
 *  the `@` narrows the whole history down to these, so it is a cap on the
 *  drawing and not on the search. */
const PICKER_RUNS = 8;

/**
 * How many runs one question can carry.
 *
 * Each one is a line of the coach's system prompt and an invitation to read a
 * run it did not ask for, so this is where "compare these three" stops and
 * "read my season" starts — which is a question, not an attachment. The API
 * holds the same number for a request that didn't come from here
 * (`MAX_ATTACHED_RUNS` in apps/api/src/coach.ts).
 */
export const MAX_ATTACHED_RUNS = 5;

/** The two lists' ids, so the box can name the one it is driving. */
const RUN_LIST_ID = "coach-composer-runs";
const COMMAND_LIST_ID = "coach-composer-commands";

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

/** A command as the list draws it — the trigger, what it does, what it asks. */
interface Command {
  ask: TranslationKey;
  name: string;
  desc: string;
}

/**
 * Which list is open, and what opened it.
 *
 * `id` is what Escape dismisses against: a mention's id carries the position of
 * its `@`, so abandoning that one and starting another brings the list back
 * without anything having to remember it was ever closed.
 */
type Menu =
  | { source: "mention"; id: string }
  | { source: "commands"; id: "commands" }
  | { source: "picker"; id: "picker" };

/** The id a draft's own trigger would carry — what Escape is remembered
 *  against, and what a later keystroke is measured against to forget it. */
function triggerId(draft: string, caret: number): string | null {
  const token = mentionToken(draft, caret);
  if (token) return `mention:${token.start}`;
  return draft.trim().startsWith("/") ? "commands" : null;
}

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

/**
 * Everything queued on the message, on one wrapping row inside the box.
 *
 * Runs first, then files: the runs are what the question is *about*, and they
 * are the ones that arrive without being dropped in — from the `@` list, from
 * the button, and from a replay handing one over on the way to this screen.
 *
 * One row rather than two headers. `PromptInputHeader` is an addon of the input
 * group, so a second one would draw a second band inside the box for what is
 * the same idea: this message carries these things.
 */
function ComposerHeader({
  attached,
  onDetach,
}: {
  attached: RunMention[];
  onDetach: (id: number) => void;
}) {
  const { t } = useTranslation();
  const mentionLabel = useMentionLabel();
  const attachments = usePromptInputAttachments();
  if (attached.length === 0 && attachments.files.length === 0) return null;

  return (
    <PromptInputHeader>
      {attached.map((mention) => {
        const label = mentionLabel(mention);
        return (
          <span
            className="bg-brand/15 text-brand text-mono-badge animate-in fade-in-0 zoom-in-95 inline-flex h-8 max-w-full items-center gap-2.5 rounded-full py-0 pr-1.5 pl-3.5 font-mono uppercase duration-150 ease-entrance motion-reduce:animate-none"
            key={mention.id}
          >
            <AtSignIcon className="size-3 shrink-0" />
            {/* Truncated, not wrapped: five runs on a phone is a box that grows
                taller than the transcript it is being typed under. */}
            <span className="truncate">{label}</span>
            <button
              // Named for the run it takes off, because there is more than one
              // of these now and "Remove the attached run" would be the name of
              // all of them.
              aria-label={t("composer.removeAttached", { run: label })}
              className="bg-foreground/10 hover:bg-foreground/20 focus-visible:ring-ring/50 flex size-5 shrink-0 items-center justify-center rounded-full outline-none focus-visible:ring-2"
              onClick={() => onDetach(mention.id)}
              type="button"
            >
              <XIcon className="size-3" />
            </button>
          </span>
        );
      })}

      {attachments.files.length > 0 && (
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
      )}
    </PromptInputHeader>
  );
}

export interface CoachComposerProps {
  runs: Run[] | undefined;
  draft: string;
  onDraftChange: (draft: string) => void;
  /** The runs on the message, in the order the athlete attached them. */
  attached: RunMention[];
  onAttach: (attached: RunMention[]) => void;
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
  const isBusy = status === "submitted" || status === "streaming";

  const attachedIds = new Set(attached.map((mention) => mention.id));
  const full = attached.length >= MAX_ATTACHED_RUNS;

  /** Where the caret is — what decides whether an `@` is being typed, and
   *  where the list ends up cutting one back out. Declared up here because
   *  dictation, below, is one of the things that moves it. */
  const [caret, setCaret] = useState(draft.length);

  // The caret comes with the words. Dictation rewrites the whole box from
  // outside it, so nothing else here would hear about the change — and a caret
  // left at the start of a sentence somebody has just spoken is what decides,
  // wrongly, that an `@` is being typed.
  const dictation = useDictation((text: string) => {
    onDraftChange(text);
    setCaret(text.length);
  });

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

  const field = useRef<HTMLTextAreaElement | null>(null);
  const [focused, setFocused] = useState(false);
  /** The highlighted row, tagged with the list it was chosen in — a list that
   *  has changed underneath falls back to its own default rather than keeping
   *  an index into something that is no longer there. */
  const [highlight, setHighlight] = useState<{
    key: string;
    index: number;
  } | null>(null);
  /** The list Escape closed, held against the `@` that opened it. */
  const [dismissed, setDismissed] = useState<string | null>(null);
  /** Where the caret goes once the draft a mention was cut out of lands. */
  const pendingCaret = useRef<number | null>(null);

  // `/ch` narrows to /charge; a bare `/` shows the lot.
  const commands: Command[] = useMemo(() => {
    const typed = draft.trim();
    if (!typed.startsWith("/")) return [];
    const head = typed.split(/\s/)[0];
    return SLASH_COMMANDS.map((command) => ({
      ask: command.ask,
      name: t(`${command.key}.name`),
      desc: t(`${command.key}.desc`),
    })).filter((command) => command.name.startsWith(head));
  }, [draft, t]);

  // Both lists belong to the box: they follow the caret, so they close when the
  // athlete leaves it and come back with the half-typed `@` when they return.
  const token: MentionToken | null = focused
    ? mentionToken(draft, caret)
    : null;
  const query = token?.query ?? null;

  /** Every run beside the words it can be found by — its name and the date and
   *  distance its row shows, so `@aug` and `@morning` reach the same session.
   *  Folded once per run rather than once per keystroke. */
  const searchable = useMemo(
    () =>
      (runs ?? []).map((run) => ({
        run,
        haystack: fold(`${run.name} ${runLabel(run, format)}`),
      })),
    [runs, format],
  );

  const needle = query ? fold(query) : "";
  const runMatches = (
    needle
      ? searchable.filter((entry) => entry.haystack.includes(needle))
      : searchable
  )
    .slice(0, PICKER_RUNS)
    .map((entry) => entry.run);

  /** What would be offered, before Escape has had its say. */
  const candidate: Menu | null = token
    ? { source: "mention", id: `mention:${token.start}` }
    : commands.length > 0 && focused
      ? { source: "commands", id: "commands" }
      : pickerOpen
        ? { source: "picker", id: "picker" }
        : null;

  const menu = candidate && candidate.id !== dismissed ? candidate : null;
  const isCommands = menu?.source === "commands";
  const count = menu ? (isCommands ? commands.length : runMatches.length) : 0;
  const listId = isCommands ? COMMAND_LIST_ID : RUN_LIST_ID;

  // A typed trigger arms the first row — `@` then Enter attaches the newest
  // run, the way every mention box works. The button arms nothing, because the
  // athlete who opened it may already have a question written, and Enter has to
  // go on meaning send.
  const menuKey = menu ? `${menu.id}:${query ?? ""}:${count}` : "";
  const armed = menu !== null && menu.source !== "picker" && count > 0;
  const activeIndex =
    highlight?.key === menuKey && highlight.index < count
      ? highlight.index
      : armed
        ? 0
        : -1;
  const activeId = activeIndex >= 0 ? optionId(listId, activeIndex) : null;

  // A controlled textarea drops the caret at the end when its value shrinks, so
  // it is put back by hand once the shorter draft has landed — before the
  // frame, or the caret is seen at the end of the sentence on the way past.
  useLayoutEffect(() => {
    const at = pendingCaret.current;
    if (at === null) return;
    pendingCaret.current = null;
    const node = field.current;
    if (!node) return;
    node.focus();
    node.setSelectionRange(at, at);
  }, [draft]);

  const closeMenu = () => {
    if (!menu) return;
    if (menu.source === "picker") onPickerOpenChange(false);
    else setDismissed(menu.id);
  };

  const handleChange = (value: string, at: number) => {
    onDraftChange(value);
    setCaret(at);
    // Escape dismissed the list for the trigger in hand and nothing further:
    // abandoning that `@` — or that `/` — and starting another brings the list
    // back, which is why the flag is cleared here and not on every keystroke.
    if (dismissed !== null && dismissed !== triggerId(value, at)) {
      setDismissed(null);
    }
  };

  const choose = (index: number) => {
    if (!menu) return;

    if (menu.source === "commands") {
      const command = commands[index];
      if (!command) return;
      onDraftChange("");
      onAsk(t(command.ask));
      return;
    }

    const run = runMatches[index];
    if (!run) return;

    // The list is the same list whether a run is on the message or not, so it
    // is also where one comes back off — a second Enter on a row wearing a tick
    // undoes the first, without reaching for the chip's ×.
    if (attachedIds.has(run.id)) {
      onAttach(attached.filter((mention) => mention.id !== run.id));
    } else {
      // At the cap the row says so and does nothing. Silently dropping the
      // sixth run would be a click that looks like it worked.
      if (full) return;
      onAttach([...attached, toMention(run)]);
    }

    // The picker stays open, because attaching one run is now rarely the whole
    // gesture: "compare these three" is three rows of the same list. A typed
    // `@` closes itself — the token it was opened by is cut out below.
    if (token) {
      // The chip carries the run now, so the `@morn` that found it comes back
      // out of the sentence — and the caret returns to where it was typed,
      // not to the end of a question that may go on past it.
      onDraftChange(withoutMention(draft, token, caret));
      setCaret(token.start);
      pendingCaret.current = token.start;
    } else {
      field.current?.focus();
    }
  };

  /** The three keys the list answers to, said once under it. */
  const keys = (
    <ComposerMenuKeys
      hints={[
        { keys: "↑↓", label: t("composer.keyMove") },
        { keys: "↵", label: t("composer.keySelect") },
        { keys: "esc", label: t("composer.keyClose") },
      ]}
    />
  );

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    // An IME candidate window is a list of its own, and it was here first.
    if (!menu || count === 0 || event.nativeEvent.isComposing) return;
    const last = count - 1;

    // Wrapping, both ways: eight rows is short enough that the end of the list
    // is never far from the start of it.
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlight({
        key: menuKey,
        index: activeIndex >= last ? 0 : activeIndex + 1,
      });
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlight({
        key: menuKey,
        index: activeIndex <= 0 ? last : activeIndex - 1,
      });
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      closeMenu();
      return;
    }

    // Home and End stay with the sentence: the caret is still in the middle of
    // a question, and shift+Enter is still a newline.
    if (activeIndex < 0 || event.shiftKey) return;
    // Tab completes what is being typed. A list the athlete only opened to
    // browse keeps its Tab, so the way out of the box is where it always was.
    if (
      event.key === "Enter" ||
      (event.key === "Tab" && menu.source !== "picker")
    ) {
      event.preventDefault();
      choose(activeIndex);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {/* One set of options at a time: while a list is open the athlete is
          choosing from it, and the chips would only stand between the list
          and the box it is completing. */}
      {suggestions.length > 0 && !menu && (
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

      {isCommands && (
        <ComposerMenuCard activeId={activeId} footer={keys}>
          <ComposerMenuList
            id={COMMAND_LIST_ID}
            label={t("composer.commandList")}
          >
            {commands.map((command, index) => (
              <ComposerMenuOption
                active={index === activeIndex}
                id={optionId(COMMAND_LIST_ID, index)}
                key={command.name}
                onHighlight={() => setHighlight({ key: menuKey, index })}
                onSelect={() => choose(index)}
              >
                <span className="text-caption text-brand w-16 font-mono">
                  {command.name}
                </span>
                <span className="text-caption text-muted-foreground">
                  {command.desc}
                </span>
              </ComposerMenuOption>
            ))}
          </ComposerMenuList>
        </ComposerMenuCard>
      )}

      {menu && !isCommands && (
        // No keys under an empty list: there is nothing to move through, and
        // three shortcuts over one sentence would read as the answer to it.
        <ComposerMenuCard
          activeId={activeId}
          footer={
            runMatches.length > 0 ? (
              <>
                {/* Said where the sixth run would have been chosen, and only
                    while it is true — a limit announced before it is reached is
                    a rule nobody was about to break. */}
                {full && (
                  <p
                    className="border-border text-caption text-muted-foreground shrink-0 border-t px-4 py-2"
                    role="status"
                  >
                    {t("composer.runsFull", { max: MAX_ATTACHED_RUNS })}
                  </p>
                )}
                {keys}
              </>
            ) : undefined
          }
        >
          {runMatches.length > 0 ? (
            <ComposerMenuList id={RUN_LIST_ID} label={t("composer.runList")}>
              {runMatches.map((run, index) => (
                <ComposerMenuOption
                  active={index === activeIndex}
                  attached={attachedIds.has(run.id)}
                  // At the cap the rows that would add a run stop being
                  // choosable; the ones already on the message never do, or
                  // there would be no way back down to four.
                  disabled={full && !attachedIds.has(run.id)}
                  id={optionId(RUN_LIST_ID, index)}
                  key={run.id}
                  onHighlight={() => setHighlight({ key: menuKey, index })}
                  onSelect={() => choose(index)}
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
                </ComposerMenuOption>
              ))}
            </ComposerMenuList>
          ) : (
            // Said out loud, not only drawn: the athlete is typing into a list
            // that just emptied, and the box they are typing in can't show why.
            <p
              className="text-caption text-muted-foreground px-4 py-3"
              role="status"
            >
              {runs?.length
                ? t("composer.noRunsMatch", { query: query ?? "" })
                : t("composer.noRunsSynced")}
            </p>
          )}
        </ComposerMenuCard>
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
        <ComposerHeader
          attached={attached}
          onDetach={(id) =>
            onAttach(attached.filter((mention) => mention.id !== id))
          }
        />
        <PromptInputBody>
          {/* A combobox rather than a plain box, because that is what it now
              is: `@` and `/` open a list this drives without ever giving up
              the caret, so the box is what names the highlighted row. */}
          <PromptInputTextarea
            aria-activedescendant={activeId ?? undefined}
            aria-autocomplete="list"
            aria-controls={menu && count > 0 ? listId : undefined}
            aria-expanded={Boolean(menu) && count > 0}
            autoFocus={!touch}
            disabled={isBusy}
            onBlur={() => {
              setFocused(false);
              if (pickerOpen) onPickerOpenChange(false);
            }}
            onChange={(event) =>
              handleChange(
                event.target.value,
                event.target.selectionStart ?? event.target.value.length,
              )
            }
            onFocus={() => setFocused(true)}
            onKeyDown={handleKeyDown}
            onSelect={(event) =>
              setCaret(event.currentTarget.selectionStart ?? 0)
            }
            placeholder={t("composer.placeholder")}
            ref={field}
            role="combobox"
            value={draft}
          />
        </PromptInputBody>
        <PromptInputFooter>
          <PromptInputTools>
            {/* The same list `@` opens, so it hands the caret straight back:
                `onMouseDown` is prevented so the click never takes it in the
                first place — which is also what keeps the second click a
                close, rather than a blur that closes and a click that reopens
                — and `focus()` covers the keyboard, where there is no
                mousedown to prevent. */}
            <PromptInputButton
              aria-controls={pickerOpen ? RUN_LIST_ID : undefined}
              aria-expanded={pickerOpen}
              aria-haspopup="listbox"
              aria-label={t("composer.attachRun")}
              className={cn(pickerOpen && "bg-muted text-foreground")}
              onClick={() => {
                onPickerOpenChange(!pickerOpen);
                field.current?.focus();
              }}
              onMouseDown={(event) => event.preventDefault()}
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
