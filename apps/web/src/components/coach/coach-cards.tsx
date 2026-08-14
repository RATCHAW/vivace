// The coach's answers, drawn rather than written.
//
// Each of these renders one tool result from apps/api/src/coach.ts. The tool
// outputs carry a `card` discriminator and every number already formatted for a
// runner, so nothing here computes training — it lays out what the API measured.
// Change a tool's output shape and the matching card has to move with it.
import { type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { ArrowRightIcon, CheckIcon } from "lucide-react";
import type { PlannedSession } from "@/api";
import { useMessages } from "@/i18n";
import { useFormatters } from "@/i18n/format";
import { MonoLabel } from "@/components/mono";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// --- the shapes the API draws -------------------------------------------------

interface Stat {
  label: string;
  value: string;
}

export interface DebriefCard {
  card: "run-debrief";
  run_id: number;
  title: string;
  date: string;
  stamp: string;
  /** An SVG path in a 100-square viewBox, or null for a treadmill run. */
  route_path: string | null;
  line: string;
  stats: Stat[];
  elevation_m: number;
  calories: number | null;
}

export interface SplitsCard {
  card: "run-splits";
  run_id: number;
  title: string;
  splits: {
    km: number;
    pace_per_km: string | null;
    seconds_per_km: number;
    avg_heartrate: number | null;
    partial_km?: number;
  }[];
  first_half_pace: string | null;
  second_half_pace: string | null;
  fade_seconds_per_km: number;
  decoupling_pct: number | null;
  avg_heartrate: number | null;
  max_heartrate: number | null;
}

export interface VolumeCard {
  card: "training-volume";
  weeks: {
    week_starting: string;
    runs: number;
    km: number;
    avg_pace_per_km: string | null;
    ramp_pct: number | null;
  }[];
  load: { acute_km: number; chronic_km: number; ratio: number } | null;
  easy_intensity: { share: number; easy_runs: number; zone3_floor: number } | null;
}

export interface PredictionCard {
  card: "race-prediction";
  efforts: {
    name: string;
    time: string;
    date: string;
    pr: boolean;
    activity_id: number;
  }[];
  predictions: {
    name: string;
    time: string;
    pace_per_km: string | null;
    from: { name: string; time: string; date: string };
  }[];
  goal: {
    race: string | null;
    distance: string;
    today: string;
    target: string | null;
    gap_seconds: number | null;
    weeks_to_race: number | null;
  } | null;
}

export interface PlanCard {
  card: "week-plan";
  week_starting: string;
  label: string | null;
  sessions: PlannedSession[];
  total_km: number;
  quality: number;
  accepted: boolean;
}

export type CoachCard =
  | DebriefCard
  | SplitsCard
  | VolumeCard
  | PredictionCard
  | PlanCard;

/**
 * A tool result, if it is one of ours.
 *
 * Tool output arrives as `unknown` — it round-trips through the database as
 * stored message parts, so a card written by an older version of the API can
 * still be in a transcript. Anything unrecognised falls back to the plain tool
 * chip rather than crashing the thread.
 */
export function asCoachCard(output: unknown): CoachCard | null {
  if (typeof output !== "object" || output === null || !("card" in output)) {
    return null;
  }
  const kind = (output as { card: unknown }).card;
  return kind === "run-debrief" ||
    kind === "run-splits" ||
    kind === "training-volume" ||
    kind === "race-prediction" ||
    kind === "week-plan"
    ? (output as CoachCard)
    : null;
}

export interface CardActions {
  /** Send a new message, optionally about one run. */
  onAsk: (text: string, runId?: number) => void;
  /** Accept a proposed week. */
  onAcceptPlan: (card: PlanCard) => void;
  /** True while the accept request is in flight. */
  accepting?: boolean;
  /** The week already accepted, so a re-rendered card knows it is live. */
  acceptedWeek?: string | null;
}

// --- shared furniture ---------------------------------------------------------

/** The frame every card shares: elevated surface, hairline, 20px radius. */
function CardShell({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "bg-card border-border max-w-[660px] overflow-hidden rounded-lg border",
        className,
      )}
    >
      {children}
    </div>
  );
}

function CardHeading({ title, aside }: { title: string; aside?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-body-sm font-semibold">{title}</span>
      {aside}
    </div>
  );
}

/**
 * The sentence under a chart, with a coloured rule beside it. DESIGN.md keeps
 * accents out of button surfaces; a 3px rule beside a reading is illustration.
 */
function Callout({
  tone = "brand",
  children,
}: {
  tone?: "brand" | "warn" | "alert";
  children: ReactNode;
}) {
  return (
    <div className="border-border flex items-stretch gap-2.5 border-t pt-4">
      <span
        className={cn(
          "w-[3px] shrink-0 rounded-full",
          tone === "alert" && "bg-chart-3",
          tone === "warn" && "bg-chart-5",
          tone === "brand" && "bg-brand",
        )}
      />
      <span className="text-caption leading-relaxed">{children}</span>
    </div>
  );
}

// --- the run debrief ----------------------------------------------------------

/** One run, its route and its numbers — what lands after a run is uploaded. */
export function RunDebrief({
  card,
  actions,
}: {
  card: DebriefCard;
  actions: CardActions;
}) {
  const { t } = useTranslation();

  return (
    <CardShell>
      <div className="border-border flex items-center gap-2.5 border-b px-5 py-3.5">
        <span className="bg-brand size-1.5 rounded-full" />
        <MonoLabel className="text-mono-badge">
          {card.stamp} · {card.date}
        </MonoLabel>
      </div>

      <div className="flex items-start gap-5 p-5">
        {card.route_path ? (
          <svg
            aria-hidden
            className="border-border bg-background size-[108px] shrink-0 rounded-md border"
            viewBox="0 0 100 100"
          >
            <path
              d={card.route_path}
              fill="none"
              stroke="currentColor"
              className="text-muted-foreground/25"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={5}
            />
            <path
              d={card.route_path}
              fill="none"
              className="text-brand"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2.5}
            />
          </svg>
        ) : (
          <div className="border-border bg-background flex size-[108px] shrink-0 items-center justify-center rounded-md border">
            <MonoLabel className="text-mono-badge text-center">
              {t("cards.noRouteLine1")}
              <br />
              {t("cards.noRouteLine2")}
            </MonoLabel>
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <span className="text-body-md font-semibold">{card.title}</span>
            <span className="text-caption text-muted-foreground">{card.line}</span>
          </div>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {card.stats.map((stat) => (
              <div className="flex flex-col gap-1" key={stat.label}>
                <dt>
                  <MonoLabel className="text-mono-badge">{stat.label}</MonoLabel>
                </dt>
                <dd className="text-body-md font-semibold tabular-nums">
                  {stat.value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      <div className="border-border flex flex-wrap gap-2 border-t px-5 py-3.5">
        {/* Base UI composes with `render`, not Radix's `asChild`. */}
        <Button render={<Link to={`/runs?run=${card.run_id}`} />} size="sm">
          {t("cards.watchReplay")}
          <ArrowRightIcon data-icon="inline-end" />
        </Button>
        <Button
          onClick={() => actions.onAsk(t("cards.askReadSplits"), card.run_id)}
          size="sm"
          variant="subtle"
        >
          {t("cards.readSplitBySplit")}
        </Button>
      </div>
    </CardShell>
  );
}

// --- the splits chart ---------------------------------------------------------

/** A split at least this much slower than the quickest one reads as a fade. */
const FADE_SECONDS = 12;

export function RunSplits({ card }: { card: SplitsCard; actions: CardActions }) {
  const { t } = useTranslation();
  const paces = card.splits.map((split) => split.seconds_per_km);
  const fastest = Math.min(...paces);
  const slowest = Math.max(...paces);
  // Bars are drawn by speed, so the quickest kilometre is the tallest. A run
  // with no variation still needs a bar, hence the floor on the range.
  const range = Math.max(slowest - fastest, 1);
  const height = (seconds: number) =>
    `${Math.round(38 + 62 * (1 - (seconds - fastest) / range))}%`;

  const beats = card.splits.map((split) => split.avg_heartrate);
  const hasHr = beats.every((bpm) => typeof bpm === "number" && bpm > 0);
  const hrLow = hasHr ? Math.min(...(beats as number[])) : 0;
  const hrHigh = hasHr ? Math.max(...(beats as number[])) : 0;
  const hrPath =
    hasHr && hrHigh > hrLow
      ? (beats as number[])
          .map((bpm, i) => {
            const x = ((i + 0.5) / card.splits.length) * 100;
            // 8–92 keeps the line clear of the chart's own edges.
            const y = 92 - ((bpm - hrLow) / (hrHigh - hrLow)) * 84;
            return `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`;
          })
          .join(" ")
      : null;

  const fade = card.fade_seconds_per_km;
  const drift = card.decoupling_pct;

  return (
    <CardShell className="flex flex-col gap-4 p-5">
      <CardHeading
        title={card.title}
        aside={
          <span className="text-stone flex items-center gap-3.5">
            <span className="flex items-center gap-1.5">
              <span className="bg-brand size-2 rounded-[2px]" />
              <MonoLabel className="text-mono-badge">{t("cards.pace")}</MonoLabel>
            </span>
            {hrPath && (
              <span className="flex items-center gap-1.5">
                <span className="bg-chart-3 h-0.5 w-2" />
                <MonoLabel className="text-mono-badge">{t("cards.hr")}</MonoLabel>
              </span>
            )}
          </span>
        }
      />

      <div className="relative flex h-[132px] items-end gap-1">
        {card.splits.map((split) => (
          <span
            className="flex h-full flex-1 flex-col justify-end"
            key={split.km}
            title={
              split.avg_heartrate
                ? t("cards.splitTooltipHr", {
                    km: split.km,
                    pace: split.pace_per_km ?? "",
                    bpm: split.avg_heartrate,
                  })
                : t("cards.splitTooltip", {
                    km: split.km,
                    pace: split.pace_per_km ?? "",
                  })
            }
          >
            <span
              className={cn(
                "block rounded-t-[4px]",
                split.seconds_per_km - fastest >= FADE_SECONDS
                  ? "bg-chart-3"
                  : "bg-brand",
              )}
              style={{ height: height(split.seconds_per_km) }}
            />
          </span>
        ))}
        {hrPath && (
          <svg
            aria-hidden
            className="pointer-events-none absolute inset-0 size-full"
            preserveAspectRatio="none"
            viewBox="0 0 100 100"
          >
            <path
              className="text-chart-3"
              d={hrPath}
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.6}
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        )}
      </div>

      <div className="text-stone flex justify-between">
        <MonoLabel className="text-mono-badge">{t("cards.kmFirst")}</MonoLabel>
        <MonoLabel className="text-mono-badge">
          {card.first_half_pace} → {card.second_half_pace} {t("common.perKm")}
        </MonoLabel>
        <MonoLabel className="text-mono-badge">
          {t("cards.kmLast", { n: card.splits.length })}
        </MonoLabel>
      </div>

      <Callout tone={fade >= FADE_SECONDS ? "alert" : "brand"}>
        {fade >= 3
          ? t("cards.fadeSlower", { seconds: fade })
          : fade <= -3
            ? t("cards.negativeSplit", { seconds: Math.abs(fade) })
            : t("cards.evenPacing")}
        {drift !== null &&
          t("cards.decoupling", { pct: drift.toFixed(1) }) +
            (drift > 5 ? t("cards.decouplingHigh") : t("cards.decouplingOk"))}
      </Callout>
    </CardShell>
  );
}

// --- the weekly volume chart --------------------------------------------------

/** A week that climbs more than this is the classic too-much-too-soon jump. */
const RAMP_LIMIT = 10;

export function TrainingVolume({ card }: { card: VolumeCard; actions: CardActions }) {
  const { t } = useTranslation();
  const format = useFormatters();
  // Oldest on the left: a ramp reads left to right.
  const weeks = [...card.weeks].reverse();
  const peak = Math.max(...weeks.map((week) => week.km), 1);
  const spike = weeks.find((week) => (week.ramp_pct ?? 0) >= 25);
  const load = card.load;

  return (
    <CardShell className="flex flex-col gap-5 p-5">
      <CardHeading
        title={t("cards.weeklyVolume", { count: weeks.length })}
        aside={
          <MonoLabel className="text-mono-badge">
            {t("cards.safeRamp", { limit: RAMP_LIMIT })}
          </MonoLabel>
        }
      />

      <div className="flex h-[190px] items-end gap-3">
        {weeks.map((week) => (
          <div className="flex h-full flex-1 flex-col gap-2" key={week.week_starting}>
            <span
              className={cn(
                "text-mono-badge text-center font-mono",
                (week.ramp_pct ?? 0) >= 25 ? "text-chart-3" : "text-transparent",
              )}
            >
              {week.ramp_pct !== null && week.ramp_pct >= 25
                ? `+${week.ramp_pct}%`
                : "·"}
            </span>
            {/* The bar is absolute inside a flexible plot area: as a flex
                sibling of the labels it would shrink to fit the column and
                every week would come out the same height. */}
            <div className="relative min-h-0 flex-1">
              <span
                className={cn(
                  "absolute inset-x-0 bottom-0 rounded-t-[5px]",
                  (week.ramp_pct ?? 0) >= 25 ? "bg-chart-3" : "bg-brand",
                )}
                style={{ height: `${Math.round(4 + 96 * (week.km / peak))}%` }}
              />
            </div>
            <span className="text-caption text-center font-semibold tabular-nums">
              {week.km}
            </span>
            <MonoLabel className="text-mono-badge block text-center">
              {format.weekStamp(week.week_starting)}
            </MonoLabel>
          </div>
        ))}
      </div>

      <Callout tone={spike || (load && load.ratio > 1.3) ? "alert" : "brand"}>
        {load
          ? t("cards.loadRatio", {
              ratio: load.ratio.toFixed(2),
              acute: load.acute_km,
              chronic: load.chronic_km,
            })
          : t("cards.notEnoughHistory")}
        {spike &&
          t("cards.weekJumped", {
            week: format.weekStamp(spike.week_starting),
            pct: spike.ramp_pct ?? 0,
          })}
      </Callout>
    </CardShell>
  );
}

// --- the race prediction ------------------------------------------------------

export function RacePrediction({
  card,
  actions,
}: {
  card: PredictionCard;
  actions: CardActions;
}) {
  const { t } = useTranslation();
  const goal = card.goal;
  const headline = goal
    ? card.predictions.find((p) => p.name === goal.distance)
    : card.predictions.at(-1);

  return (
    <CardShell className="flex flex-col gap-5 p-5">
      <CardHeading
        title={t("cards.racePrediction")}
        aside={
          <MonoLabel className="text-mono-badge">
            {t("cards.fromBestEfforts")}
          </MonoLabel>
        }
      />

      <dl className="flex flex-col">
        {card.efforts.map((effort) => (
          <div
            className="border-border flex items-center gap-4 border-t py-3"
            key={`${effort.name}-${effort.activity_id}`}
          >
            <dt className="w-20 shrink-0">
              <MonoLabel className="text-mono-badge">{effort.name}</MonoLabel>
            </dt>
            <dd className="text-body-md font-semibold tabular-nums">
              {effort.time}
            </dd>
            <span
              className={cn(
                "text-caption ml-auto",
                effort.pr ? "text-brand font-semibold" : "text-stone",
              )}
            >
              {effort.pr ? t("cards.pr", { date: effort.date }) : effort.date}
            </span>
          </div>
        ))}
      </dl>

      {headline && (
        <div className="border-border bg-border grid grid-cols-2 gap-px overflow-hidden rounded-md border">
          <div className="bg-background flex flex-col gap-2 p-4">
            <MonoLabel className="text-mono-badge">
              {t("cards.headlineToday", { name: headline.name })}
            </MonoLabel>
            <span className="text-heading-lg font-semibold tabular-nums">
              {headline.time}
            </span>
          </div>
          <div className="bg-background flex flex-col gap-2 p-4">
            <MonoLabel className="text-mono-badge text-brand">
              {goal?.target ? t("cards.yourTarget") : t("cards.goalPace")}
            </MonoLabel>
            <span className="text-heading-lg text-brand font-semibold tabular-nums">
              {goal?.target ?? `${headline.pace_per_km} ${t("common.perKm")}`}
            </span>
          </div>
        </div>
      )}

      {goal?.gap_seconds != null ? (
        <Callout tone={goal.gap_seconds > 0 ? "warn" : "brand"}>
          {goal.gap_seconds > 0
            ? t("cards.gapToFind", {
                gap: formatGap(goal.gap_seconds, t),
                window: goal.weeks_to_race
                  ? String(t("cards.gapWindow", { count: goal.weeks_to_race }))
                  : "",
                name: headline?.from.name ?? "",
                time: headline?.from.time ?? "",
                date: headline?.from.date ?? "",
              })
            : t("cards.aheadOfTarget", {
                gap: formatGap(-goal.gap_seconds, t),
              })}
        </Callout>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-caption text-stone">{t("cards.riegel")}</span>
          {!goal && (
            <Button
              className="ml-auto"
              onClick={() => actions.onAsk(t("cards.askGoalRace"))}
              size="sm"
              variant="subtle"
            >
              {t("cards.setGoalRace")}
            </Button>
          )}
        </div>
      )}
    </CardShell>
  );
}

/** `3:50` — a gap in minutes and seconds. Under a minute it is spelled out,
 *  which is the only part of it that needs a language. */
function formatGap(seconds: number, t: TFunction): string {
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60);
  return minutes
    ? `${minutes}:${String(rest).padStart(2, "0")}`
    : t("cards.gapSeconds", { count: rest });
}

// --- the week plan ------------------------------------------------------------

export function WeekPlan({
  card,
  actions,
}: {
  card: PlanCard;
  actions: CardActions;
}) {
  const { t } = useTranslation();
  const format = useFormatters();
  // Weekday names come off the catalogue rather than `t()`: they are a list,
  // and `days.short` is uppercased here because it stamps a mono eyebrow.
  const messages = useMessages();
  const dayStamps = messages.days.short;
  const dayNames = messages.days.long;
  // The card is stored in the transcript, so `accepted` is only true of the
  // week as it stood when the tool ran. The live answer is the briefing's.
  const accepted =
    actions.acceptedWeek === card.week_starting || card.accepted;

  // The buttons name real days rather than a fixed "Swap Tuesday": the first
  // quality session that isn't the long run, and wherever the long run landed.
  const longRun = card.sessions.find((session) =>
    session.type.toLowerCase().includes("long"),
  );
  const quality = card.sessions.find(
    (session) => session.key && session.day !== longRun?.day,
  );
  const moveTo = longRun?.day === 6 ? 5 : 6;

  return (
    <CardShell className="max-w-[720px]">
      <div className="flex items-baseline justify-between gap-4 px-5 pt-5 pb-4">
        <span className="text-body-sm font-semibold">
          {t("cards.weekOf", { week: format.weekStamp(card.week_starting) })}
          {card.label ? ` · ${card.label}` : ""}
        </span>
        <MonoLabel className="text-mono-badge">
          {t("cards.weekTotals", { km: card.total_km, quality: card.quality })}
        </MonoLabel>
      </div>

      <ol className="grid grid-cols-2 gap-1.5 px-5 pb-5 sm:grid-cols-4 lg:grid-cols-7">
        {card.sessions.map((session) => (
          <li
            className={cn(
              "flex flex-col gap-2.5 rounded-md border p-2.5",
              session.key
                ? "border-brand/45 bg-brand/10"
                : "border-border bg-transparent",
            )}
            key={session.day}
          >
            <MonoLabel
              className={cn("text-mono-badge", session.key && "text-brand")}
            >
              {dayStamps[session.day]}
            </MonoLabel>
            <span className="text-caption leading-tight font-semibold">
              {session.type}
            </span>
            <span className="text-body-md leading-none font-semibold tabular-nums">
              {session.km > 0
                ? `${session.km} ${t("common.km")}`
                : t("common.dash")}
            </span>
            <MonoLabel className="text-mono-badge">{session.pace}</MonoLabel>
          </li>
        ))}
      </ol>

      <div className="border-border flex flex-wrap items-center gap-2 border-t px-5 py-3.5">
        {accepted ? (
          <span className="bg-brand/15 text-brand text-mono-badge inline-flex h-9 items-center gap-2 rounded-full px-4 font-mono uppercase">
            <CheckIcon className="size-3.5" />
            {t("cards.accepted")}
          </span>
        ) : (
          <Button
            disabled={actions.accepting}
            onClick={() => actions.onAcceptPlan(card)}
            size="sm"
          >
            {t("cards.acceptWeek")}
          </Button>
        )}
        {quality && (
          <Button
            onClick={() =>
              actions.onAsk(t("cards.askSwapDay", { day: dayNames[quality.day] }))
            }
            size="sm"
            variant="subtle"
          >
            {t("cards.swapDay", { day: dayNames[quality.day] })}
          </Button>
        )}
        {longRun && (
          <Button
            onClick={() =>
              actions.onAsk(t("cards.askMoveLongRun", { day: dayNames[moveTo] }))
            }
            size="sm"
            variant="subtle"
          >
            {t("cards.longRunTo", { day: dayNames[moveTo] })}
          </Button>
        )}
      </div>
    </CardShell>
  );
}

// --- the switch ---------------------------------------------------------------

/** Renders whichever card a tool result turned out to be. */
export function CoachCardView({
  card,
  actions,
}: {
  card: CoachCard;
  actions: CardActions;
}) {
  switch (card.card) {
    case "run-debrief":
      return <RunDebrief actions={actions} card={card} />;
    case "run-splits":
      return <RunSplits actions={actions} card={card} />;
    case "training-volume":
      return <TrainingVolume actions={actions} card={card} />;
    case "race-prediction":
      return <RacePrediction actions={actions} card={card} />;
    case "week-plan":
      return <WeekPlan actions={actions} card={card} />;
  }
}
