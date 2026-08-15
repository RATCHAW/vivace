import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ArrowLeftIcon } from "lucide-react";
import { useFormatters } from "@/i18n/format";
// Fully typed off the API's OpenAPI document — see apps/web/src/api.
import { getRunsOptions, type Run } from "@/api";
import { AppHeader } from "@/components/app-header";
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

/** Where the list stops being a column beside the film and starts being the
 *  whole page. `64rem` is Tailwind's `lg`, so the JS branch and the `lg:`
 *  classes below can never disagree about which layout is in force. */
const WIDE = "(min-width: 64rem)";

function averagePaceSeconds(run: Run): number | null {
  return run.average_speed > 0 ? 1000 / run.average_speed : null;
}

export function Runs() {
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
    <>
      <AppHeader />

      <main className="mx-auto w-full max-w-[1200px] px-6 pt-8 pb-12 sm:px-8">
        {/* The sport filter rides in the title row rather than under it. A row
            of its own cost ~60px of the first screenful, and on this page the
            first screenful is the film — every pixel reclaimed above it becomes
            0.5625 of film width, because 9:16. It wraps back to its own line
            when the row can't hold it. */}
        <header className="mb-6 flex flex-wrap items-center gap-x-5 gap-y-3">
          <Button
            variant="subtle"
            size="icon"
            aria-label={t("runs.backToOverview")}
            render={<Link to="/" />}
          >
            <ArrowLeftIcon />
          </Button>
          <h1 className="font-heading text-display-lg">{t("runs.title")}</h1>

          <div className="flex flex-wrap gap-2">
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

          {runs && (
            <MonoLabel className="ml-auto">
              {t("runs.syncCount", { count: runs.length })}
            </MonoLabel>
          )}
        </header>

        <div className="flex flex-col gap-8 lg:flex-row lg:items-start">
          <section
            aria-label={t("runs.listLabel")}
            // A sidebar, not the other half of the page: the row's spare width
            // belongs to the film, so the list takes a fixed measure and the
            // studio takes everything else.
            className={cn(
              "min-w-0 lg:w-[300px] lg:shrink-0 xl:w-[348px]",
              !showList && "hidden",
            )}
          >
            {runsError && (
              <Alert variant="destructive">
                <AlertTitle>{t("runs.errorTitle")}</AlertTitle>
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
                  {t("runs.noRuns")}
                </CardContent>
              </Card>
            )}

            {runs && runs.length > 0 && (
              // DESIGN.md: hairline rules carry the row rhythm — no shadows.
              // The cap is the height of the studio beside it, which is now the
              // screen's rather than a fixed 660 — see the film's own `max-w` in
              // <RunStudio>, which this is the arithmetic partner of. Below the
              // breakpoint there is no film beside it, and the list is the page.
              <div className="overflow-y-auto rounded-lg ring-1 ring-border lg:max-h-[calc(100svh-7rem)]">
                {runs.map((run) => (
                  <button
                    key={run.id}
                    type="button"
                    onClick={() => {
                      setParams({ run: String(run.id) }, { replace: true });
                      setStudioOpen(true);
                    }}
                    aria-pressed={selected?.id === run.id}
                    className={cn(
                      // Tighter than the three-column layout it used to sit in:
                      // the same row now has a 300px sidebar to fit into, and
                      // the padding is what the date and pace need back.
                      "focus-visible:ring-ring/50 flex w-full items-center gap-4 border-b px-5 py-5 text-left outline-none last:border-b-0 focus-visible:ring-3 focus-visible:ring-inset",
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
                      <span className="text-body-md font-semibold">
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
              narrow={!wide}
              expanded={expanded}
              onToggleExpanded={() => setExpanded((open) => !open)}
              onClose={() => setStudioOpen(false)}
            />
          )}
        </div>
      </main>
    </>
  );
}
