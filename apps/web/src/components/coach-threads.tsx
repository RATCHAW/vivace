import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import {
  createCoachThreadMutation,
  deleteCoachThreadMutation,
  listCoachThreadsOptions,
  listCoachThreadsQueryKey,
  type CoachThread,
} from "@/api";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/** Conversations older than today are dated; today's are just "Today". */
function threadDate(thread: CoachThread): string {
  const updated = new Date(thread.updated_at);
  const isToday = updated.toDateString() === new Date().toDateString();
  return isToday
    ? "Today"
    : new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
      }).format(updated);
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
      await invalidate();
      // Dropping the open conversation leaves nothing selected; the page picks
      // the next one up.
      if (variables.path.id === selectedId) onSelect("");
    },
    onError: (err) => toast.error(err.error),
  });

  return (
    <div className="flex h-full flex-col gap-4">
      <Button
        className="w-full"
        disabled={create.isPending}
        onClick={() => create.mutate({})}
        size="sm"
        variant="outline"
      >
        <PlusIcon />
        New conversation
      </Button>

      {error && (
        <p className="text-body-sm text-destructive">{error.error}</p>
      )}

      {!threads && !error && (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton className="h-12 w-full rounded-sm" key={i} />
          ))}
        </div>
      )}

      {threads?.length === 0 && (
        <p className="text-body-sm text-muted-foreground">
          Nothing yet. Ask the coach something and it will show up here.
        </p>
      )}

      {threads && threads.length > 0 && (
        <nav aria-label="Conversations" className="min-h-0 flex-1 overflow-y-auto">
          <ul className="flex flex-col gap-0.5">
            {threads.map((thread) => (
              <li className="group/thread relative" key={thread.id}>
                <button
                  aria-current={thread.id === selectedId ? "page" : undefined}
                  className={cn(
                    "focus-visible:ring-ring/50 flex w-full flex-col gap-1 rounded-sm px-3.5 py-2.5 pr-10 text-left outline-none focus-visible:ring-3 focus-visible:ring-inset",
                    thread.id === selectedId
                      ? "bg-muted"
                      : "hover:bg-muted/40",
                  )}
                  onClick={() => onSelect(thread.id)}
                  type="button"
                >
                  <span className="text-body-sm truncate font-semibold">
                    {thread.title ?? "New conversation"}
                  </span>
                  <span className="text-caption text-stone">
                    {threadDate(thread)}
                  </span>
                </button>
                <Button
                  aria-label={`Delete ${thread.title ?? "conversation"}`}
                  className="absolute top-2.5 right-1.5 opacity-0 transition-opacity group-hover/thread:opacity-100 focus-visible:opacity-100"
                  onClick={() => remove.mutate({ path: { id: thread.id } })}
                  size="icon-sm"
                  variant="ghost"
                >
                  <Trash2Icon />
                </Button>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </div>
  );
}
