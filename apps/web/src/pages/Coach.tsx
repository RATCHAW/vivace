import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Loader2Icon, MessagesSquareIcon, TargetIcon } from "lucide-react";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

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

/** The catalogue key doubles as the select's value — stable, and unique. */
type RangeLabel = (typeof RANGES)[number]["label"];

/**
 * The coach.
 *
 * Three columns: the conversations and what the coach would raise unprompted,
 * the thread itself, and what it remembers about the athlete. The open
 * conversation lives in the URL (`?thread=`), so it survives a reload and can be
 * linked to; `?run=` attaches a run on arrival, which is how "Ask the coach"
 * travels from a replay.
 *
 * Below `xl` a column doesn't fit, so it becomes a sheet reached from the thread
 * header — the same component, not a second rendering of it. Hiding the two
 * outer columns was the whole mobile story before, which left a phone with no
 * way to change conversation and no sight of the goal race or the signals the
 * answers are built on.
 */
export function Coach() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const selectedId = params.get("thread");
  const [rangeLabel, setRangeLabel] = useState<RangeLabel>(RANGES[0].label);
  const range = RANGES.find((entry) => entry.label === rangeLabel) ?? RANGES[0];
  const [threadsOpen, setThreadsOpen] = useState(false);
  const [railOpen, setRailOpen] = useState(false);

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

  // The two outer columns, written once each. A sheet shows what the column
  // does, and closes on whatever the tap was for — picking a thread or asking a
  // question puts the athlete back in the transcript, which is where the answer
  // is about to appear.
  //
  // `inSheet` is the one thing the two renderings don't share: a row's actions
  // are revealed by hover in the column, and a sheet is what this becomes on a
  // phone, where there is no hover to reveal them with.
  const conversations = (inSheet: boolean) => (
    <>
      <CoachThreads
        inSheet={inSheet}
        onSelect={(id) => {
          selectThread(id);
          setThreadsOpen(false);
        }}
        selectedId={selectedId}
      />
      <CoachQueue
        onAsk={(text, runId) => {
          ask(text, runId);
          setThreadsOpen(false);
        }}
        onOpenThread={(id) => {
          selectThread(id);
          setThreadsOpen(false);
        }}
        // A briefing that failed is reported once, in the rail. Here it is an
        // empty queue rather than an undefined one, or the placeholders would
        // wait for a list that is never coming.
        queue={briefingError ? [] : briefing?.queue}
      />
    </>
  );

  const rail = briefingError ? (
    <Alert variant="destructive">
      <AlertTitle>{t("coach.briefingError")}</AlertTitle>
      <AlertDescription>{briefingError.error}</AlertDescription>
    </Alert>
  ) : (
    <CoachRail
      briefing={briefing}
      onAsk={(text) => {
        ask(text);
        setRailOpen(false);
      }}
    />
  );

  return (
    <>
      <AppHeader />

      <main className="mx-auto grid h-[calc(100svh-4rem)] w-full max-w-[1440px] grid-cols-1 lg:grid-cols-[248px_minmax(0,1fr)] xl:grid-cols-[248px_minmax(0,1fr)_332px]">
        {/* Clipped, not scrollable: the thread list inside carries the only
            scroll region, so the column can't grow a second bar around it. */}
        <aside className="border-border hidden min-h-0 flex-col gap-6 overflow-hidden border-r px-4 py-5 lg:flex">
          {conversations(false)}
        </aside>

        <section
          aria-label={t("coach.section")}
          className="flex min-h-0 flex-col"
        >
          <header className="border-border flex h-[68px] shrink-0 items-center gap-2 border-b px-4 sm:gap-3 sm:px-6">
            <Sheet onOpenChange={setThreadsOpen} open={threadsOpen}>
              <SheetTrigger
                render={
                  <Button
                    aria-label={t("threads.listLabel")}
                    className="lg:hidden"
                    size="icon-sm"
                    variant="subtle"
                  />
                }
              >
                <MessagesSquareIcon />
              </SheetTrigger>
              <SheetContent side="left">
                <SheetHeader>
                  <SheetTitle>{t("threads.listLabel")}</SheetTitle>
                </SheetHeader>
                <SheetBody className="flex flex-col gap-6">
                  {conversations(true)}
                </SheetBody>
              </SheetContent>
            </Sheet>

            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-body-md truncate font-semibold">
                {threadTitle}
              </span>
              <MonoLabel className="text-mono-badge truncate">
                {t("coach.reading", {
                  count: runs?.length ?? 0,
                  range: t(range.label),
                })}
              </MonoLabel>
            </div>

            {/* A select, not the cycling button this used to be: the chevron
                was promising a list, and a control you have to press twice to
                go back is a list with the list taken away. */}
            <Select
              onValueChange={(next) => setRangeLabel(next as RangeLabel)}
              value={range.label}
            >
              <SelectTrigger
                aria-label={t("coach.rangeSelect")}
                className="shrink-0"
                size="sm"
              >
                <SelectValue>{t(range.label)}</SelectValue>
              </SelectTrigger>
              <SelectContent align="end" alignItemWithTrigger={false}>
                {RANGES.map((entry) => (
                  <SelectItem key={entry.label} value={entry.label}>
                    {t(entry.label)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Sheet onOpenChange={setRailOpen} open={railOpen}>
              <SheetTrigger
                render={
                  <Button
                    aria-label={t("rail.title")}
                    className="xl:hidden"
                    size="icon-sm"
                    variant="subtle"
                  />
                }
              >
                <TargetIcon />
              </SheetTrigger>
              <SheetContent side="right">
                <SheetHeader>
                  <SheetTitle>{t("rail.title")}</SheetTitle>
                </SheetHeader>
                <SheetBody>{rail}</SheetBody>
              </SheetContent>
            </Sheet>
          </header>

          {error ? (
            <Alert className="mx-4 mt-6 w-auto sm:mx-6" variant="destructive">
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
              onOpenRun={(runId) => navigate(`/replays?run=${runId}`)}
              rangeWeeks={range.weeks}
              registerAsk={(fn) => {
                askRef.current = fn;
              }}
              runs={runs}
              threadId={thread.thread.id}
            />
          )}
        </section>

        {/* The padding is on the content, not the panel, so the rail's thumb
            rides the border rather than floating 20px inside it. */}
        <aside className="border-border hidden min-h-0 overflow-hidden border-l xl:block">
          <ScrollArea className="h-full">
            <div className="px-5 py-6">{rail}</div>
          </ScrollArea>
        </aside>
      </main>
    </>
  );
}
