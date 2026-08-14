import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ChevronDownIcon, Loader2Icon } from "lucide-react";
import {
  createCoachThreadMutation,
  getCoachBriefingOptions,
  getCoachThreadOptions,
  getRunsOptions,
  listCoachThreadsOptions,
  listCoachThreadsQueryKey,
  toUIMessages,
} from "@/api";
import { AppHeader } from "@/components/app-header";
import { CoachChat } from "@/components/coach-chat";
import { CoachQueue, CoachRail } from "@/components/coach/coach-rail";
import { toMention, type RunMention } from "@/components/coach/coach-composer";
import { CoachThreads } from "@/components/coach-threads";
import { MonoLabel } from "@/components/mono";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

/**
 * How much history the coach reads for this thread.
 *
 * A window rather than "everything": an athlete asking how the block is going
 * means the block, not the season, and the choice reaches both the system
 * prompt and the volume tool's default.
 */
const RANGES = [
  { label: "coach.range6", weeks: 6 },
  { label: "coach.range12", weeks: 12 },
  { label: "coach.rangeSeason", weeks: 52 },
] as const;

/**
 * The coach.
 *
 * Three columns: the conversations and what the coach would raise unprompted,
 * the thread itself, and what it remembers about the athlete. The open
 * conversation lives in the URL (`?thread=`), so it survives a reload and can be
 * linked to; `?run=` attaches a run on arrival, which is how "Ask the coach"
 * travels from a replay.
 */
export function Coach() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const selectedId = params.get("thread");
  const [rangeIndex, setRangeIndex] = useState(0);
  const range = RANGES[rangeIndex];

  // The rails sit outside the chat but ask through it. The chat re-registers on
  // every render, so this is never a stale send.
  const askRef = useRef<((text: string, runId?: number) => void) | null>(null);
  const ask = (text: string, runId?: number) => askRef.current?.(text, runId);

  const selectThread = (threadId: string) => {
    const next = new URLSearchParams(params);
    if (threadId) next.set("thread", threadId);
    else next.delete("thread");
    // The attached run belongs to the arrival, not to every thread after it.
    next.delete("run");
    setParams(next, { replace: true });
  };

  const { data: threads } = useQuery(listCoachThreadsOptions());
  const { data: runs } = useQuery(getRunsOptions());
  const { data: briefing, error: briefingError } = useQuery(
    getCoachBriefingOptions(),
  );

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

  // `?run=` arrives from a replay's "Ask the coach"; it is only the opening
  // attachment, so it is read once rather than watched.
  const requestedRun = Number(params.get("run"));
  const initialMention: RunMention | null = useMemo(() => {
    const run = runs?.find((candidate) => candidate.id === requestedRun);
    return run ? toMention(run) : null;
  }, [requestedRun, runs]);

  const threadTitle =
    threads?.find((candidate) => candidate.id === selectedId)?.title ??
    t("coach.newConversation");

  return (
    <>
      <AppHeader />

      <main className="mx-auto grid h-[calc(100svh-4rem)] w-full max-w-[1440px] grid-cols-1 lg:grid-cols-[248px_minmax(0,1fr)] xl:grid-cols-[248px_minmax(0,1fr)_332px]">
        <aside className="border-border hidden flex-col gap-6 overflow-y-auto border-r px-4 py-5 lg:flex">
          <CoachThreads onSelect={selectThread} selectedId={selectedId} />
          <CoachQueue
            onAsk={ask}
            onOpenThread={selectThread}
            queue={briefing?.queue}
          />
        </aside>

        <section aria-label={t("coach.section")} className="flex min-h-0 flex-col">
          <header className="border-border flex h-[68px] shrink-0 items-center gap-4 border-b px-6">
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="text-body-md truncate font-semibold">
                {threadTitle}
              </span>
              <MonoLabel className="text-mono-badge">
                {t("coach.reading", {
                  count: runs?.length ?? 0,
                  range: t(range.label),
                })}
              </MonoLabel>
            </div>
            <Button
              className="ml-auto"
              onClick={() => setRangeIndex((index) => (index + 1) % RANGES.length)}
              size="sm"
              variant="subtle"
            >
              {t(range.label)}
              <ChevronDownIcon data-icon="inline-end" />
            </Button>
          </header>

          {error ? (
            <Alert className="mt-6" variant="destructive">
              <AlertTitle>{t("coach.openError")}</AlertTitle>
              <AlertDescription>{error.error}</AlertDescription>
            </Alert>
          ) : !selectedId || isPending || !thread ? (
            <div className="flex flex-1 items-center justify-center">
              <Loader2Icon className="text-muted-foreground size-6 animate-spin" />
              <span className="sr-only">{t("coach.loadingConversation")}</span>
            </div>
          ) : (
            // Keyed so switching threads rebuilds the chat rather than replaying
            // one conversation's stream into another's transcript.
            <CoachChat
              acceptedWeek={briefing?.plan?.week_starting ?? null}
              initialMention={initialMention}
              initialMessages={toUIMessages(thread.messages)}
              key={thread.thread.id}
              onOpenRun={(runId) => navigate(`/runs?run=${runId}`)}
              rangeWeeks={range.weeks}
              registerAsk={(fn) => {
                askRef.current = fn;
              }}
              runs={runs}
              threadId={thread.thread.id}
            />
          )}
        </section>

        <aside className="border-border hidden overflow-y-auto border-l px-5 py-6 xl:block">
          {briefingError ? (
            <Alert variant="destructive">
              <AlertTitle>{t("coach.briefingError")}</AlertTitle>
              <AlertDescription>{briefingError.error}</AlertDescription>
            </Alert>
          ) : (
            <CoachRail briefing={briefing} onAsk={ask} />
          )}
        </aside>
      </main>
    </>
  );
}
