import { type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
// Fully typed off the API's OpenAPI document — see apps/web/src/api.
import { getRunsOptions, getStravaAthleteOptions, type Run } from "@/api";
import { authClient } from "@/lib/auth-client";
import { AppHeader } from "@/components/app-header";
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

/** Sports the replay treatment is coming to. Not yet wired to anything. */
const FUTURE_SPORTS = ["Ride", "Weights", "Swim", "Hike"];

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
          <span className="text-body-md text-muted-foreground ml-1.5">{unit}</span>
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

function runSummary(run: Run): string {
  const date = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(run.start_date_local));
  const pace = run.average_speed > 0 ? 1000 / run.average_speed : null;
  return `${date} · ${(run.distance / 1000).toFixed(2)} km · ${formatClock(
    run.moving_time,
  )} · ${formatPace(pace)} /km`;
}

export function Home() {
  const { data: session } = authClient.useSession();
  const { data: athlete, error: athleteError } = useQuery(getStravaAthleteOptions());
  const { data: runs, error: runsError } = useQuery(getRunsOptions());

  const name = session?.user.name ?? "";
  const season = runs ? seasonTotals(runs) : null;
  const location = [athlete?.city, athlete?.state, athlete?.country]
    .filter(Boolean)
    .join(", ");

  return (
    <>
      <AppHeader />

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
                <span>Connected to Strava{location && ` · ${location}`}</span>
              </div>
            </div>
          </div>

          {/* {component.button-primary} — the loudest pixel on the canvas */}
          <Button render={<Link to="/runs" />}>Watch your runs</Button>
        </section>

        <section aria-label={`${season?.year ?? "Season"} totals`}>
          {/* A 1px grid gap over the border colour draws the hairlines between
              cells; no cell owns a rule of its own. */}
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg bg-border ring-1 ring-border md:grid-cols-4">
            {season ? (
              <>
                <Stat
                  label={`Distance · ${season.year}`}
                  value={season.km.toFixed(1)}
                  unit="km"
                />
                <Stat label="Runs" value={season.count} />
                <Stat label="Moving time" value={formatClock(season.seconds)} />
                <Stat
                  label="Avg pace"
                  value={formatPace(season.paceSecondsPerKm)}
                  unit="/km"
                />
              </>
            ) : (
              Array.from({ length: 4 }, (_, i) => (
                <div key={i} className="bg-background flex flex-col gap-2.5 p-7">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-9 w-28" />
                </div>
              ))
            )}
          </div>
          {season?.truncated && (
            <p className="text-caption text-stone mt-3">
              Totals cover the {RUNS_PAGE_SIZE} most recent runs Strava returns.
            </p>
          )}
        </section>

        <section className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_400px]">
          <Card>
            <CardContent className="flex flex-col gap-6">
              <div className="flex items-baseline justify-between gap-4">
                <CardTitle className="text-heading-md">Latest activities</CardTitle>
                <Button
                  variant="link"
                  size="sm"
                  className="text-muted-foreground hover:text-foreground px-0 no-underline"
                  render={<Link to="/runs" />}
                >
                  See all →
                </Button>
              </div>

              {runsError && (
                <Alert variant="destructive">
                  <AlertTitle>Could not load your runs</AlertTitle>
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

              {runs && runs.length === 0 && (
                <p className="text-body-sm text-muted-foreground border-t py-8 text-center">
                  No runs yet — go log one on Strava and come back.
                </p>
              )}

              {runs && runs.length > 0 && (
                <div className="divide-y divide-border border-t">
                  {runs.slice(0, 3).map((run) => (
                    <Link
                      key={run.id}
                      to={`/runs?run=${run.id}`}
                      className="hover:bg-muted/40 focus-visible:ring-ring/50 flex items-center justify-between gap-6 py-4.5 outline-none focus-visible:ring-3"
                    >
                      <span className="flex min-w-0 flex-col gap-1.5">
                        <span className="text-body-md font-semibold">{run.name}</span>
                        <span className="text-caption text-muted-foreground truncate">
                          {runSummary(run)}
                        </span>
                      </span>
                      <MonoLabel className="shrink-0">Replay →</MonoLabel>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <div className="flex flex-col gap-8">
            <Card className="bg-background">
              <CardContent>
                <CardTitle className="text-heading-sm mb-4">From Strava</CardTitle>

                {athleteError && (
                  <Alert variant="destructive">
                    <AlertTitle>Could not load your profile</AlertTitle>
                    <AlertDescription>{athleteError.error}</AlertDescription>
                  </Alert>
                )}

                {!athlete && !athleteError && (
                  <div
                    className="divide-y divide-border border-t"
                    aria-label="Loading your Strava profile"
                  >
                    {Array.from({ length: 5 }, (_, i) => (
                      <div key={i} className="flex justify-between gap-4 py-3">
                        <Skeleton className="h-3.5 w-20" />
                        <Skeleton className="h-3.5 w-32" />
                      </div>
                    ))}
                  </div>
                )}

                {athlete && (
                  <dl className="divide-y divide-border border-t">
                    <Fact label="Athlete ID">{athlete.id}</Fact>
                    {athlete.username && (
                      <Fact label="Username">{athlete.username}</Fact>
                    )}
                    {athlete.sex && <Fact label="Sex">{athlete.sex}</Fact>}
                    {athlete.weight != null && athlete.weight > 0 && (
                      <Fact label="Weight">{athlete.weight} kg</Fact>
                    )}
                    <Fact label="Subscription">
                      {athlete.summit || athlete.premium ? (
                        // {component.badge-feature} — the single cobalt stamp
                        <Badge className="bg-brand text-brand-foreground">
                          Strava subscriber
                        </Badge>
                      ) : (
                        // {component.badge-tag}
                        <Badge variant="secondary">Free plan</Badge>
                      )}
                    </Fact>
                    <Fact label="Member since">
                      {new Date(athlete.created_at).toLocaleDateString()}
                    </Fact>
                  </dl>
                )}
              </CardContent>
            </Card>

            <Card className="bg-background">
              <CardContent className="flex flex-col gap-5">
                <div className="flex flex-col gap-2">
                  <CardTitle className="text-heading-sm">More sports</CardTitle>
                  <p className="text-body-sm text-stone">
                    Replays are built for runs first. The same film treatment
                    lands for these next.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {FUTURE_SPORTS.map((sport) => (
                    <span
                      key={sport}
                      className="bg-muted text-body-sm text-muted-foreground/60 inline-flex h-9 items-center gap-2 rounded-full px-3.5 font-semibold"
                    >
                      {sport}
                      <SoonBadge />
                    </span>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </section>
      </main>
    </>
  );
}
