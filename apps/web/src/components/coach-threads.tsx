import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  MoreHorizontalIcon,
  PinIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";
import { toast } from "sonner";
import { useFormatters, type Formatters } from "@/i18n/format";
import {
  createCoachThreadMutation,
  deleteCoachThreadMutation,
  listCoachThreadsOptions,
  listCoachThreadsQueryKey,
  updateCoachThreadMutation,
  type CoachThread,
} from "@/api";
import { MonoLabel } from "@/components/mono";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { disposeCoachChat } from "@/lib/coach-chats";
import { useReorderAnimation } from "@/lib/use-reorder-animation";
import { cn } from "@/lib/utils";

/** Conversations older than today are dated; today's are just "Today". */
function threadDate(
  thread: CoachThread,
  format: Formatters,
  today: string,
): string {
  const updated = new Date(thread.updated_at);
  return updated.toDateString() === new Date().toDateString()
    ? today
    : format.threadDate(thread.updated_at);
}

/**
 * The order the list is read in: pinned first, newest pin at the top, then
 * everything else by when it was last used.
 *
 * The same rule `listThreads` applies in SQL, restated here because the browser
 * reorders the list itself the instant the pin is clicked rather than waiting
 * for the round trip to say so. Both timestamps are `toISOString()` output, so
 * comparing them as strings compares them as instants.
 */
export function compareThreads(a: CoachThread, b: CoachThread): number {
  if (a.pinned_at && b.pinned_at) return b.pinned_at.localeCompare(a.pinned_at);
  if (a.pinned_at) return -1;
  if (b.pinned_at) return 1;
  return b.updated_at.localeCompare(a.updated_at);
}

/**
 * The list as the server is about to return it, so the row can start moving now.
 *
 * A pin that reordered only once the PATCH came back would animate a beat after
 * the click, which reads as the list having thought about it.
 */
export function reorderPinned(
  threads: CoachThread[],
  threadId: string,
  pinned: boolean,
  now: string,
): CoachThread[] {
  return threads
    .map((thread) =>
      thread.id === threadId
        ? { ...thread, pinned_at: pinned ? now : null }
        : thread,
    )
    .sort(compareThreads);
}

/**
 * An action in the sidebar column: there while the row is under the pointer or
 * holding focus, and taking no room from the title when it isn't.
 *
 * No fade. The mask that gets the title out of the way can't be transitioned —
 * Tailwind registers its stops with `syntax: "*"`, which CSS won't interpolate
 * — so a button that faded in would arrive after the text had already moved.
 * They change in the same frame instead, which is also the right answer on its
 * own: this row is hovered dozens of times a session while an athlete reads
 * down the list, and animating something seen that often only makes it slow.
 *
 * `focus-within` on the row rather than `focus-visible` on the button, so
 * tabbing onto a conversation shows what can be done to it — and so the title
 * gets out of the way at the same moment, which one button lighting up on its
 * own would not achieve.
 */
const REVEALED_ON_ROW =
  "pointer-events-none opacity-0 group-hover/thread:pointer-events-auto group-hover/thread:opacity-100 group-focus-within/thread:pointer-events-auto group-focus-within/thread:opacity-100";

/** The column's title fade, applied only while its two icons are drawn. */
const COLUMN_TITLE_FADE =
  "group-hover/thread:thread-actions-fade group-focus-within/thread:thread-actions-fade";

/**
 * The column's trash, which asks before it does anything.
 *
 * It used to confirm on an 1100ms hold, with a `clip-path` fill for a timer.
 * That protected the click but only ever explained itself in a tooltip — and it
 * asked a phone to press and wait on a control it could not see. The dialog is
 * one question in words, in both languages, on every screen, and the same
 * question whichever of the two controls asked it.
 */
function DeleteThreadButton({
  label,
  onRequest,
}: {
  label: string;
  onRequest: () => void;
}) {
  return (
    <Button
      aria-label={label}
      className={REVEALED_ON_ROW}
      onClick={onRequest}
      size="icon-sm"
      title={label}
      variant="ghost"
    >
      <Trash2Icon />
    </Button>
  );
}

/**
 * The column's pin.
 *
 * Hover-only like the trash, rather than staying on screen once a conversation
 * is pinned: the PINNED heading above the group already says that about every
 * row under it, and says it once instead of on each one — so a permanent mark
 * would be a second copy, paid for out of every title in the list.
 *
 * Filled and foreground when pinned rather than cobalt: DESIGN.md keeps the
 * accent for one thing per viewport, and a sidebar can hold several pins.
 */
function PinThreadButton({
  label,
  onToggle,
  pinned,
}: {
  label: string;
  onToggle: () => void;
  pinned: boolean;
}) {
  return (
    <Button
      aria-label={label}
      aria-pressed={pinned}
      className={REVEALED_ON_ROW}
      onClick={onToggle}
      size="icon-sm"
      title={label}
      variant="ghost"
    >
      {/* The state change is a fill, not a movement: the row is already flying
          to the top of the list, and two things animating at once for one click
          is one of them too many. */}
      <PinIcon
        className={cn(
          "transition-colors duration-150 ease-out",
          pinned ? "fill-foreground text-foreground" : "text-muted-foreground",
        )}
      />
    </Button>
  );
}

/**
 * Everything that can be done to one conversation, behind a `⋯`.
 *
 * The sheet's half of the row, and only the sheet's. The column reveals its two
 * icons on hover; a sheet is what the sidebar becomes on a phone, where there
 * is no hover to reveal anything with — a control that only appears under a
 * pointer is a control that does not exist there at all. So the trigger is
 * simply always drawn, which is also why it needs no `pointer-events` dance and
 * no `aria-expanded` clause to survive the menu opening.
 *
 * Pinned-ness is carried by `aria-checked` on the pin item, which is what tells
 * a screen reader what the PINNED heading tells everyone else — the heading
 * itself is `aria-hidden`, so this is the only place that state is spoken.
 */
function ThreadActionsMenu({
  deleteLabel,
  onRequestDelete,
  onTogglePin,
  pinLabel,
  pinned,
  triggerLabel,
}: {
  deleteLabel: string;
  onRequestDelete: () => void;
  onTogglePin: () => void;
  pinLabel: string;
  pinned: boolean;
  triggerLabel: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            aria-label={triggerLabel}
            // `text-muted-foreground` because `ghost` sets no colour of its own
            // and would otherwise inherit the row's: three full-strength dots
            // on every row, competing with the titles beside them. The
            // variant's `hover:text-foreground` still brings them up.
            className="text-muted-foreground pointer-events-auto"
            size="icon-sm"
            title={triggerLabel}
            variant="ghost"
          />
        }
      >
        <MoreHorizontalIcon />
      </DropdownMenuTrigger>

      {/* `w-auto` because the shared content is sized to its anchor, and the
          anchor here is a 36px button. Aligned to the end so the menu opens
          under the trigger rather than across the conversation it acts on. */}
      <DropdownMenuContent align="end" className="w-auto min-w-44">
        <DropdownMenuItem
          aria-checked={pinned}
          onClick={onTogglePin}
          role="menuitemcheckbox"
        >
          <PinIcon className={cn(pinned && "fill-current")} />
          {pinLabel}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {/* Closes on click, like any menu item, and the dialog it asks for
            opens over where it was. Nothing is deleted here. */}
        <DropdownMenuItem onClick={onRequestDelete} variant="destructive">
          <Trash2Icon />
          {deleteLabel}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * PINNED / RECENT, the two marks that say why the order is the order.
 *
 * `aria-hidden`, and deliberately: it is a divider inside the one list, and a
 * list item that is a word rather than a conversation is noise to read out.
 * What it says is already carried per row, and carried better — the pin is a
 * toggle with `aria-pressed`, so a screen reader is told a conversation is
 * pinned by the control that unpins it.
 *
 * It fades rather than appears, because it only ever arrives at the moment a
 * row is flying up to sit under it, and one of the two popping in while the
 * other glides is what makes a list look like it cut.
 */
function groupLabel(key: string, text: string, spacing: string) {
  return (
    <li aria-hidden key={`label-${key}`}>
      <MonoLabel
        className={cn(
          "animate-in fade-in-0 ease-entrance block pb-1.5 pl-3.5 duration-200 motion-reduce:animate-none",
          spacing,
        )}
      >
        {text}
      </MonoLabel>
    </li>
  );
}

export interface CoachThreadsProps {
  selectedId: string | null;
  onSelect: (threadId: string) => void;
  /**
   * Whether this is the sheet the sidebar becomes below `lg`, rather than the
   * column itself. It decides how a row offers its two actions, and nothing
   * else — see `ThreadActionsMenu`.
   *
   * A prop rather than a breakpoint the row could read for itself, because the
   * question is which of the two the Coach page mounted, and the page is the
   * only thing that knows. A `lg:hidden` pair would also mean building a menu
   * for every row of a list that never shows one.
   */
  inSheet?: boolean;
}

/**
 * Every conversation this athlete has had: the pinned ones, then the rest by
 * how recently they were used.
 *
 * Selection lives in the URL (see the Coach page), so a thread can be linked to
 * the same way a run replay can.
 */
export function CoachThreads({
  inSheet = false,
  selectedId,
  onSelect,
}: CoachThreadsProps) {
  const { t } = useTranslation();
  const format = useFormatters();
  const queryClient = useQueryClient();
  const { data: threads, error } = useQuery(listCoachThreadsOptions());
  const registerRow = useReorderAnimation();
  /**
   * The conversation the athlete has asked to delete, held here rather than in
   * each row: one dialog for the list, not one per row that never opens.
   *
   * The whole thread and not just its id, because the dialog names what it is
   * about to destroy and has to keep naming it while it closes — reading the
   * title out of the list would blank it the instant the row left.
   */
  const [pendingDelete, setPendingDelete] = useState<CoachThread | null>(null);

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: listCoachThreadsQueryKey() });

  const create = useMutation({
    ...createCoachThreadMutation(),
    onSuccess: async (thread) => {
      await invalidate();
      onSelect(thread.id);
    },
    onError: (err) => toast.error(err.error),
  });

  const remove = useMutation({
    ...deleteCoachThreadMutation(),
    onSuccess: async (_data, variables) => {
      // The conversation kept alive across tab switches dies with its thread.
      disposeCoachChat(variables.path.id);
      await invalidate();
      // Dropping the open conversation leaves nothing selected; the page picks
      // the next one up.
      if (variables.path.id === selectedId) onSelect("");
    },
    onError: (err) => toast.error(err.error),
  });

  const setPinned = useMutation({
    ...updateCoachThreadMutation(),
    // The list is reordered before the request leaves, so the row starts
    // travelling on the click rather than on the response. The server's answer
    // then confirms an order the athlete is already looking at.
    onMutate: async (variables) => {
      const key = listCoachThreadsQueryKey();
      // A list refetch already in flight would otherwise land after this and
      // put the row back where it was.
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<CoachThread[]>(key);
      if (previous) {
        queryClient.setQueryData(
          key,
          reorderPinned(
            previous,
            variables.path.id,
            variables.body.pinned,
            new Date().toISOString(),
          ),
        );
      }
      return { previous };
    },
    onError: (err, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(listCoachThreadsQueryKey(), context.previous);
      }
      toast.error(err.error);
    },
    onSettled: invalidate,
  });

  const pinnedThreads = threads?.filter((thread) => thread.pinned_at) ?? [];
  const otherThreads = threads?.filter((thread) => !thread.pinned_at) ?? [];

  const row = (thread: CoachThread) => (
    <li
      className="group/thread relative"
      key={thread.id}
      ref={registerRow(thread.id)}
    >
      <button
        aria-current={thread.id === selectedId ? "page" : undefined}
        className={cn(
          // No room held back on the right: the buttons overlay the row rather
          // than being laid out beside the title, so a title has the full
          // width of the column until something is actually drawn over it.
          "focus-visible:ring-ring/50 flex w-full flex-col gap-1 rounded-sm px-3.5 py-2.5 text-left transition-colors duration-100 ease-out outline-none focus-visible:ring-3 focus-visible:ring-inset",
          thread.id === selectedId ? "bg-muted" : "hover:bg-muted/40",
        )}
        onClick={() => onSelect(thread.id)}
        type="button"
      >
        {/* The only line long enough to reach the actions; the date below it is
            four characters and never gets near them. In the sheet the fade is
            unconditional, because so is the trigger it makes room for. */}
        <span
          className={cn(
            "text-body-sm truncate font-semibold",
            inSheet ? "thread-menu-fade" : COLUMN_TITLE_FADE,
          )}
        >
          {thread.title ?? t("threads.newConversation")}
        </span>
        <span className="text-caption text-stone">
          {threadDate(thread, format, t("threads.today"))}
        </span>
      </button>
      {/* Laid over the row rather than beside it, which is what lets the title
          have the whole width. Full height so the controls centre themselves
          whichever size they are, and `pointer-events-none` so that being full
          height doesn't turn the row's right-hand strip into a dead zone —
          each control turns them back on for itself once it is on screen. */}
      <div className="pointer-events-none absolute inset-y-0 right-1.5 flex items-center gap-0.5">
        {inSheet ? (
          <ThreadActionsMenu
            deleteLabel={t("threads.menu.delete")}
            onRequestDelete={() => setPendingDelete(thread)}
            onTogglePin={() =>
              setPinned.mutate({
                path: { id: thread.id },
                body: { pinned: !thread.pinned_at },
              })
            }
            pinLabel={t(
              thread.pinned_at ? "threads.menu.unpin" : "threads.menu.pin",
            )}
            pinned={Boolean(thread.pinned_at)}
            triggerLabel={t("threads.menu.options", {
              title: thread.title ?? t("threads.untitled"),
            })}
          />
        ) : (
          <>
            {/* Pin first: it is the one an athlete came for, and it puts the
                delete at the far edge rather than under the pointer on the way
                to it. */}
            <PinThreadButton
              label={t(thread.pinned_at ? "threads.unpin" : "threads.pin", {
                title: thread.title ?? t("threads.untitled"),
              })}
              onToggle={() =>
                setPinned.mutate({
                  path: { id: thread.id },
                  body: { pinned: !thread.pinned_at },
                })
              }
              pinned={Boolean(thread.pinned_at)}
            />
            <DeleteThreadButton
              label={t("threads.delete", {
                title: thread.title ?? t("threads.untitled"),
              })}
              onRequest={() => setPendingDelete(thread)}
            />
          </>
        )}
      </div>
    </li>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <Button
        className="w-full shrink-0"
        disabled={create.isPending}
        onClick={() => create.mutate({})}
        size="sm"
        variant="outline"
      >
        <PlusIcon />
        {t("threads.newConversation")}
      </Button>

      {error && <p className="text-body-sm text-destructive">{error.error}</p>}

      {!threads && !error && (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton className="h-12 w-full rounded-sm" key={i} />
          ))}
        </div>
      )}

      {threads?.length === 0 && (
        <p className="text-body-sm text-muted-foreground">
          {t("threads.empty")}
        </p>
      )}

      {threads && threads.length > 0 && (
        // The one scroll region in the column: the aside itself is clipped, so
        // the list scrolls under a fixed "new conversation" button and a fixed
        // queue rather than the whole sidebar scrolling behind them. The rail
        // sits in the aside's own padding (`-mr-2`, given back on the list), so
        // a thumb never lands on a delete button.
        <ScrollArea className="-mr-2 min-h-0 flex-1">
          <nav aria-label={t("threads.listLabel")}>
            {/* One list, not one per group, and one flat array rather than two
                spliced together: React keys within a child array, so a row that
                moved between two of them would be destroyed and rebuilt — which
                loses the focus of whoever just pressed the pin, and hands the
                reorder a brand-new element with no position to travel from.
                Keyed across the whole list, the row is the same element in a
                new place, which is exactly what it looks like. */}
            <ul className="flex flex-col gap-0.5 pr-2">
              {[
                ...(pinnedThreads.length > 0
                  ? [groupLabel("pinned", t("threads.pinned"), "pt-0.5")]
                  : []),
                ...pinnedThreads.map(row),
                ...(pinnedThreads.length > 0 && otherThreads.length > 0
                  ? [groupLabel("recent", t("threads.recent"), "pt-5")]
                  : []),
                ...otherThreads.map(row),
              ]}
            </ul>
          </nav>
        </ScrollArea>
      )}

      {/* One dialog for the list. `pendingDelete` is both what it says and
          whether it is open, so cancelling and confirming are the same
          shape: put the pending conversation down. */}
      <AlertDialog
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        open={pendingDelete !== null}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("threads.confirmDelete.title")}
            </AlertDialogTitle>
            {/* Names the conversation and says the part that can't be taken
                back, because "Are you sure?" answers neither question. */}
            <AlertDialogDescription>
              {t("threads.confirmDelete.body", {
                title: pendingDelete?.title ?? t("threads.untitled"),
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              {t("threads.confirmDelete.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingDelete) {
                  remove.mutate({ path: { id: pendingDelete.id } });
                }
              }}
              variant="destructive"
            >
              {t("threads.confirmDelete.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
