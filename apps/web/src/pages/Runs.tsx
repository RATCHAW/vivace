import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Player } from "@remotion/player";
import { ArrowLeftIcon, Loader2Icon } from "lucide-react";
// Fully typed off the API's OpenAPI document — see apps/web/src/api.
import { getRunsOptions, getRunStreamsOptions, type Run } from "@/api";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ModeToggle } from "@/components/mode-toggle";
import { cn } from "@/lib/utils";
import { RunVideo } from "@/remotion/run-video/RunVideo";
import {
  DURATION_IN_FRAMES,
  FPS,
  VIDEO_HEIGHT,
  VIDEO_WIDTH,
  formatClock,
  formatKm,
  formatPace,
} from "@/remotion/run-video/data";

// Empty until the Mapbox token is provided; the video falls back to a plain
// route canvas in the meantime.
const MAPBOX_TOKEN: string = import.meta.env.VITE_MAPBOX_TOKEN ?? "";

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
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const { data: runs, error: runsError } = useQuery(getRunsOptions());
  const selected = runs?.find((run) => run.id === selectedId) ?? runs?.[0] ?? null;

  const { data: streams, error: streamsError } = useQuery({
    ...getRunStreamsOptions({ path: { id: String(selected?.id ?? 0) } }),
    enabled: selected != null,
  });

  return (
    <main className="mx-auto w-full max-w-[1200px] px-6 py-10">
      <header className="mb-10 flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Back to profile"
          render={<Link to="/" />}
        >
          <ArrowLeftIcon />
        </Button>
        <h1 className="font-heading text-display-lg">Your runs</h1>
        <div className="ml-auto">
          <ModeToggle />
        </div>
      </header>

      <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_420px]">
        <section aria-label="Runs">
          {runsError && (
            <Alert variant="destructive">
              <AlertTitle>Could not load your runs</AlertTitle>
              <AlertDescription>{runsError.error}</AlertDescription>
            </Alert>
          )}

          {!runs && !runsError && (
            <Card>
              <CardContent className="divide-y divide-border">
                {Array.from({ length: 6 }, (_, i) => (
                  <div key={i} className="flex flex-col gap-2 py-4">
                    <Skeleton className="h-4 w-48" />
                    <Skeleton className="h-3.5 w-72" />
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {runs && runs.length === 0 && (
            <Card>
              <CardContent className="py-10 text-center text-muted-foreground">
                No runs yet — go log one on Strava and come back.
              </CardContent>
            </Card>
          )}

          {runs && runs.length > 0 && (
            <Card className="py-2">
              {/* DESIGN.md: hairline rules carry the row rhythm — no shadows. */}
              <CardContent className="divide-y divide-border px-2">
                {runs.map((run) => (
                  <button
                    key={run.id}
                    type="button"
                    onClick={() => setSelectedId(run.id)}
                    aria-pressed={selected?.id === run.id}
                    className={cn(
                      "flex w-full flex-col gap-1 rounded-md px-4 py-4 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                      selected?.id === run.id ? "bg-muted" : "hover:bg-muted/40",
                    )}
                  >
                    <span className="text-body-md font-semibold">{run.name}</span>
                    <span className="text-caption text-muted-foreground">
                      {runDate(run)} · {formatKm(run.distance)} km ·{" "}
                      {formatClock(run.moving_time)} ·{" "}
                      {formatPace(averagePaceSeconds(run))} /km
                    </span>
                  </button>
                ))}
              </CardContent>
            </Card>
          )}
        </section>

        <section aria-label="Run video" className="lg:sticky lg:top-10">
          <div className="aspect-9/16 overflow-hidden rounded-lg border bg-black">
            {!selected || (!streams && !streamsError) ? (
              <div className="flex h-full items-center justify-center">
                <Loader2Icon className="size-6 animate-spin text-muted-foreground" />
                <span className="sr-only">Loading run video…</span>
              </div>
            ) : streamsError ? (
              <div className="flex h-full items-center justify-center p-6">
                <Alert variant="destructive">
                  <AlertTitle>Could not load this run</AlertTitle>
                  <AlertDescription>{streamsError.error}</AlertDescription>
                </Alert>
              </div>
            ) : (
              <Player
                key={selected.id}
                component={RunVideo}
                inputProps={{
                  activity: selected,
                  streams: streams ?? {},
                  mapboxToken: MAPBOX_TOKEN,
                }}
                durationInFrames={DURATION_IN_FRAMES}
                fps={FPS}
                compositionWidth={VIDEO_WIDTH}
                compositionHeight={VIDEO_HEIGHT}
                controls
                loop
                acknowledgeRemotionLicense
                style={{ width: "100%", height: "100%" }}
              />
            )}
          </div>

          {!MAPBOX_TOKEN && (
            <p className="mt-4 text-caption text-muted-foreground">
              No Mapbox token configured — the video draws the route on a plain
              canvas. Set <code>VITE_MAPBOX_TOKEN</code> in{" "}
              <code>apps/web/.env</code> to get the full map.
            </p>
          )}
        </section>
      </div>
    </main>
  );
}
