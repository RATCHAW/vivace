import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Trans, useTranslation } from "react-i18next";
import { ArrowLeftIcon, Loader2Icon } from "lucide-react";
import { useFormatters } from "@/i18n/format";
// Fully typed off the API's OpenAPI document — see apps/web/src/api.
import {
  getRunsOptions,
  getRunStreamsOptions,
  getStravaAthleteOptions,
  type Run,
} from "@/api";
import { AppHeader } from "@/components/app-header";
import { MonoLabel, SoonBadge } from "@/components/mono";
import { RunPlayer } from "@/components/run-player";
import { TemplateSelect } from "@/components/template-select";
import { VideoOptions } from "@/components/video-options";
import { trackEvent } from "@/lib/logger";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
// The theme toggle that used to sit here now lives in AppHeader.
import { RenderControls } from "@/components/render-controls";
import { cn } from "@/lib/utils";
import {
  avatarSource,
  DEFAULT_TEMPLATE_ID,
  DEFAULT_THEME,
  formatClock,
  formatPace,
  getTemplate,
  recommendTemplate,
  templateEligibility,
  type TemplateId,
  type TemplateInput,
  type ThemeName,
} from "@repo/video";

// Empty until the Mapbox token is provided; the video falls back to a plain
// route canvas in the meantime.
const MAPBOX_TOKEN: string = import.meta.env.VITE_MAPBOX_TOKEN ?? "";

/** Sports the filter row will one day hold. Runs are the only live one.
 *  Catalogue keys, not words — `t` isn't in scope at module level. */
const FUTURE_FILTERS = ["sports.rides", "sports.weights"] as const;

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
  // another one, and both the player and the render request read them.
  const [showAvatar, setShowAvatar] = useState(false);
  const [chosen, setChosen] = useState<TemplateId>(DEFAULT_TEMPLATE_ID);
  const [theme, setTheme] = useState<ThemeName>(DEFAULT_THEME);

  const { data: runs, error: runsError } = useQuery(getRunsOptions());
  const { data: athlete, error: athleteError } = useQuery(
    getStravaAthleteOptions(),
  );
  const avatarUrl = avatarSource(athlete?.profile);
  const requested = Number(params.get("run"));
  const selected =
    runs?.find((run) => run.id === requested) ?? runs?.[0] ?? null;

  const { data: streams, error: streamsError } = useQuery({
    ...getRunStreamsOptions({ path: { id: String(selected?.id ?? 0) } }),
    enabled: selected != null,
  });

  // What decides which templates this run can be cut with. Null until the
  // streams are here: a treadmill run and a run whose streams are still loading
  // look identical, and only one of them should lose the route replay.
  const input: TemplateInput | null =
    selected && streams ? { activity: selected, streams } : null;
  // The athlete's choice, unless this run can't have it — clicking a treadmill
  // run in the list must not leave the route replay selected and empty. Derived
  // rather than stored, so their choice comes back the moment a run can serve it.
  const template =
    input && !templateEligibility(chosen, input).eligible
      ? recommendTemplate(input)
      : chosen;
  // A template that draws no runner has nothing for the avatar switch to do,
  // and one whose plate isn't ours to re-tint has nothing for the theme. Both
  // are resolved once, so the player and the render are handed the same answers.
  const avatarSupported = getTemplate(template).supportsAvatar;
  const filmTheme = getTemplate(template).supportsTheme ? theme : DEFAULT_THEME;

  return (
    <>
      <AppHeader />

      <main className="mx-auto w-full max-w-[1200px] px-6 pt-10 pb-20 sm:px-8">
        <header className="mb-7 flex flex-wrap items-center gap-5">
          <Button
            variant="subtle"
            size="icon"
            aria-label={t("runs.backToOverview")}
            render={<Link to="/" />}
          >
            <ArrowLeftIcon />
          </Button>
          <h1 className="font-heading text-display-lg">{t("runs.title")}</h1>
          {runs && (
            <MonoLabel className="ml-auto">
              {t("runs.syncCount", { count: runs.length })}
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

        <div
          className={cn(
            "grid items-start gap-10",
            !expanded && "lg:grid-cols-[minmax(0,1fr)_405px]",
          )}
        >
          {/* Theatre mode gives the 9:16 the whole row rather than shrinking
              the list beside it. */}
          <section
            aria-label={t("runs.listLabel")}
            className={cn(expanded && "hidden")}
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
              <div className="max-h-[720px] overflow-y-auto rounded-lg ring-1 ring-border">
                {runs.map((run) => (
                  <button
                    key={run.id}
                    type="button"
                    onClick={() =>
                      setParams({ run: String(run.id) }, { replace: true })
                    }
                    aria-pressed={selected?.id === run.id}
                    className={cn(
                      "focus-visible:ring-ring/50 flex w-full items-center gap-5 border-b px-7 py-5 text-left outline-none last:border-b-0 focus-visible:ring-3 focus-visible:ring-inset",
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

          <section
            aria-label={t("runs.replayLabel")}
            className={cn(!expanded && "lg:sticky lg:top-10")}
          >
            {/* Theatre mode hides the list and centres the film; everything
                stacked under it — transport, render panel, footnote — keeps to
                the same width, or the column reads as three loose things. */}
            <div className={cn(expanded && "mx-auto max-w-[460px]")}>
              {/* Which cut is playing, above the film it names. */}
              {selected && (
                <div className="mb-3.5">
                  <TemplateSelect
                    template={template}
                    input={input}
                    onChange={(next) => {
                      setChosen(next);
                      trackEvent("ui.video_template_changed", {
                        template: next,
                      });
                    }}
                  />
                </div>
              )}

              {!selected || (!streams && !streamsError) ? (
                <div className="flex aspect-9/16 w-full items-center justify-center rounded-lg border bg-black">
                  <Loader2Icon className="text-muted-foreground size-6 animate-spin" />
                  <span className="sr-only">{t("runs.loadingReplay")}</span>
                </div>
              ) : streamsError ? (
                <Alert variant="destructive">
                  <AlertTitle>{t("runs.loadRunError")}</AlertTitle>
                  <AlertDescription>{streamsError.error}</AlertDescription>
                </Alert>
              ) : (
                <RunPlayer
                  // Prefixed, and it has to be: the render panel below is keyed
                  // on the same run and template, and two siblings sharing a key
                  // is not a warning here but a leak. React maps a parent's
                  // children by key when one of them changes, so the duplicate
                  // evicts the first from that map, and the fiber nobody looked
                  // up is never deleted — the old player stayed in the DOM,
                  // frozen, under the new one, once per switch.
                  key={`player:${selected.id}:${template}`}
                  template={template}
                  activity={selected}
                  streams={streams ?? {}}
                  mapboxToken={MAPBOX_TOKEN}
                  avatarUrl={showAvatar && avatarSupported ? avatarUrl : ""}
                  theme={filmTheme}
                  expanded={expanded}
                  onToggleExpanded={() => setExpanded((open) => !open)}
                />
              )}

              {selected && (
                <VideoOptions
                  template={template}
                  theme={theme}
                  onThemeChange={(next) => {
                    setTheme(next);
                    trackEvent("ui.video_option_changed", {
                      option: "theme",
                      value: next,
                    });
                  }}
                  avatarSupported={avatarSupported}
                  avatarUrl={avatarUrl}
                  name={athlete?.firstname ?? ""}
                  pending={athlete === undefined && athleteError == null}
                  failed={athleteError != null}
                  showAvatar={showAvatar}
                  onShowAvatarChange={(next) => {
                    setShowAvatar(next);
                    // Which options athletes actually want is a product
                    // question, and this switch decides what gets rendered.
                    trackEvent("ui.video_option_changed", {
                      option: "show_avatar",
                      value: next,
                    });
                  }}
                />
              )}

              {/* Rendering happens on Lambda from the API's copy of the run, so
                  it stands even when the browser could not load the streams. */}
              {selected && (
                <RenderControls
                  // Its own namespace — see the player's key above.
                  key={`render:${selected.id}:${template}`}
                  run={selected}
                  template={template}
                  showAvatar={showAvatar && avatarSupported}
                  theme={filmTheme}
                />
              )}

              {!MAPBOX_TOKEN && getTemplate(template).usesMap && (
                <p className="text-caption text-stone mt-4">
                  {/* The two <code> spans are part of the sentence, so the
                      translation owns where they fall — a French clause puts
                      the filename somewhere an English one does not. */}
                  <Trans
                    i18nKey="runs.noMapboxToken"
                    components={{ code: <code /> }}
                  />
                </p>
              )}
            </div>
          </section>
        </div>
      </main>
    </>
  );
}
