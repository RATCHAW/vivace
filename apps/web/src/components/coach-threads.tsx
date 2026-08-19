import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { useFormatters, type Formatters } from "@/i18n/format";
import {
  createCoachThreadMutation,
  deleteCoachThreadMutation,
  listCoachThreadsOptions,
  listCoachThreadsQueryKey,
  type CoachThread,
} from "@/api";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { disposeCoachChat } from "@/lib/coach-chats";
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
 * How long the trash has to be held before the conversation goes.
 *
 * A conversation is deleted server-side with every message in it and there is
 * no undo, so the click is deliberately not enough. 1100ms rather than the 2s
 * a heavier delete would take: the target is a 36px icon that only appears on
 * hover, and holding a cursor still on one for two seconds is its own kind of
 * hostile.
 */
const HOLD_TO_DELETE_MS = 1100;

/**
 * The trash, which confirms on a hold.
 *
 * The fill is the timer: `clip-path` sweeps left to right over
 * HOLD_TO_DELETE_MS and the mutation fires when it lands. Releasing early
 * snaps it back in 200ms — the commitment is slow, the retreat is instant.
 *
 * `onKeyDown` is guarded against auto-repeat, and every way of leaving the
 * button (pointer up, pointer out, cancel, blur) cancels the timer, because a
 * pending delete that outlives the gesture is the bug this exists to prevent.
 */
function DeleteThreadButton({
  label,
  onConfirm,
}: {
  label: string;
  onConfirm: () => void;
}) {
  const [holding, setHolding] = useState(false);
  const timer = useRef<number | null>(null);

  const stop = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    setHolding(false);
  };

  // An unmount mid-hold — the list re-sorts, the thread is deleted from
  // another tab — must not leave a timer pointing at a dead component.
  useEffect(() => stop, []);

  const start = () => {
    // Key auto-repeat fires onKeyDown over and over; only the first counts.
    if (timer.current !== null) return;
    setHolding(true);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setHolding(false);
      onConfirm();
    }, HOLD_TO_DELETE_MS);
  };

  return (
    <Button
      aria-label={label}
      className="group/delete absolute top-2.5 right-1.5 overflow-hidden opacity-0 transition-opacity group-hover/thread:opacity-100 focus-visible:opacity-100"
      data-holding={holding || undefined}
      onBlur={stop}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        // Or the browser synthesises a click on release and the button would
        // fire twice: once from the hold, once from the click.
        event.preventDefault();
        start();
      }}
      onKeyUp={stop}
      onPointerCancel={stop}
      onPointerDown={start}
      onPointerLeave={stop}
      onPointerUp={stop}
      size="icon-sm"
      title={label}
      variant="ghost"
    >
      {/* The timer, drawn. `clip-path` rather than a width: it is a reveal of
          something already laid out, so nothing reflows while it runs. */}
      <span
        aria-hidden
        className="bg-destructive/25 pointer-events-none absolute inset-0 [clip-path:inset(0_100%_0_0)] transition-[clip-path] duration-200 ease-out group-data-[holding]/delete:[clip-path:inset(0_0_0_0)] group-data-[holding]/delete:duration-1100 group-data-[holding]/delete:ease-linear motion-reduce:transition-none"
      />
      <Trash2Icon className="relative" />
    </Button>
  );
}

export interface CoachThreadsProps {
  selectedId: string | null;
  onSelect: (threadId: string) => void;
}

/**
 * Every conversation this athlete has had, most recent first.
 *
 * Selection lives in the URL (see the Coach page), so a thread can be linked to
 * the same way a run replay can.
 */
export function CoachThreads({ selectedId, onSelect }: CoachThreadsProps) {
  const { t } = useTranslation();
  const format = useFormatters();
  const queryClient = useQueryClient();
  const { data: threads, error } = useQuery(listCoachThreadsOptions());

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
            <ul className="flex flex-col gap-0.5 pr-2">
              {threads.map((thread) => (
                <li className="group/thread relative" key={thread.id}>
                  <button
                    aria-current={thread.id === selectedId ? "page" : undefined}
                    className={cn(
                      "focus-visible:ring-ring/50 flex w-full flex-col gap-1 rounded-sm px-3.5 py-2.5 pr-10 text-left transition-colors duration-100 ease-out outline-none focus-visible:ring-3 focus-visible:ring-inset",
                      thread.id === selectedId
                        ? "bg-muted"
                        : "hover:bg-muted/40",
                    )}
                    onClick={() => onSelect(thread.id)}
                    type="button"
                  >
                    <span className="text-body-sm truncate font-semibold">
                      {thread.title ?? t("threads.newConversation")}
                    </span>
                    <span className="text-caption text-stone">
                      {threadDate(thread, format, t("threads.today"))}
                    </span>
                  </button>
                  <DeleteThreadButton
                    label={t("threads.holdToDelete", {
                      title: thread.title ?? t("threads.untitled"),
                    })}
                    onConfirm={() => remove.mutate({ path: { id: thread.id } })}
                  />
                </li>
              ))}
            </ul>
          </nav>
        </ScrollArea>
      )}
    </div>
  );
}
