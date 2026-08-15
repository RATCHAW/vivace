import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Trans, useTranslation } from "react-i18next";
import {
  ArrowLeftIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  Loader2Icon,
} from "lucide-react";
import {
  avatarSource,
  DEFAULT_THEME,
  formatClock,
  getTemplate,
  recommendTemplate,
  templateEligibility,
  type TemplateId,
  type TemplateInput,
  type ThemeName,
} from "@repo/video";
import { getRunStreamsOptions, getStravaAthleteOptions, type Run } from "@/api";
import { useFormatters } from "@/i18n/format";
import { MonoLabel } from "@/components/mono";
import { RenderControls } from "@/components/render-controls";
import { filmFrame, RunPlayer } from "@/components/run-player";
import { TemplateSelect } from "@/components/template-select";
import { VideoOptions } from "@/components/video-options";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

/**
 * One run's film, and everything that shapes it.
 *
 * Two layouts, and deliberately two *trees* rather than one tree wearing
 * breakpoints. On a wide screen the studio stands beside the list and is the
 * subject of the page: the list is a fixed sidebar, the options a fixed card,
 * and everything the row can spare goes to the stage. On a narrow one the list
 * *is* the page and picking a run opens this over it — a 9:16 film, a transport
 * and a panel of switches do not stack into anything readable on a phone, and
 * the design answers that with a screen, not a scroll.
 *
 * The state that survives picking another run — template, theme, avatar — is the
 * page's, because on a phone this component unmounts every time the athlete goes
 * back to the list, and a choice that resets itself is worse than no choice.
 */
export function RunStudio({
  run,
  mapboxToken,
  chosen,
  onChooseTemplate,
  theme,
  onThemeChange,
  showAvatar,
  onShowAvatarChange,
  narrow,
  expanded,
  onToggleExpanded,
  onClose,
}: {
  run: Run;
  mapboxToken: string;
  /** The athlete's pick, which may not be one this run can serve — see below. */
  chosen: TemplateId;
  onChooseTemplate: (next: TemplateId) => void;
  theme: ThemeName;
  onThemeChange: (next: ThemeName) => void;
  showAvatar: boolean;
  onShowAvatarChange: (next: boolean) => void;
  /** Below the breakpoint this is a screen of its own, over the list. */
  narrow: boolean;
  expanded: boolean;
  onToggleExpanded: () => void;
  /** Leave the studio and go back to the list. Narrow layout only. */
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const format = useFormatters();
  // Collapsed to start: the film is what the athlete came for, and on a phone
  // the sheet open would leave it a stamp.
  const [optionsOpen, setOptionsOpen] = useState(false);

  const { data: streams, error: streamsError } = useQuery(
    getRunStreamsOptions({ path: { id: String(run.id) } }),
  );
  const { data: athlete, error: athleteError } = useQuery(
    getStravaAthleteOptions(),
  );
  const avatarUrl = avatarSource(athlete?.profile);

  // The narrow studio covers the page rather than replacing it, so the list is
  // still behind it and still scrollable — a drag that started on the film
  // would otherwise move a list nobody can see, and leave it somewhere else on
  // the way back. Locking `body` keeps the scroll position instead of resetting
  // it, which unmounting the list would not.
  useEffect(() => {
    if (!narrow) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [narrow]);

  // What decides which templates this run can be cut with. Null until the
  // streams are here: a treadmill run and a run whose streams are still loading
  // look identical, and only one of them should lose the route replay.
  const input: TemplateInput | null = streams
    ? { activity: run, streams }
    : null;
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
  const entry = getTemplate(template);
  const avatarSupported = entry.supportsAvatar;
  const filmTheme = entry.supportsTheme ? theme : DEFAULT_THEME;
  // A template that honours neither has nothing to collapse, so the sheet drops
  // its disclosure and becomes what it already was: the render button.
  const hasOptions = entry.supportsTheme || avatarSupported;
  const fit = narrow ? "height" : "width";

  const film = (
    <>
      {/* Which cut is playing, above the film it names. */}
      <div className="shrink-0">
        <TemplateSelect
          template={template}
          input={input}
          onChange={onChooseTemplate}
        />
      </div>

      {!streams && !streamsError ? (
        <div
          className={cn(
            "flex items-center justify-center rounded-lg border bg-black",
            filmFrame(fit),
          )}
        >
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
          // Prefixed, and it has to be: the render panel beside it is keyed on
          // the same run and template, and two siblings sharing a key is not a
          // warning here but a leak. React maps a parent's children by key when
          // one of them changes, so the duplicate evicts the first from that
          // map, and the fiber nobody looked up is never deleted — the old
          // player stayed in the DOM, frozen, under the new one, once per
          // switch.
          key={`player:${run.id}:${template}`}
          template={template}
          activity={run}
          streams={streams ?? {}}
          mapboxToken={mapboxToken}
          avatarUrl={showAvatar && avatarSupported ? avatarUrl : ""}
          theme={filmTheme}
          fit={fit}
          expanded={expanded}
          // Theatre mode is a wide-screen idea; the phone studio is already the
          // whole screen, so the control simply isn't there.
          onToggleExpanded={narrow ? undefined : onToggleExpanded}
        />
      )}

      {!mapboxToken && entry.usesMap && (
        <p className="text-caption text-stone shrink-0">
          {/* The two <code> spans are part of the sentence, so the translation
              owns where they fall — a French clause puts the filename somewhere
              an English one does not. */}
          <Trans i18nKey="runs.noMapboxToken" components={{ code: <code /> }} />
        </p>
      )}
    </>
  );

  const options = hasOptions && (
    <VideoOptions
      template={template}
      theme={theme}
      onThemeChange={onThemeChange}
      avatarSupported={avatarSupported}
      avatarUrl={avatarUrl}
      pending={athlete === undefined && athleteError == null}
      failed={athleteError != null}
      showAvatar={showAvatar}
      onShowAvatarChange={onShowAvatarChange}
    />
  );

  // Rendering happens on Lambda from the API's copy of the run, so it stands
  // even when the browser could not load the streams.
  const render = (
    <RenderControls
      // Its own namespace — see the player's key above.
      key={`render:${run.id}:${template}`}
      run={run}
      template={template}
      showAvatar={showAvatar && avatarSupported}
      theme={filmTheme}
    />
  );

  if (narrow) {
    return (
      <div className="bg-background fixed inset-0 z-50 flex flex-col">
        {/* The list is gone, so the bar has to say which run this is. */}
        <div className="flex shrink-0 items-center gap-3 border-b px-4 py-3">
          <Button
            variant="subtle"
            size="icon-sm"
            aria-label={t("runs.backToList")}
            onClick={onClose}
          >
            <ArrowLeftIcon />
          </Button>
          <span className="flex min-w-0 flex-col gap-1">
            <span className="text-body-sm truncate font-semibold">
              {run.name}
            </span>
            <MonoLabel className="truncate">
              {format.shortDate(run.start_date_local)} ·{" "}
              {(run.distance / 1000).toFixed(2)} {t("common.km")} ·{" "}
              {formatClock(run.moving_time)}
            </MonoLabel>
          </span>
        </div>

        {/* The film is measured off what is left of the screen rather than off
            the column, so `min-h-0` here is load-bearing: without it the flex
            item floors at its content and pushes the sheet off the bottom.
            See `filmFrame("height")`. */}
        <div className="flex min-h-0 flex-1 flex-col gap-3 px-4 pt-3.5 pb-4">
          {film}
        </div>

        <Collapsible
          open={optionsOpen}
          onOpenChange={setOptionsOpen}
          // DESIGN.md: a hairline and a surface, never the drop shadow the
          // mock-up floats this on. The safe-area pad is what keeps the render
          // button clear of a home indicator.
          //
          // Only the shut sheet is in flow, so the space it reserves above is
          // its own height whatever state the render panel is in. Opening it
          // must not take that space from the film: the stage above is
          // `flex-1`, and giving a growing sheet its height back would squeeze
          // a 9:16 film down to a stamp — measured at 62×111 on a 390×844
          // screen before the panel was floated.
          className="bg-card relative flex shrink-0 flex-col gap-3.5 border-t px-4 pt-3.5 pb-[calc(1rem+env(safe-area-inset-bottom))]"
          render={<aside aria-label={t("videoOptions.section")} />}
        >
          {hasOptions ? (
            <>
              <CollapsibleTrigger className="flex w-full items-center gap-3 text-left outline-none">
                <MonoLabel>{t("videoOptions.section")}</MonoLabel>
                <span className="text-caption text-muted-foreground ml-auto inline-flex items-center gap-1 font-semibold">
                  {optionsOpen
                    ? t("videoOptions.hide")
                    : t("videoOptions.edit")}
                  {optionsOpen ? (
                    <ChevronDownIcon className="size-3.5" />
                  ) : (
                    <ChevronUpIcon className="size-3.5" />
                  )}
                </span>
              </CollapsibleTrigger>
              {/* Opens upward, over the film, anchored to the top of the sheet
                  it belongs to — `bottom-full`. It carries its own ground and
                  hairline because it is over the video, not over the sheet. */}
              <CollapsibleContent className="bg-card absolute inset-x-0 bottom-full max-h-[55vh] overflow-y-auto overscroll-contain border-t px-4 py-4">
                {options}
              </CollapsibleContent>
            </>
          ) : (
            <MonoLabel>{t("videoOptions.section")}</MonoLabel>
          )}
          {render}
        </Collapsible>
      </div>
    );
  }

  return (
    // The studio takes the row's spare width — the list beside it is a fixed
    // sidebar — and hands all of it to the stage. Theatre mode hides the list,
    // and there the stage takes only what the film needs and centres, because a
    // 400px film adrift in 1100px of panel is not a bigger film.
    <div
      className={cn(
        "flex min-w-0 flex-1 items-start gap-6",
        expanded && "justify-center",
      )}
    >
      {/* The stage: the biggest region on the page, and the only one that says
          so. Its own surface and hairline, DESIGN.md's elevation, because a
          9:16 film can never fill the width it is given and the space around it
          has to read as the film's rather than as a gap in the row. */}
      <div
        className={cn(
          "bg-muted/30 flex min-w-0 flex-col items-center rounded-xl border p-4 xl:p-5",
          expanded ? "shrink-0" : "flex-1",
        )}
      >
        <div
          className={cn(
            // The film is measured off the screen, not off the row: 9:16 turns
            // every pixel of width into 1.78 of height, so the widest useful
            // film is the one whose transport is still above the fold. The
            // subtrahend is everything else in that column — app header, page
            // header, stage padding, the picker above and the transport below —
            // and what is left over is the film's own height. A taller display
            // therefore gets a bigger film with no breakpoint, which is what the
            // old fixed 272/310 could not do.
            //
            // The floor is those old widths, so a short screen is no worse off
            // than it was: under about 900px of viewport there is no room to
            // grow a 9:16 film, and shrinking it to lift a transport above a
            // fold it was already under is a trade nobody asked for.
            "flex min-w-[272px] flex-col gap-3.5",
            expanded
              ? // Theatre spends the rows below the film as well — that is what
                // it is for — so it measures off the frame alone and the stage
                // wraps whatever comes out.
                "w-[calc((100svh-6rem)*9/16)]"
              : "w-full max-w-[calc((100svh-20rem)*9/16)] xl:min-w-[310px]",
          )}
        >
          {film}
        </div>
      </div>

      <aside
        aria-label={t("videoOptions.section")}
        className="flex w-[264px] shrink-0 flex-col gap-5 rounded-lg border p-6 xl:w-[280px]"
      >
        <MonoLabel>{t("videoOptions.section")}</MonoLabel>
        {options}
        {render}
      </aside>
    </div>
  );
}
