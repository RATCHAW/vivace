import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ArrowLeftIcon } from "lucide-react";
import { useFormatters } from "@/i18n/format";
// Fully typed off the API's OpenAPI document — see apps/web/src/api.
import { getRunsOptions, type Run } from "@/api";
import { AppShell } from "@/components/app-shell";
import { StravaIcon } from "@/components/icons";
import { MonoLabel, SoonBadge } from "@/components/mono";
import { RunStudio } from "@/components/run-studio";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
// The theme toggle that used to sit here now lives in AppHeader.
import { trackEvent } from "@/lib/logger";
import { useMediaQuery } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";
import {
  DEFAULT_TEMPLATE_ID,
  DEFAULT_THEME,
  formatClock,
  formatPace,
  type TemplateId,
  type ThemeName,
} from "@repo/video";

// Empty until the Mapbox token is provided; the video falls back to a plain
// route canvas in the meantime.
const MAPBOX_TOKEN: string = import.meta.env.VITE_MAPBOX_TOKEN ?? "";

/** Sports the filter row will one day hold. Runs are the only live one.
 *  Catalogue keys, not words — `t` isn't in scope at module level. */
const FUTURE_FILTERS = ["sports.rides", "sports.weights"] as const;

/** Where an athlete with nothing synced goes to log their first run. */
const STRAVA_URL = "https://www.strava.com";

/** Where the list stops being a column beside the film and starts being the
 *  whole page. `64rem` is Tailwind's `lg`, so the JS branch and the `lg:`
 *  classes below can never disagree about which layout is in force. */
const WIDE = "(min-width: 64rem)";

function averagePaceSeconds(run: Run): number | null {
  return run.average_speed > 0 ? 1000 / run.average_speed : null;
}

export function Replays() {
  const { t } = useTranslation();
  const format = useFormatters();
  // The selected run lives in the URL, so a replay can be linked to — the
  // Overview's "Replay →" rows and the player's Share button both point here.
  const [params, setParams] = useSearchParams();
  const [expanded, setExpanded] = useState(false);
  // A cut of the film, not a property of the run — these outlive selecting
  // another one, and both the player and the render request read them. They sit
  // here rather than in the studio because on a phone the studio unmounts every
  // time the athlete goes back to the list.
  const [showAvatar, setShowAvatar] = useState(false);
  const [greenscreen, setGreenscreen] = useState(false);
  const [chosen, setChosen] = useState<TemplateId>(DEFAULT_TEMPLATE_ID);
  const [theme, setTheme] = useState<ThemeName>(DEFAULT_THEME);

  const wide = useMediaQuery(WIDE);
  // Narrow is master-detail: the list, then the studio over it. A link that
  // already names a run opens straight into the film it was shared for.
  const [studioOpen, setStudioOpen] = useState(() => params.has("run"));

  const { data: runs, error: runsError } = useQuery(getRunsOptions());
  const requested = Number(params.get("run"));
  const selected =
    runs?.find((run) => run.id === requested) ?? runs?.[0] ?? null;

  // Theatre mode is a wide-screen idea, and the flag survives a resize — so the
  // list is only ever hidden by it in the layout that can turn it off again.
  const showList = !(wide && expanded);

  return (
    <AppShell>
      {/* Wider than the Overview's measure, and the same one the Coach works in:
          this page is a workspace built around a film, not a column of reading.
          The extra width goes to the stage — see `STAGE` in <RunStudio>. */}
      <main className="mx-auto w-full max-w-[1440px] px-6 pt-10 pb-20 sm:px-8">
        <header className="mb-7 flex flex-wrap items-center gap-5">
          <Button
            variant="subtle"
            size="icon"
            aria-label={t("replays.backToOverview")}
            render={<Link to="/" />}
          >
            <ArrowLeftIcon />
          </Button>
          <h1 className="font-heading text-display-lg">{t("replays.title")}</h1>
          {runs && (
            <MonoLabel className="ml-auto">
              {t("replays.syncCount", { count: runs.length })}
            </MonoLabel>
          )}
        </header>

        <div className="mb-7 flex flex-wrap gap-2">
          <span className="bg-muted text-body-sm inline-flex h-9 items-center rounded-full px-4 font-semibold">
            {t("sports.runs")}
          </span>
          {FUTURE_FILTERS.map((filter) => (
            <span
              key={filter}
              className="text-body-sm text-muted-foreground/60 inline-flex h-9 items-center gap-2 rounded-full border px-3.5 font-semibold"
            >
              {t(filter)}
              <SoonBadge />
            </span>
          ))}
        </div>

        <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:gap-6">
          {/* A rail, not a half of the page. Picking a run is navigation and the
              film is the destination, so the list is given a measure it reads
              well at and the rest of the row goes to the stage. It sticks
              because the film beside it is taller than the fold: scrolling down
              to the transport must not take the way of changing run with it. */}
          <section
            aria-label={t("replays.listLabel")}
            className={cn(
              "min-w-0 lg:sticky lg:top-6 lg:w-[320px] lg:shrink-0 xl:w-[368px]",
              !showList && "hidden",
            )}
          >
            {runsError && (
              <Alert variant="destructive">
                <AlertTitle>{t("replays.errorTitle")}</AlertTitle>
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

            {/* The same next step the Overview offers, for the same reason:
                "go log one on Strava and come back" named the obstacle and
                nothing else — not when a run would appear, not that the coach
                works before the first one does. */}
            {runs && runs.length === 0 && (
              <Card className="bg-background">
                <CardContent className="flex flex-col items-start gap-4 py-8">
                  <p className="text-body-md font-semibold">
                    {t("replays.emptyTitle")}
                  </p>
                  <p className="text-body-sm text-muted-foreground">
                    {t("replays.emptyBody")}
                  </p>
                  <div className="flex flex-wrap gap-3">
                    <Button
                      render={
                        <a href={STRAVA_URL} rel="noreferrer" target="_blank" />
                      }
                      size="sm"
                      variant="subtle"
                    >
                      <StravaIcon className="text-strava" />
                      {t("home.emptyOpenStrava")}
                    </Button>
                    <Button
                      render={<Link to="/coach" />}
                      size="sm"
                      variant="subtle"
                    >
                      {t("home.emptyAskCoach")}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {runs && runs.length > 0 && (
              // DESIGN.md: hairline rules carry the row rhythm — no shadows.
              // The cap used to be the height of the film beside it, back when
              // that was a fixed 484px; the film is measured off the display
              // now, so the list is too — as tall as the screen can carry while
              // pinned, and scrolling inside itself rather than moving the page.
              // Below the breakpoint there is no film beside it, and the list is
              // the page.
              <div className="overflow-y-auto rounded-lg ring-1 ring-border lg:max-h-[calc(100svh_-_4rem)]">
                {runs.map((run) => (
                  <button
                    key={run.id}
                    type="button"
                    onClick={() => {
                      setParams({ run: String(run.id) }, { replace: true });
                      setStudioOpen(true);
                    }}
                    aria-pressed={selected?.id === run.id}
                    // Tighter once it is a rail: the same padding that gives the
                    // row room when the list is the whole page would spend a
                    // third of a 320px column on its margins.
                    className={cn(
                      "focus-visible:ring-ring/50 flex w-full items-center gap-5 border-b px-7 py-5 text-left outline-none last:border-b-0 focus-visible:ring-3 focus-visible:ring-inset lg:gap-4 lg:px-5 lg:py-4",
                      selected?.id === run.id
                        ? "bg-muted"
                        : "hover:bg-muted/40",
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
                      {/* Truncated, not wrapped: at rail width a long name would
                          give one row three lines and break the rhythm the
                          hairlines carry. */}
                      <span className="text-body-md truncate font-semibold">
                        {run.name}
                      </span>
                      <span className="text-caption text-muted-foreground truncate">
                        {format.runDate(run.start_date_local)} ·{" "}
                        {formatClock(run.moving_time)} ·{" "}
                        {formatPace(averagePaceSeconds(run))}{" "}
                        {t("common.perKm")}
                      </span>
                    </span>
                    <span className="ml-auto flex shrink-0 items-baseline gap-1 tabular-nums">
                      <span className="text-heading-sm">
                        {(run.distance / 1000).toFixed(2)}
                      </span>
                      <span className="text-caption text-stone">
                        {t("common.km")}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </section>

          {selected && (wide || studioOpen) && (
            <RunStudio
              run={selected}
              mapboxToken={MAPBOX_TOKEN}
              chosen={chosen}
              onChooseTemplate={(next) => {
                setChosen(next);
                trackEvent("ui.video_template_changed", { template: next });
              }}
              theme={theme}
              onThemeChange={(next) => {
                setTheme(next);
                trackEvent("ui.video_option_changed", {
                  option: "theme",
                  value: next,
                });
              }}
              showAvatar={showAvatar}
              onShowAvatarChange={(next) => {
                setShowAvatar(next);
                // Which options athletes actually want is a product question,
                // and this switch decides what gets rendered.
                trackEvent("ui.video_option_changed", {
                  option: "show_avatar",
                  value: next,
                });
              }}
              greenscreen={greenscreen}
              onGreenscreenChange={(next) => {
                setGreenscreen(next);
                trackEvent("ui.video_option_changed", {
                  option: "greenscreen",
                  value: next,
                });
              }}
              narrow={!wide}
              expanded={expanded}
              onToggleExpanded={() => setExpanded((open) => !open)}
              onClose={() => setStudioOpen(false)}
            />
          )}
        </div>
      </main>
    </AppShell>
  );
}
