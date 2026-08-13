// The right-hand rail: what the coach is training the athlete for, the week
// they accepted, and the four numbers worth knowing today.
//
// Everything here comes from GET /api/coach/briefing in one request — see
// apps/api/src/briefing.ts. Nothing is computed twice: a signal shown here and
// the same signal quoted in an answer are literally the same object.
import type { CoachBriefing, CoachSignal, CoachTone, PlanProgress } from "@/api";
import { MonoLabel } from "@/components/mono";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatClock } from "@repo/video";
import { cn } from "@/lib/utils";

const DAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
const DAY_INITIAL = ["M", "T", "W", "T", "F", "S", "S"] as const;

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

/** `Sun 18 Oct` — the way a race day is written on a start list. */
function raceDay(date: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
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
  if (!context.race_name) {
    return (
      <RailSection title="Goal race">
        <div className="border-border flex flex-col gap-3.5 rounded-md border p-5">
          <p className="text-caption text-muted-foreground leading-relaxed">
            The coach plans around a date. Tell it what you&rsquo;re training for
            once and every thread starts knowing.
          </p>
          <Button
            onClick={() =>
              onAsk("I'm training for a race — let me tell you about it")
            }
            size="sm"
          >
            Set a goal race
          </Button>
        </div>
      </RailSection>
    );
  }

  const weeks = weeksAway(context.race_date);
  return (
    <RailSection
      title="Goal race"
      action={
        <Button
          className="h-auto px-0 font-semibold"
          onClick={() => onAsk("I want to change my goal race")}
          size="xs"
          variant="ghost"
        >
          Change
        </Button>
      }
    >
      <div className="border-border flex flex-col gap-3.5 rounded-md border p-5">
        <div className="flex flex-col gap-1.5">
          <span className="text-body-md font-semibold">{context.race_name}</span>
          <span className="text-caption text-stone">
            {context.race_date ? raceDay(context.race_date) : "No date yet"}
            {context.race_distance_m
              ? ` · ${(context.race_distance_m / 1000).toFixed(1)} km`
              : ""}
          </span>
        </div>
        <dl className="border-border flex gap-5 border-t pt-3.5">
          <div className="flex flex-col gap-1.5">
            <dt>
              <MonoLabel className="text-mono-badge">To go</MonoLabel>
            </dt>
            <dd className="text-heading-sm font-semibold tabular-nums">
              {weeks !== null ? `${weeks} wk` : "—"}
            </dd>
          </div>
          <div className="flex flex-col gap-1.5">
            <dt>
              <MonoLabel className="text-mono-badge">Target</MonoLabel>
            </dt>
            <dd className="text-heading-sm font-semibold tabular-nums">
              {context.target_seconds ? formatClock(context.target_seconds) : "—"}
            </dd>
          </div>
          <div className="flex flex-col gap-1.5">
            <dt>
              <MonoLabel className="text-mono-badge">Long day</MonoLabel>
            </dt>
            <dd className="text-heading-sm font-semibold">
              {context.long_run_day !== null
                ? DAY_SHORT[context.long_run_day]
                : "—"}
            </dd>
          </div>
        </dl>
      </div>
      <p className="text-caption text-stone leading-relaxed">
        The coach remembers this in every thread — you never re-explain what
        you&rsquo;re training for.
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
  if (!plan) {
    return (
      <RailSection title="This week">
        <div className="border-border flex flex-col gap-3.5 rounded-md border p-5">
          <p className="text-caption text-muted-foreground leading-relaxed">
            No week accepted yet. Ask for one and it lands here as sessions, not
            a paragraph.
          </p>
          <Button onClick={() => onAsk("Plan my week")} size="sm">
            Plan my week
          </Button>
        </div>
      </RailSection>
    );
  }

  const peak = Math.max(...plan.days.map((day) => Math.max(day.planned_km, day.actual_km)), 1);

  return (
    <RailSection title="This week">
      <div className="border-border flex flex-col gap-4 rounded-md border p-5">
        <div className="flex h-[92px] items-end gap-2">
          {plan.days.map((day) => (
            <div
              className="flex h-full flex-1 flex-col gap-1.5"
              key={day.day}
              title={`${DAY_SHORT[day.day]} · ${day.type} · ${day.actual_km} of ${day.planned_km} km`}
            >
              {/* The planned bar is the track; the actual run fills it. Both
                  are absolute inside a flexible plot area — as a flex sibling
                  of the day letter the track would shrink to fit instead. */}
              <div className="relative min-h-0 flex-1">
                <span
                  className="bg-muted-foreground/15 absolute inset-x-0 bottom-0 rounded-[4px]"
                  style={{
                    height: `${Math.round(6 + 94 * (Math.max(day.planned_km, day.actual_km) / peak))}%`,
                  }}
                >
                  <span
                    className="bg-brand absolute inset-x-0 bottom-0 rounded-[4px]"
                    style={{
                      height: `${Math.min(100, Math.round((day.actual_km / Math.max(day.planned_km, day.actual_km, 1)) * 100))}%`,
                    }}
                  />
                </span>
              </div>
              <MonoLabel className="text-mono-badge block text-center">
                {DAY_INITIAL[day.day]}
              </MonoLabel>
            </div>
          ))}
        </div>
        <p className="text-caption border-border border-t pt-3.5">
          {plan.actual_km} of {plan.planned_km} km ·{" "}
          {plan.remaining === 0
            ? "week complete"
            : `${plan.remaining} session${plan.remaining === 1 ? "" : "s"} left`}
        </p>
      </div>
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
  if (signals.length === 0) return null;

  return (
    <RailSection title="Signals">
      <div className="flex flex-col">
        {signals.map((signal) => (
          <button
            className="border-border hover:bg-muted/40 focus-visible:ring-ring/50 flex w-full items-center gap-3 border-t px-0.5 py-3.5 text-left outline-none focus-visible:ring-3 focus-visible:ring-inset"
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
      <p className="text-caption text-stone">Tap a signal to ask about it.</p>
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
  if (!queue || queue.length === 0) return null;

  return (
    <div className="flex flex-col gap-2.5">
      <MonoLabel className="pl-1.5">Coach queue</MonoLabel>
      {queue.map((item) => (
        <button
          className="border-border hover:bg-muted focus-visible:ring-ring/50 flex gap-2.5 rounded-md border p-3 text-left outline-none focus-visible:ring-3 focus-visible:ring-inset"
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
