import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2Icon } from "lucide-react";
import {
  createCoachThreadMutation,
  getCoachThreadOptions,
  listCoachThreadsOptions,
  listCoachThreadsQueryKey,
  toUIMessages,
} from "@/api";
import { AppHeader } from "@/components/app-header";
import { CoachChat } from "@/components/coach-chat";
import { CoachThreads } from "@/components/coach-threads";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

/**
 * The coach.
 *
 * The open conversation lives in the URL (`?thread=`), so it survives a reload
 * and can be linked to. Landing here with none selected picks the most recent
 * one, or starts a first conversation when the athlete has never asked anything.
 */
export function Coach() {
  const [params, setParams] = useSearchParams();
  const queryClient = useQueryClient();
  const selectedId = params.get("thread");

  const selectThread = (threadId: string) =>
    setParams(threadId ? { thread: threadId } : {}, { replace: true });

  const { data: threads } = useQuery(listCoachThreadsOptions());

  const create = useMutation({
    ...createCoachThreadMutation(),
    onSuccess: async (thread) => {
      await queryClient.invalidateQueries({
        queryKey: listCoachThreadsQueryKey(),
      });
      selectThread(thread.id);
    },
  });

  // Nothing selected: open the newest conversation, or open a fresh one. The
  // guard on isPending and isSuccess keeps a slow round trip from starting two.
  useEffect(() => {
    if (selectedId || !threads) return;
    if (threads.length > 0) {
      selectThread(threads[0].id);
    } else if (!create.isPending && !create.isSuccess) {
      create.mutate({});
    }
    // selectThread closes over `setParams`, which react-router keeps stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, threads, create.isPending, create.isSuccess]);

  const {
    data: thread,
    error,
    isPending,
  } = useQuery({
    ...getCoachThreadOptions({ path: { id: selectedId ?? "" } }),
    enabled: Boolean(selectedId),
  });

  return (
    <>
      <AppHeader />

      <main className="mx-auto grid h-[calc(100svh-4rem)] w-full max-w-[1200px] grid-cols-1 gap-8 px-6 sm:px-8 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="hidden py-6 lg:block">
          <CoachThreads onSelect={selectThread} selectedId={selectedId} />
        </aside>

        <section aria-label="Coach" className="flex min-h-0 flex-col">
          {error ? (
            <Alert className="mt-6" variant="destructive">
              <AlertTitle>Could not open this conversation</AlertTitle>
              <AlertDescription>{error.error}</AlertDescription>
            </Alert>
          ) : !selectedId || isPending || !thread ? (
            <div className="flex flex-1 items-center justify-center">
              <Loader2Icon className="text-muted-foreground size-6 animate-spin" />
              <span className="sr-only">Loading your conversation…</span>
            </div>
          ) : (
            // Keyed so switching threads rebuilds the chat rather than replaying
            // one conversation's stream into another's transcript.
            <CoachChat
              initialMessages={toUIMessages(thread.messages)}
              key={thread.thread.id}
              threadId={thread.thread.id}
            />
          )}
        </section>
      </main>
    </>
  );
}
