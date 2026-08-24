// The list the composer opens above itself — the runs `@` offers and the
// questions `/` offers, as one keyboard-navigable listbox.
//
// Focus never leaves the textarea. The athlete is mid-sentence and the trigger
// character is still in the draft, so a list that took the caret would end the
// sentence to be navigated. That makes this the ARIA combobox pattern rather
// than a menu: the textarea keeps focus and names the highlighted row with
// `aria-activedescendant`, and the rows are `role="option"` — never tab stops,
// because a list of eight runs between the box and the send button would be
// eight presses of Tab away from sending.
import { useEffect, useRef, type ReactNode } from "react";
import { CheckIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** What opens the run list from inside the sentence being written. */
export const MENTION_TRIGGER = "@";

/** The `@…` being typed at the caret, and where it starts. */
export interface MentionToken {
  /** Index of the `@` itself, so selecting a run can cut it back out. */
  start: number;
  /** What follows it — `""` for a bare `@`, which offers everything. */
  query: string;
}

/**
 * The mention being typed at the caret, if one is.
 *
 * Two rules keep this from firing on prose: the `@` has to open a word, so an
 * email address is not a mention, and a space closes it, so the list goes away
 * when the athlete has moved on rather than filtering against a whole sentence.
 */
export function mentionToken(
  draft: string,
  caret: number,
): MentionToken | null {
  const before = draft.slice(0, Math.max(0, Math.min(caret, draft.length)));
  const start = before.lastIndexOf(MENTION_TRIGGER);
  if (start === -1) return null;
  if (start > 0 && !/\s/.test(before[start - 1])) return null;
  const query = before.slice(start + 1);
  if (/\s/.test(query)) return null;
  return { start, query };
}

/**
 * The draft with the mention cut out — what is left once a run has been picked.
 *
 * The chip at the top of the box carries the run now, so the `@morn` that found
 * it has done its job; leaving it in would send the coach a question with half
 * a run name in the middle of it.
 */
export function withoutMention(
  draft: string,
  token: MentionToken,
  caret: number,
): string {
  return draft.slice(0, token.start) + draft.slice(caret);
}

/**
 * Accent-blind, case-blind matching.
 *
 * The catalogue ships French, and so do the run names: an athlete typing
 * `@sortie legere` should find "Sortie légère" without reaching for the
 * accent, because they are typing to filter and not to spell.
 */
export function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase();
}

/** The id of one row, for `aria-activedescendant` to point at. */
export function optionId(listId: string, index: number): string {
  return `${listId}-option-${index}`;
}

export interface ComposerMenuCardProps {
  /** The highlighted row, kept in view as the arrows move it. */
  activeId?: string | null;
  /** The keys that drive the list, under it. Omitted when there is no list. */
  footer?: ReactNode;
  children: ReactNode;
}

/**
 * The card both lists are drawn in.
 *
 * `onMouseDown` is prevented so a click on a row never blurs the textarea:
 * the rows aren't focusable, so without this the caret would land on the body
 * and the list would close before the click it was closed by ever arrived.
 * Scrollbars don't raise `mousedown`, so dragging one still works.
 *
 * The footer sits outside the scroll region rather than at the end of the
 * list, so what the keys do is still on screen at the bottom of a long one.
 */
export function ComposerMenuCard({
  activeId,
  footer,
  children,
}: ComposerMenuCardProps) {
  const scroller = useRef<HTMLDivElement | null>(null);

  // `nearest` rather than `center`: the list only ever moves by one row, and a
  // list that recentres on every arrow press reads as sliding under a fixed
  // highlight instead of a highlight moving down a list.
  useEffect(() => {
    if (!activeId) return;
    const row = scroller.current?.querySelector('[data-active="true"]');
    row?.scrollIntoView?.({ block: "nearest" });
  }, [activeId]);

  return (
    <div
      className="border-border bg-card animate-in fade-in-0 slide-in-from-bottom-1 flex max-h-60 flex-col overflow-hidden rounded-md border duration-150 ease-entrance motion-reduce:animate-none"
      onMouseDown={(event) => event.preventDefault()}
    >
      <div
        className="scrollbar-subtle min-h-0 flex-1 overflow-y-auto"
        ref={scroller}
      >
        {children}
      </div>
      {footer}
    </div>
  );
}

/**
 * What the keys do, under the list.
 *
 * The arrows work whether or not this is here; what it fixes is that nothing
 * on screen said so. A list that appears while you are typing looks like
 * something to reach for the mouse for unless it tells you otherwise — which
 * is the one thing a command palette always does and this didn't.
 *
 * Hidden on a coarse pointer: a phone has no arrow keys and no Escape, and
 * three shortcuts nobody can press is a row of noise over the keyboard.
 */
export function ComposerMenuKeys({
  hints,
}: {
  hints: { keys: string; label: string }[];
}) {
  return (
    <div className="border-border text-mono-badge text-stone flex shrink-0 items-center gap-3 border-t px-4 py-2 font-mono uppercase pointer-coarse:hidden">
      {hints.map((hint) => (
        <span className="flex items-center gap-1.5" key={hint.label}>
          <kbd className="border-border text-muted-foreground rounded-sm border px-1.5 py-px font-mono">
            {hint.keys}
          </kbd>
          {hint.label}
        </span>
      ))}
    </div>
  );
}

export interface ComposerMenuListProps {
  id: string;
  label: string;
  children: ReactNode;
}

export function ComposerMenuList({
  id,
  label,
  children,
}: ComposerMenuListProps) {
  return (
    <ul aria-label={label} id={id} role="listbox">
      {children}
    </ul>
  );
}

export interface ComposerMenuOptionProps {
  id: string;
  active: boolean;
  /** Already on the message — the run list can hold several at once. */
  attached?: boolean;
  /** Offered, and not choosable: the message is carrying all it can. */
  disabled?: boolean;
  onSelect: () => void;
  /** Moving the pointer over a row takes the highlight from the keyboard. */
  onHighlight: () => void;
  children: ReactNode;
}

/**
 * One row.
 *
 * `onMouseMove` rather than `onMouseEnter`: the list can arrive under a
 * stationary cursor — it opens on a keystroke — and an enter event fired by the
 * list moving would take the highlight off the row the arrows had just chosen.
 *
 * The highlight does not transition. It is a cursor, not a hover state: held
 * down, the arrow keys step through this faster than a 100ms fade can finish,
 * and what that draws is two half-lit rows trailing the one actually selected.
 * Instant is what makes a list feel like it is keeping up.
 *
 * It is cobalt rather than `bg-muted`, and it carries a tick as well as a
 * tint. `--muted` and `--card` are the *same colour* on the dark canvas and
 * four per cent apart on the light one, so a row highlighted with it was
 * invisible in one theme and a whisper in the other — and a selection nobody
 * can see is the same as no selection at all. The tick is the second half of
 * that: the state is then a shape and not only a hue, which is what makes it
 * survive a colour-blind reader and a bad screen. It is the same stamp the
 * replay list puts against the run it is showing.
 */
export function ComposerMenuOption({
  id,
  active,
  attached,
  disabled = false,
  onSelect,
  onHighlight,
  children,
}: ComposerMenuOptionProps) {
  return (
    <li
      // `aria-selected` is the cursor here — which row Enter would take, named
      // by the textarea's `aria-activedescendant`. What is already on the
      // message is `aria-checked`, the state a multi-select listbox announces,
      // and the two move independently: the cursor passes over a checked row
      // without unchecking it.
      aria-checked={attached}
      aria-disabled={disabled || undefined}
      aria-selected={active}
      className={cn(
        "border-border flex w-full items-center gap-3 border-t py-2.5 pr-4 pl-3 text-left first:border-t-0",
        active && "bg-brand/15",
        disabled ? "cursor-default opacity-50" : "cursor-pointer",
      )}
      data-active={active}
      id={id}
      // Still highlightable, and still announced: a row that cannot be chosen
      // right now is worth reading, and the line under the list says why.
      onClick={disabled ? undefined : onSelect}
      onMouseMove={onHighlight}
      role="option"
    >
      {/* Drawn either way, so the row's words don't shuffle sideways as the
          highlight passes over them. */}
      <span
        aria-hidden
        className={cn(
          "bg-brand h-5 w-[3px] shrink-0 rounded-full",
          active ? "opacity-100" : "opacity-0",
        )}
      />
      {children}
      {/* Only where a row has the state to show — the commands are chosen, not
          collected, and an invisible tick at the end of each of them would be
          16px of nothing taken out of the description.
          At the end of the row rather than beside the cursor bar: this is what
          the row *is*, not which row the keyboard is on, and the two would
          read as one control stacked against the left edge. */}
      {attached !== undefined && (
        <CheckIcon
          aria-hidden
          className={cn(
            "text-brand size-3.5 shrink-0",
            attached ? "opacity-100" : "opacity-0",
          )}
        />
      )}
    </li>
  );
}
