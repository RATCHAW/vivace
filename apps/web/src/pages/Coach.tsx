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
import { Hint } from "@/components/hint";
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
import { trackEvent } from "@/lib/logger";
import { useMediaQuery } from "@/lib/use-media-query";

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
 * A phone: below `lg`, which is the same line `Replays` draws.
 *
 * The rail is a sheet all the way up to `xl`, but between the two breakpoints
 * there is a mouse, a conversations column and room to look around. The goal
 * callout is for the screen that has none of that.
 */
const PHONE = "(max-width: 63.999rem)";

/**
 * How long after the briefing lands the goal callout arrives, and how long it
 * stays.
 *
 * The transcript resolves on its own clock, so arriving with the briefing means
 * arriving mid-swap on a screen that is still assembling itself. A beat later
 * the page is still and the athlete has had time to look at it. Three seconds
 * is a short sentence read twice — and nothing is lost when it goes, because
 * the sheet it points at is one tap away for as long as the goal is unset.
 */
const GOAL_HINT_DELAY = 900;
const GOAL_HINT_LIFE = 3000;

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
  const phone = useMediaQuery(PHONE);

  /**
   * The run "Ask the coach" arrived with, read once.
   *
   * The first thing this page does is put a conversation in the URL, and
   * `selectThread` drops `run` when it does — so anything reading the
   * attachment off the live URL would find it already gone by the time there
   * was a composer to put it in.
   */
  const [arrivedWithRun, setArrivedWithRun] = useState<number | null>(() => {
    const id = Number(params.get("run"));
    return Number.isInteger(id) && id > 0 ? id : null;
  });

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

  /**
   * Opening a conversation by hand, which is also where the arrival ends.
   *
   * The run travelled with "Ask the coach" into the conversation that opened
   * for it; walking off to another one leaves it behind, or every thread the
   * athlete visited afterwards would open with a chip they never attached.
   */
  const chooseThread = (threadId: string) => {
    setArrivedWithRun(null);
    selectThread(threadId);
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
  //
  // A run in the URL asks for a conversation of its own. Landing in whatever
  // was said last would file "why did I fade?" under a page of unrelated
  // history — and the coach reads that history, so the question would arrive
  // already answered about something else. A conversation that was started and
  // never used is that blank page already: it has no title, because a title
  // arrives with the first message, so it is reused rather than doubled.
  useEffect(() => {
    if (selectedId || !threads) return;
    const reusable = arrivedWithRun
      ? threads.find((thread) => thread.title === null)
      : threads[0];
    if (reusable) {
      selectThread(reusable.id);
    } else if (!create.isPending && !create.isSuccess) {
      create.mutate({});
    }
    // selectThread closes over `setParams`, which react-router keeps stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, threads, create.isPending, create.isSuccess, arrivedWithRun]);

  const {
    data: thread,
    error,
    isPending,
  } = useQuery({
    ...getCoachThreadOptions({ path: { id: selectedId ?? "" } }),
    enabled: Boolean(selectedId),
  });

  // The runs list is a Strava round trip, so it can land well after the
  // conversation does; the chat takes the mention whenever it turns up.
  const initialMention: RunMention | null = useMemo(() => {
    const run = runs?.find((candidate) => candidate.id === arrivedWithRun);
    return run ? toMention(run) : null;
  }, [arrivedWithRun, runs]);

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
          chooseThread(id);
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
          chooseThread(id);
          setThreadsOpen(false);
        }}
        // A briefing that failed is reported once, in the rail. Here it is an
        // empty queue rather than an undefined one, or the placeholders would
        // wait for a list that is never coming.
        queue={briefingError ? [] : briefing?.queue}
      />
    </>
  );

  // The one thing on this page an athlete can't see they are missing. On a
  // phone the rail is behind a target icon, and an icon says nothing about the
  // race that isn't set — while every answer the coach gives is quietly worse
  // for it. So the icon says it itself, once, and only while it is true.
  //
  // `briefing &&` rather than `!briefing?.context.race_name`: a briefing still
  // in flight has no goal either, and pointing at an empty rail before we know
  // it is empty is a callout the athlete taps to find nothing.
  const goalUnset = Boolean(
    phone && !railOpen && briefing && !briefing.context.race_name,
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
              {/* Below the trigger, and aligned to its end: it is the last
                  control on a header at the top of the screen, so there is
                  nothing above it but the app bar and nothing to its right but
                  the edge. */}
              <Hint
                align="end"
                content={t("rail.goalHint")}
                delay={GOAL_HINT_DELAY}
                life={GOAL_HINT_LIFE}
                onShown={() => trackEvent("ui.goal_hint_shown")}
                show={goalUnset}
                side="bottom"
              >
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
              </Hint>
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
