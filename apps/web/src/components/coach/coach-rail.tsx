// The right-hand rail: what the coach is training the athlete for, the week
// they accepted, and the four numbers worth knowing today.
//
// Everything here comes from GET /api/coach/briefing in one request — see
// apps/api/src/briefing.ts. Nothing is computed twice: a signal shown here and
// the same signal quoted in an answer are literally the same object.
import { useTranslation } from "react-i18next";
import type {
  CoachBriefing,
  CoachSignal,
  CoachTone,
  PlanProgress,
} from "@/api";
import { useMessages, type TranslationKey } from "@/i18n";
import { useFormatters } from "@/i18n/format";
import { MonoLabel } from "@/components/mono";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { formatClock } from "@repo/video";
import { cn } from "@/lib/utils";

/** A measurement outside its band shouts; one drifting towards it murmurs. */
function toneClass(tone: CoachTone): string {
  return tone === "alert"
    ? "text-chart-3"
    : tone === "warn"
      ? "text-chart-5"
      : "text-foreground";
}

/** Whole weeks from today to the race, or null once it has been run. */
function weeksAway(raceDate: string | null): number | null {
  if (!raceDate) return null;
  const today = new Date().toISOString().slice(0, 10);
  const days = Math.round(
    (new Date(`${raceDate}T00:00:00Z`).getTime() -
      new Date(`${today}T00:00:00Z`).getTime()) /
      86_400_000,
  );
  return days < 0 ? null : Math.ceil(days / 7);
}

/** One row of the accepted week, as the briefing sends it. */
type PlanDay = NonNullable<PlanProgress>["days"][number];

/**
 * What the athlete should read off a day's mark.
 *
 * `missed` only exists once the day is behind them — a Tuesday with nothing on
 * it is still `todo` on Tuesday morning, and the chart must not say otherwise.
 */
export type PlanDayState = "rest" | "done" | "missed" | "todo";

export function planDayState(day: PlanDay, today: number | null): PlanDayState {
  if (day.actual_km > 0) return "done";
  if (day.planned_km === 0) return "rest";
  if (today !== null && day.day < today) return "missed";
  return "todo";
}

/** The sentence a screen reader gets for a day, since a bar has none. */
const DAY_READOUT: Record<PlanDayState, TranslationKey> = {
  rest: "rail.dayRest",
  done: "rail.dayDone",
  missed: "rail.dayMissed",
  todo: "rail.dayTodo",
};

/**
 * Which column is today, or `null` when the week on screen isn't the one being
 * lived. Read off the browser's calendar rather than UTC: at 23:30 in Paris the
 * two disagree, and "which day am I on" is the whole point of the marker.
 */
export function todayIndex(
  weekStarting: string,
  now = new Date(),
): number | null {
  const start = Date.parse(`${weekStarting}T00:00:00Z`);
  if (Number.isNaN(start)) return null;
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const offset = Math.round((today - start) / 86_400_000);
  return offset >= 0 && offset <= 6 ? offset : null;
}

/** `8`, `8.5` — never `8.0`, which reads as a precision the plan doesn't have. */
function km(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

/**
 * The pace inside whatever the coach wrote.
 *
 * `planned_pace` is free text — "4:35 /km", "6:00-6:15 /km", "conversational",
 * "legs up" — and the row supplies the unit itself. A range is kept whole: the
 * lower bound alone would promise a precision the week doesn't have. A note
 * with no clock in it isn't a pace at all, and the row shows none rather than
 * inventing one.
 */
export function paceValue(text: string): string | null {
  return (
    /\d{1,3}:[0-5]\d(?:\s*[-–—]\s*\d{1,3}:[0-5]\d)?/.exec(text)?.[0] ?? null
  );
}

function RailSection({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3.5">
      <div className="flex items-center justify-between gap-2">
        <MonoLabel>{title}</MonoLabel>
        {action}
      </div>
      {children}
    </section>
  );
}

function GoalRace({
  context,
  onAsk,
}: {
  context: CoachBriefing["context"];
  onAsk: (text: string) => void;
}) {
  const { t } = useTranslation();
  const format = useFormatters();
  const messages = useMessages();

  if (!context.race_name) {
    return (
      <RailSection title={t("rail.goalRace")}>
        <div className="border-border flex flex-col gap-3.5 rounded-md border p-5">
          <p className="text-caption text-muted-foreground leading-relaxed">
            {t("rail.goalRaceEmpty")}
          </p>
          <Button onClick={() => onAsk(t("rail.askGoalRace"))} size="sm">
            {t("rail.setGoalRace")}
          </Button>
        </div>
      </RailSection>
    );
  }

  const weeks = weeksAway(context.race_date);
  return (
    <RailSection
      title={t("rail.goalRace")}
      action={
        <Button
          className="h-auto px-0 font-semibold"
          onClick={() => onAsk(t("rail.askChangeGoal"))}
          size="xs"
          variant="ghost"
        >
          {t("rail.change")}
        </Button>
      }
    >
      <div className="border-border flex flex-col gap-3.5 rounded-md border p-5">
        <div className="flex flex-col gap-1.5">
          <span className="text-body-md font-semibold">
            {context.race_name}
          </span>
          <span className="text-caption text-stone">
            {context.race_date
              ? format.raceDay(context.race_date)
              : t("rail.noDate")}
            {context.race_distance_m
              ? ` · ${(context.race_distance_m / 1000).toFixed(1)} ${t("common.km")}`
              : ""}
          </span>
        </div>
        <dl className="border-border flex gap-5 border-t pt-3.5">
          <div className="flex flex-col gap-1.5">
            <dt>
              <MonoLabel className="text-mono-badge">
                {t("rail.toGo")}
              </MonoLabel>
            </dt>
            <dd className="text-heading-sm font-semibold tabular-nums">
              {weeks !== null
                ? t("rail.weeks", { count: weeks })
                : t("common.dash")}
            </dd>
          </div>
          <div className="flex flex-col gap-1.5">
            <dt>
              <MonoLabel className="text-mono-badge">
                {t("rail.target")}
              </MonoLabel>
            </dt>
            <dd className="text-heading-sm font-semibold tabular-nums">
              {context.target_seconds
                ? formatClock(context.target_seconds)
                : t("common.dash")}
            </dd>
          </div>
          <div className="flex flex-col gap-1.5">
            <dt>
              <MonoLabel className="text-mono-badge">
                {t("rail.longDay")}
              </MonoLabel>
            </dt>
            <dd className="text-heading-sm font-semibold">
              {context.long_run_day !== null
                ? messages.days.short[context.long_run_day]
                : t("common.dash")}
            </dd>
          </div>
        </dl>
      </div>
      <p className="text-caption text-stone leading-relaxed">
        {t("rail.remembers")}
      </p>
    </RailSection>
  );
}

function ThisWeek({
  plan,
  onAsk,
}: {
  plan: PlanProgress | null;
  onAsk: (text: string) => void;
}) {
  const { t } = useTranslation();
  const messages = useMessages();

  if (!plan) {
    return (
      <RailSection title={t("rail.thisWeek")}>
        <div className="border-border flex flex-col gap-3.5 rounded-md border p-5">
          <p className="text-caption text-muted-foreground leading-relaxed">
            {t("rail.noWeek")}
          </p>
          <Button onClick={() => onAsk(t("rail.planMyWeek"))} size="sm">
            {t("rail.planMyWeek")}
          </Button>
        </div>
      </RailSection>
    );
  }

  const today = todayIndex(plan.week_starting);
  // What a day reports is decided once, here, and the mark, the distance and
  // the pace all follow it: a day that has been run reports itself, a day that
  // hasn't reports what it is still being asked for.
  const cells = plan.days.map((day) => {
    const state = planDayState(day, today);
    // A run the week never asked for still counts, and the briefing types it
    // "Rest" because no session sits under it. Naming a run "Rest" on its own
    // line is a lie the old chart never had to tell, having shown no name.
    const unplanned = state === "done" && day.planned_km === 0;
    return {
      day,
      state,
      unplanned,
      name: unplanned ? t("rail.unplanned") : day.type,
      distance: km(state === "done" ? day.actual_km : day.planned_km),
      pace:
        state === "done" ? day.actual_pace : paceValue(day.planned_pace ?? ""),
    };
  });
  // The week as sessions rather than as seven slots. A rest day is the absence
  // of one, which the chart above already draws as a gap.
  const sessions = cells.filter(({ state }) => state !== "rest");
  const peak = Math.max(
    ...plan.days.map((day) => Math.max(day.planned_km, day.actual_km)),
    1,
  );
  const done =
    plan.planned_km > 0
      ? Math.min(100, Math.round((plan.actual_km / plan.planned_km) * 100))
      : 0;
  const total = t("rail.weekProgress", {
    actual: plan.actual_km,
    planned: plan.planned_km,
  });

  return (
    <RailSection
      title={t("rail.thisWeek")}
      action={
        <Button
          className="h-auto px-0 font-semibold"
          onClick={() => onAsk(t("rail.askAdjustWeek"))}
          size="xs"
          variant="ghost"
        >
          {t("rail.adjust")}
        </Button>
      }
    >
      <div className="border-border flex flex-col gap-5 rounded-md border p-5">
        {/* The number first. It used to be a footnote under the chart, and it
            was the only thing on the card a reader could act on. */}
        <div className="flex flex-col gap-2.5">
          <div className="flex flex-col gap-1.5">
            {/* The coach names its weeks, and the names run long — "Rebuild 1
                of 10 · Easy re-entry". An eyebrow above the number rather than
                a neighbour beside it, or the number is the thing that wraps. */}
            {plan.label ? (
              <MonoLabel className="text-mono-badge">{plan.label}</MonoLabel>
            ) : null}
            <span className="text-heading-sm font-semibold whitespace-nowrap tabular-nums">
              {total}
            </span>
          </div>
          <Progress aria-label={total} value={done} variant="brand" />
        </div>

        {/* The shape of the week, and only the shape — every number it draws is
            spelled out in the sessions below, so there is nothing here for a
            screen reader that it is not about to be told in words. */}
        <div aria-hidden className="flex flex-col">
          <div className="flex h-[72px] items-end gap-1.5">
            {cells.map(({ day, state }) => {
              // A rest day keeps its place in the row and puts nothing in it:
              // five of these is the normal mid-week state, and five marks
              // saying "nothing happened" is what the card used to spend its
              // width on.
              if (state === "rest")
                return (
                  <div className="flex-1" data-day={day.day} key={day.day} />
                );
              const top = Math.max(day.planned_km, day.actual_km);
              return (
                // The plan is the outline; only what was run is filled in. The
                // tallest solid mark on the card is therefore always an
                // achievement — which is what a bar already promises a reader.
                <div
                  className={cn(
                    "bg-muted/50 relative flex-1 overflow-hidden rounded-[4px] border transition-[height] duration-300 ease-out motion-reduce:transition-none",
                    // Dashed is the plan's outline, and it is only worth
                    // drawing while there is something left inside it: a day
                    // run in full is one solid mark, not a bar in a box.
                    day.actual_km >= top
                      ? "border-brand"
                      : "border-muted-foreground/55 border-dashed",
                    state === "missed" && "border-chart-5/70 bg-chart-5/10",
                  )}
                  data-day={day.day}
                  data-state={state}
                  key={day.day}
                  style={{ height: `${Math.round(18 + 82 * (top / peak))}%` }}
                >
                  <span
                    className="bg-brand absolute inset-x-0 bottom-0 transition-[height] duration-300 ease-out motion-reduce:transition-none"
                    style={{
                      height: `${Math.round((day.actual_km / top) * 100)}%`,
                    }}
                  />
                </div>
              );
            })}
          </div>
          {/* One rule under all seven, so a day with nothing on it reads as an
              empty place on a line rather than as a mark of its own. */}
          <div className="border-border mt-2 flex gap-1.5 border-t pt-2">
            {cells.map(({ day, state }) => (
              <MonoLabel
                className={cn(
                  "text-mono-badge flex-1 text-center",
                  day.day === today && "text-foreground font-semibold",
                  state === "missed" && "text-chart-5",
                )}
                key={day.day}
              >
                {messages.days.initial[day.day]}
              </MonoLabel>
            ))}
          </div>
        </div>

        {/* Each session on its own line, because a distance and a pace do not
            both fit under a mark 28px wide — and a mark can't say "Tempo" at
            all. Every number carries its unit here, which is what the row of
            bare figures under the chart never did. */}
        <ul className="flex flex-col gap-2.5">
          {sessions.map(({ day, state, unplanned, name, distance, pace }) => (
            <li className="flex items-baseline gap-2.5" key={day.day}>
              <MonoLabel
                aria-hidden
                className={cn(
                  "text-mono-badge w-7 shrink-0",
                  day.day === today && "text-foreground font-semibold",
                  state === "missed" && "text-chart-5",
                )}
              >
                {messages.days.short[day.day]}
              </MonoLabel>
              {/* The one thing here allowed to lose characters: "8 × 400 with
                  90s float" is a name, and a number that truncates is a lie. */}
              <span
                aria-hidden
                className={cn(
                  "text-caption min-w-0 flex-1 truncate",
                  unplanned && "text-muted-foreground",
                )}
                title={name}
              >
                {name}
              </span>
              {/* Solid ink is a session that happened, the same promise the
                  filled mark above it makes; grey is one the week is still
                  asking for. */}
              <span
                aria-hidden
                className={cn(
                  "text-mono-badge shrink-0 font-mono tracking-normal tabular-nums",
                  state === "done" ? "text-foreground" : "text-stone",
                  state === "missed" && "text-chart-5",
                )}
              >
                {distance} {t("common.km")}
                {pace ? ` · ${pace} ${t("common.perKm")}` : ""}
              </span>
              {/* Colour is the only thing separating a session that happened
                  from one that hasn't, so the readout says it in words. */}
              <span className="sr-only">
                {unplanned
                  ? t("rail.dayUnplanned", {
                      day: messages.days.long[day.day],
                      actual: day.actual_km,
                    })
                  : t(DAY_READOUT[state], {
                      day: messages.days.long[day.day],
                      type: day.type,
                      actual: day.actual_km,
                      planned: day.planned_km,
                    })}
                {pace
                  ? ` · ${t(state === "done" ? "rail.dayRanAt" : "rail.dayAtPace", { pace })}`
                  : ""}
                {day.day === today ? ` — ${t("rail.today")}` : ""}
              </span>
            </li>
          ))}
        </ul>

        <p className="text-caption border-border border-t pt-3.5">
          {plan.remaining === 0
            ? t("rail.weekComplete")
            : t("rail.sessionsLeft", { count: plan.remaining })}
        </p>
      </div>
      <p className="text-caption text-stone leading-relaxed">
        {t("rail.weekLegend")}
      </p>
    </RailSection>
  );
}

function Signals({
  signals,
  onAsk,
}: {
  signals: CoachSignal[];
  onAsk: (text: string) => void;
}) {
  const { t } = useTranslation();
  if (signals.length === 0) return null;

  return (
    <RailSection title={t("rail.signals")}>
      <div className="flex flex-col">
        {signals.map((signal) => (
          <button
            className="border-border hover:bg-muted/40 focus-visible:ring-ring/50 flex w-full items-center gap-3 border-t px-0.5 py-3.5 text-left transition-colors duration-100 ease-out outline-none focus-visible:ring-3 focus-visible:ring-inset"
            key={signal.id}
            onClick={() => onAsk(signal.question)}
            type="button"
          >
            <span className="flex min-w-0 flex-col gap-1">
              <span className="text-caption font-semibold">{signal.label}</span>
              <span className="text-mono-badge text-stone font-mono">
                {signal.note}
              </span>
            </span>
            <span
              className={cn(
                "text-body-md ml-auto font-semibold whitespace-nowrap tabular-nums",
                toneClass(signal.tone),
              )}
            >
              {signal.value}
            </span>
          </button>
        ))}
      </div>
      <p className="text-caption text-stone">{t("rail.tapSignal")}</p>
    </RailSection>
  );
}

export interface CoachRailProps {
  briefing: CoachBriefing | undefined;
  onAsk: (text: string) => void;
}

/** The athlete's context, week and signals, down the right-hand side. */
export function CoachRail({ briefing, onAsk }: CoachRailProps) {
  if (!briefing) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-40 w-full rounded-md" />
        <Skeleton className="h-36 w-full rounded-md" />
        <Skeleton className="h-52 w-full rounded-md" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-7">
      <GoalRace context={briefing.context} onAsk={onAsk} />
      <ThisWeek onAsk={onAsk} plan={briefing.plan} />
      <Signals onAsk={onAsk} signals={briefing.signals} />
    </div>
  );
}

export interface CoachQueueProps {
  /** `undefined` while the briefing is in flight, the same as the rail's. */
  queue: CoachBriefing["queue"] | undefined;
  onAsk: (text: string, runId?: number) => void;
  /** Opening a conversation the coach already wrote, rather than asking again. */
  onOpenThread: (threadId: string) => void;
}

/**
 * What the coach would raise if the athlete said nothing.
 *
 * Sits under the thread list, because it is the same kind of thing: a way into
 * a conversation. Most items are a question — tapping one asks it. An item that
 * carries a thread is one the coach already answered on its own, and opens it.
 */
export function CoachQueue({ queue, onAsk, onOpenThread }: CoachQueueProps) {
  const { t } = useTranslation();
  // Loaded and empty is the one case with nothing to say; still loading gets
  // the placeholders, so the column doesn't reflow when the briefing lands.
  if (queue?.length === 0) return null;

  return (
    // Pinned under the thread list rather than scrolling with it: it is at most
    // four items, and it is the one thing on this column an athlete who has not
    // asked anything yet is meant to see. The hairline is where the list ends.
    <div className="border-border flex shrink-0 flex-col gap-2.5 border-t pt-6">
      <MonoLabel className="pl-1.5">{t("rail.queue")}</MonoLabel>
      {!queue &&
        Array.from({ length: 2 }, (_, i) => (
          <Skeleton className="h-[70px] w-full rounded-md" key={i} />
        ))}
      {queue?.map((item) => (
        <button
          className="border-border hover:bg-muted focus-visible:ring-ring/50 flex gap-2.5 rounded-md border p-3 text-left transition-colors duration-100 ease-out outline-none focus-visible:ring-3 focus-visible:ring-inset"
          key={item.id}
          onClick={() =>
            item.thread_id
              ? onOpenThread(item.thread_id)
              : onAsk(item.question, item.run_id ?? undefined)
          }
          type="button"
        >
          <span
            className={cn(
              "mt-1.5 size-1.5 shrink-0 rounded-full",
              item.tone === "alert"
                ? "bg-chart-3"
                : item.tone === "warn"
                  ? "bg-chart-5"
                  : "bg-brand",
            )}
          />
          <span className="flex min-w-0 flex-col gap-1">
            <span className="text-caption leading-snug font-semibold">
              {item.title}
            </span>
            <MonoLabel className="text-mono-badge">{item.when}</MonoLabel>
          </span>
        </button>
      ))}
    </div>
  );
}
