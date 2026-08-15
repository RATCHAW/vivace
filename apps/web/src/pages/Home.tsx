import { type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ArrowRightIcon, SparklesIcon } from "lucide-react";
// Fully typed off the API's OpenAPI document — see apps/web/src/api.
import {
  getCoachBriefingOptions,
  getRunsOptions,
  getStravaAthleteOptions,
  type CoachBriefing,
  type Run,
} from "@/api";
import { authClient } from "@/lib/auth-client";
import { useFormatters, type Formatters } from "@/i18n/format";
import { AppShell } from "@/components/app-shell";
import { MonoLabel, SoonBadge } from "@/components/mono";
import { StravaIcon } from "@/components/icons";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatClock, formatPace } from "@repo/video";

/** The API asks Strava for one page of this size — see `fetchRuns` in
 *  apps/api/src/strava.ts. A year that fills the page may be under-counted, and
 *  the strip says so rather than quietly reporting a short total. */
const RUNS_PAGE_SIZE = 100;

/** Where an athlete with nothing synced goes to log their first run. */
const STRAVA_URL = "https://www.strava.com";

/** Sports the replay treatment is coming to. Not yet wired to anything —
 *  catalogue keys rather than words, because `t` isn't in scope up here. */
const FUTURE_SPORTS = [
  "sports.ride",
  "sports.weights",
  "sports.swim",
  "sports.hike",
] as const;

// DESIGN.md: hairline rules carry the row rhythm — no shadows, no zebra fills.
function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <dt className="text-caption shrink-0 text-muted-foreground">{label}</dt>
      <dd className="text-body-sm min-w-0 text-right font-semibold break-words">
        {children}
      </dd>
    </div>
  );
}

/** One cell of the season strip: a mono eyebrow over a tabular number. */
function Stat({
  label,
  value,
  unit,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
}) {
  return (
    <div className="bg-background flex flex-col gap-2.5 p-7">
      <MonoLabel>{label}</MonoLabel>
      <span className="text-display-md tabular-nums">
        {value}
        {unit && (
          <span className="text-body-md text-muted-foreground ml-1.5">
            {unit}
          </span>
        )}
      </span>
    </div>
  );
}

interface Season {
  year: number;
  count: number;
  km: number;
  seconds: number;
  paceSecondsPerKm: number | null;
  /** The page was full and every run on it is this year's — the totals below
   *  are a floor, not the whole story. */
  truncated: boolean;
}

/** `start_date_local` carries the athlete's wall clock with a Z suffix, so the
 *  year has to be read in UTC or a New Year's Eve run lands in the wrong one. */
function seasonTotals(runs: Run[]): Season {
  const year = new Date().getFullYear();
  const mine = runs.filter(
    (run) => new Date(run.start_date_local).getUTCFullYear() === year,
  );
  const metres = mine.reduce((total, run) => total + run.distance, 0);
  const seconds = mine.reduce((total, run) => total + run.moving_time, 0);
  return {
    year,
    count: mine.length,
    km: metres / 1000,
    seconds,
    paceSecondsPerKm: metres > 0 ? seconds / (metres / 1000) : null,
    truncated: runs.length >= RUNS_PAGE_SIZE && mine.length === runs.length,
  };
}

function runSummary(run: Run, format: Formatters): string {
  const pace = run.average_speed > 0 ? 1000 / run.average_speed : null;
  return `${format.runDate(run.start_date_local)} · ${(
    run.distance / 1000
  ).toFixed(2)} km · ${formatClock(run.moving_time)} · ${formatPace(pace)} /km`;
}

/**
 * The coach, on the page every athlete lands on.
 *
 * Half of what Vivace does — the About page says it "hands it back twice", as
 * coaching and as a film — used to have exactly one inbound link in the entire
 * app: a nav pill spelled "Coach". Somebody signing in for the first time had
 * no way to know what was behind it, so it was the half nobody found.
 *
 * It shows the briefing rather than describing it: the goal race if one is
 * set, otherwise the first signal the coach would raise unprompted. Both come
 * from the same `GET /api/coach/briefing` the Coach's own rail reads, so the
 * card is never a second opinion — and both are strictly better than an
 * invitation, because they are already about this athlete.
 */
function CoachCard({
  briefing,
  failed,
}: {
  briefing: CoachBriefing | undefined;
  failed: boolean;
}) {
  const { t } = useTranslation();
  const format = useFormatters();

  const race = briefing?.context.race_name ? briefing.context : null;
  const signal = briefing?.signals[0] ?? null;

  return (
    // {component.card-featured} — the one cobalt surface on the Overview, which
    // is what makes it read as an invitation rather than another panel.
    <Card className="bg-brand text-brand-foreground border-transparent">
      <CardContent className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <span className="inline-flex items-center gap-2">
            <SparklesIcon className="size-4" />
            <MonoLabel className="text-brand-foreground/70">
              {t("home.coachEyebrow")}
            </MonoLabel>
          </span>
          <CardTitle className="text-heading-sm">
            {t("home.coachTitle")}
          </CardTitle>
        </div>

        {/* Loaded and useless is the one case with nothing of its own to say;
            still loading gets a placeholder so the card doesn't reflow. */}
        {!briefing && !failed && (
          <Skeleton className="bg-brand-foreground/15 h-16 w-full" />
        )}

        {race && (
          <div className="border-brand-foreground/20 flex flex-col gap-1.5 rounded-md border p-4">
            <MonoLabel className="text-brand-foreground/70">
              {t("rail.goalRace")}
            </MonoLabel>
            <span className="text-body-md font-semibold">{race.race_name}</span>
            <span className="text-caption text-brand-foreground/70">
              {race.race_date
                ? format.raceDay(race.race_date)
                : t("rail.noDate")}
            </span>
          </div>
        )}

        {!race && signal && (
          <div className="border-brand-foreground/20 flex flex-col gap-1.5 rounded-md border p-4">
            <MonoLabel className="text-brand-foreground/70">
              {signal.label}
            </MonoLabel>
            <span className="text-body-md font-semibold">{signal.value}</span>
            <span className="text-caption text-brand-foreground/70">
              {signal.note}
            </span>
          </div>
        )}

        <p className="text-body-sm text-brand-foreground/80">
          {race ? t("home.coachBodyRace") : t("home.coachBody")}
        </p>

        <Button
          className="self-start"
          render={<Link to="/coach" />}
          variant="onBrand"
        >
          {race ? t("home.coachOpen") : t("home.coachStart")}
          <ArrowRightIcon />
        </Button>
      </CardContent>
    </Card>
  );
}

export function Home() {
  const { t } = useTranslation();
  const format = useFormatters();
  const { data: session } = authClient.useSession();
  const { data: athlete, error: athleteError } = useQuery(
    getStravaAthleteOptions(),
  );
  const { data: runs, error: runsError } = useQuery(getRunsOptions());
  const { data: briefing, error: briefingError } = useQuery(
    getCoachBriefingOptions(),
  );

  const name = session?.user.name ?? "";
  const season = runs ? seasonTotals(runs) : null;
  const location = [athlete?.city, athlete?.state, athlete?.country]
    .filter(Boolean)
    .join(", ");

  return (
    <AppShell>
      <main className="mx-auto flex w-full max-w-[1200px] flex-col gap-14 px-6 pt-14 pb-24 sm:px-8">
        <section className="flex flex-wrap items-end justify-between gap-8">
          <div className="flex items-center gap-6">
            <Avatar className="size-22">
              <AvatarImage src={session?.user.image ?? undefined} alt="" />
              <AvatarFallback className="text-display-md">
                {name.charAt(0).toUpperCase() || "?"}
              </AvatarFallback>
            </Avatar>
            <div className="flex flex-col gap-2.5">
              <h1 className="font-heading text-display-lg">{name}</h1>
              <div className="text-body-sm text-muted-foreground flex items-center gap-2.5">
                <StravaIcon className="text-strava size-3.5" />
                <span>
                  {location
                    ? t("home.connectedToStravaIn", { location })
                    : t("home.connectedToStrava")}
                </span>
              </div>
            </div>
          </div>

          {/* {component.button-primary} — the loudest pixel on the canvas */}
          <Button render={<Link to="/replays" />}>
            {t("home.watchYourRuns")}
          </Button>
        </section>

        <section
          aria-label={
            season
              ? t("home.seasonTotals", { year: season.year })
              : t("home.seasonTotalsFallback")
          }
        >
          {/* A 1px grid gap over the border colour draws the hairlines between
              cells; no cell owns a rule of its own. */}
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg bg-border ring-1 ring-border md:grid-cols-4">
            {season ? (
              <>
                <Stat
                  label={t("home.statDistance", { year: season.year })}
                  value={season.km.toFixed(1)}
                  unit={t("common.km")}
                />
                <Stat label={t("home.statRuns")} value={season.count} />
                <Stat
                  label={t("home.statMovingTime")}
                  value={formatClock(season.seconds)}
                />
                <Stat
                  label={t("home.statAvgPace")}
                  value={formatPace(season.paceSecondsPerKm)}
                  unit={t("common.perKm")}
                />
              </>
            ) : (
              Array.from({ length: 4 }, (_, i) => (
                <div
                  key={i}
                  className="bg-background flex flex-col gap-2.5 p-7"
                >
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-9 w-28" />
                </div>
              ))
            )}
          </div>
          {season?.truncated && (
            <p className="text-caption text-stone mt-3">
              {t("home.truncated", { count: RUNS_PAGE_SIZE })}
            </p>
          )}
        </section>

        <section className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_400px]">
          <Card>
            <CardContent className="flex flex-col gap-6">
              <div className="flex items-baseline justify-between gap-4">
                <CardTitle className="text-heading-md">
                  {t("home.latestActivities")}
                </CardTitle>
                <Button
                  variant="link"
                  size="sm"
                  className="text-muted-foreground hover:text-foreground px-0 no-underline"
                  render={<Link to="/replays" />}
                >
                  {t("home.seeAll")}
                </Button>
              </div>

              {runsError && (
                <Alert variant="destructive">
                  <AlertTitle>{t("home.runsErrorTitle")}</AlertTitle>
                  <AlertDescription>{runsError.error}</AlertDescription>
                </Alert>
              )}

              {!runs && !runsError && (
                <div className="divide-y divide-border border-t">
                  {Array.from({ length: 3 }, (_, i) => (
                    <div key={i} className="flex flex-col gap-2 py-4.5">
                      <Skeleton className="h-4 w-40" />
                      <Skeleton className="h-3.5 w-64" />
                    </div>
                  ))}
                </div>
              )}

              {/* Not a dead end. "Go log one on Strava and come back" was the
                  entire app for a new athlete with an empty history, and it
                  neither said when a run would appear nor mentioned that the
                  coach already works without one. */}
              {runs && runs.length === 0 && (
                <div className="flex flex-col items-start gap-4 border-t pt-8">
                  <p className="text-body-md font-semibold">
                    {t("home.emptyTitle")}
                  </p>
                  <p className="text-body-sm text-muted-foreground max-w-[46ch]">
                    {t("home.emptyBody")}
                  </p>
                  <div className="flex flex-wrap gap-3">
                    <Button
                      render={
                        <a href={STRAVA_URL} rel="noreferrer" target="_blank" />
                      }
                      variant="subtle"
                    >
                      <StravaIcon className="text-strava" />
                      {t("home.emptyOpenStrava")}
                    </Button>
                    <Button render={<Link to="/coach" />} variant="subtle">
                      {t("home.emptyAskCoach")}
                    </Button>
                  </div>
                </div>
              )}

              {runs && runs.length > 0 && (
                <div className="divide-y divide-border border-t">
                  {runs.slice(0, 3).map((run) => (
                    <Link
                      key={run.id}
                      to={`/replays?run=${run.id}`}
                      className="hover:bg-muted/40 focus-visible:ring-ring/50 flex items-center justify-between gap-6 py-4.5 outline-none focus-visible:ring-3"
                    >
                      <span className="flex min-w-0 flex-col gap-1.5">
                        <span className="text-body-md font-semibold">
                          {run.name}
                        </span>
                        <span className="text-caption text-muted-foreground truncate">
                          {runSummary(run, format)}
                        </span>
                      </span>
                      <MonoLabel className="shrink-0">
                        {t("home.replay")}
                      </MonoLabel>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <div className="flex flex-col gap-8">
            {/* First in the column, ahead of the Strava facts that used to hold
                this position with an athlete id and a body weight. */}
            <CoachCard briefing={briefing} failed={Boolean(briefingError)} />

            <Card className="bg-background">
              <CardContent>
                <CardTitle className="text-heading-sm mb-4">
                  {t("home.fromStrava")}
                </CardTitle>

                {athleteError && (
                  <Alert variant="destructive">
                    <AlertTitle>{t("home.profileErrorTitle")}</AlertTitle>
                    <AlertDescription>{athleteError.error}</AlertDescription>
                  </Alert>
                )}

                {!athlete && !athleteError && (
                  <div
                    className="divide-y divide-border border-t"
                    aria-label={t("home.loadingProfile")}
                  >
                    {Array.from({ length: 3 }, (_, i) => (
                      <div key={i} className="flex justify-between gap-4 py-3">
                        <Skeleton className="h-3.5 w-20" />
                        <Skeleton className="h-3.5 w-32" />
                      </div>
                    ))}
                  </div>
                )}

                {/* Athlete id, sex and body weight used to be here. None of the
                    three is something an athlete came to look up, and the first
                    is a debug field — six unactionable rows in the best space
                    on the first screen after signing up. */}
                {athlete && (
                  <dl className="divide-y divide-border border-t">
                    {athlete.username && (
                      <Fact label={t("home.factUsername")}>
                        {athlete.username}
                      </Fact>
                    )}
                    <Fact label={t("home.factSubscription")}>
                      {athlete.summit || athlete.premium ? (
                        // Was the cobalt {component.badge-feature}. DESIGN.md
                        // allows one cobalt stamp per viewport and the Coach
                        // card above is now spending it — on the thing an
                        // athlete should act on rather than on a fact about
                        // somebody else's billing.
                        <Badge variant="outline">
                          {t("home.stravaSubscriber")}
                        </Badge>
                      ) : (
                        // {component.badge-tag}
                        <Badge variant="secondary">{t("home.freePlan")}</Badge>
                      )}
                    </Fact>
                    <Fact label={t("home.factMemberSince")}>
                      {format.longDate(athlete.created_at)}
                    </Fact>
                  </dl>
                )}
              </CardContent>
            </Card>

            <Card className="bg-background">
              <CardContent className="flex flex-col gap-5">
                <div className="flex flex-col gap-2">
                  <CardTitle className="text-heading-sm">
                    {t("home.moreSports")}
                  </CardTitle>
                  <p className="text-body-sm text-stone">
                    {t("home.moreSportsBody")}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {FUTURE_SPORTS.map((sport) => (
                    <span
                      key={sport}
                      className="bg-muted text-body-sm text-muted-foreground/60 inline-flex h-9 items-center gap-2 rounded-full px-3.5 font-semibold"
                    >
                      {t(sport)}
                      <SoonBadge />
                    </span>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </section>
      </main>
    </AppShell>
  );
}
