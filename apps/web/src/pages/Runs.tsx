import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeftIcon, Loader2Icon } from "lucide-react";
// Fully typed off the API's OpenAPI document — see apps/web/src/api.
import { getRunsOptions, getRunStreamsOptions, type Run } from "@/api";
import { AppHeader } from "@/components/app-header";
import { MonoLabel, SoonBadge } from "@/components/mono";
import { RunPlayer } from "@/components/run-player";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatClock, formatPace } from "@/remotion/run-video/data";

// Empty until the Mapbox token is provided; the video falls back to a plain
// route canvas in the meantime.
const MAPBOX_TOKEN: string = import.meta.env.VITE_MAPBOX_TOKEN ?? "";

/** Sports the filter row will one day hold. Runs are the only live one. */
const FUTURE_FILTERS = ["Rides", "Weights"];

/** start_date_local carries the local clock with a Z suffix — format in UTC. */
function runDate(run: Run): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(run.start_date_local));
}

function averagePaceSeconds(run: Run): number | null {
  return run.average_speed > 0 ? 1000 / run.average_speed : null;
}

export function Runs() {
  // The selected run lives in the URL, so a replay can be linked to — the
  // Overview's "Replay →" rows and the player's Share button both point here.
  const [params, setParams] = useSearchParams();
  const [expanded, setExpanded] = useState(false);

  const { data: runs, error: runsError } = useQuery(getRunsOptions());
  const requested = Number(params.get("run"));
  const selected =
    runs?.find((run) => run.id === requested) ?? runs?.[0] ?? null;

  const { data: streams, error: streamsError } = useQuery({
    ...getRunStreamsOptions({ path: { id: String(selected?.id ?? 0) } }),
    enabled: selected != null,
  });

  return (
    <>
      <AppHeader />

      <main className="mx-auto w-full max-w-[1200px] px-6 pt-10 pb-20 sm:px-8">
        <header className="mb-7 flex flex-wrap items-center gap-5">
          <Button
            variant="subtle"
            size="icon"
            aria-label="Back to overview"
            render={<Link to="/" />}
          >
            <ArrowLeftIcon />
          </Button>
          <h1 className="font-heading text-display-lg">Your runs</h1>
          {runs && (
            <MonoLabel className="ml-auto">
              {runs.length} activities · synced from Strava
            </MonoLabel>
          )}
        </header>

        <div className="mb-7 flex flex-wrap gap-2">
          <span className="bg-muted text-body-sm inline-flex h-9 items-center rounded-full px-4 font-semibold">
            Runs
          </span>
          {FUTURE_FILTERS.map((filter) => (
            <span
              key={filter}
              className="text-body-sm text-muted-foreground/60 inline-flex h-9 items-center gap-2 rounded-full border px-3.5 font-semibold"
            >
              {filter}
              <SoonBadge />
            </span>
          ))}
        </div>

        <div
          className={cn(
            "grid items-start gap-10",
            !expanded && "lg:grid-cols-[minmax(0,1fr)_405px]",
          )}
        >
          {/* Theatre mode gives the 9:16 the whole row rather than shrinking
              the list beside it. */}
          <section aria-label="Runs" className={cn(expanded && "hidden")}>
            {runsError && (
              <Alert variant="destructive">
                <AlertTitle>Could not load your runs</AlertTitle>
                <AlertDescription>{runsError.error}</AlertDescription>
              </Alert>
            )}

            {!runs && !runsError && (
              <Card className="bg-background py-2">
                <CardContent className="divide-y divide-border px-2">
                  {Array.from({ length: 6 }, (_, i) => (
                    <div key={i} className="flex flex-col gap-2 px-5 py-5">
                      <Skeleton className="h-4 w-48" />
                      <Skeleton className="h-3.5 w-72" />
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {runs && runs.length === 0 && (
              <Card className="bg-background">
                <CardContent className="text-muted-foreground py-10 text-center">
                  No runs yet — go log one on Strava and come back.
                </CardContent>
              </Card>
            )}

            {runs && runs.length > 0 && (
              // DESIGN.md: hairline rules carry the row rhythm — no shadows.
              <div className="max-h-[720px] overflow-y-auto rounded-lg ring-1 ring-border">
                {runs.map((run) => (
                  <button
                    key={run.id}
                    type="button"
                    onClick={() => setParams({ run: String(run.id) }, { replace: true })}
                    aria-pressed={selected?.id === run.id}
                    className={cn(
                      "focus-visible:ring-ring/50 flex w-full items-center gap-5 border-b px-7 py-5 text-left outline-none last:border-b-0 focus-visible:ring-3 focus-visible:ring-inset",
                      selected?.id === run.id ? "bg-muted" : "hover:bg-muted/40",
                    )}
                  >
                    {/* The cobalt tick is the only stamp in the list, so the
                        selected row reads without a second highlight. */}
                    <span
                      className={cn(
                        "bg-brand h-9 w-[3px] shrink-0 rounded-full",
                        selected?.id === run.id ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <span className="flex min-w-0 flex-col gap-1.5">
                      <span className="text-body-md font-semibold">{run.name}</span>
                      <span className="text-caption text-muted-foreground truncate">
                        {runDate(run)} · {formatClock(run.moving_time)} ·{" "}
                        {formatPace(averagePaceSeconds(run))} /km
                      </span>
                    </span>
                    <span className="ml-auto flex shrink-0 items-baseline gap-1 tabular-nums">
                      <span className="text-heading-sm">
                        {(run.distance / 1000).toFixed(2)}
                      </span>
                      <span className="text-caption text-stone">km</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </section>

          <section
            aria-label="Run replay"
            className={cn(!expanded && "lg:sticky lg:top-10")}
          >
            {!selected || (!streams && !streamsError) ? (
              <div className="mx-auto flex aspect-9/16 w-full max-w-[460px] items-center justify-center rounded-lg border bg-black">
                <Loader2Icon className="text-muted-foreground size-6 animate-spin" />
                <span className="sr-only">Loading run replay…</span>
              </div>
            ) : streamsError ? (
              <Alert variant="destructive">
                <AlertTitle>Could not load this run</AlertTitle>
                <AlertDescription>{streamsError.error}</AlertDescription>
              </Alert>
            ) : (
              <RunPlayer
                key={selected.id}
                activity={selected}
                streams={streams ?? {}}
                mapboxToken={MAPBOX_TOKEN}
                expanded={expanded}
                onToggleExpanded={() => setExpanded((open) => !open)}
              />
            )}

            {!MAPBOX_TOKEN && (
              <p className="text-caption text-stone mt-4">
                No Mapbox token configured — the replay draws the route on a plain
                canvas. Set <code>VITE_MAPBOX_TOKEN</code> in{" "}
                <code>apps/web/.env</code> to get the full map.
              </p>
            )}
          </section>
        </div>
      </main>
    </>
  );
}
