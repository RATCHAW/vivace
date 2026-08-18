import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Trans, useTranslation } from "react-i18next";
import {
  ArrowLeftIcon,
  Loader2Icon,
  Share2Icon,
  SlidersHorizontalIcon,
  SparklesIcon,
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
  type VideoPartner,
} from "@repo/video";
import {
  getRunPartnerOptions,
  getRunStreamsOptions,
  getStravaAthleteOptions,
  type Run,
  type RunPartner,
} from "@/api";
import { useFormatters } from "@/i18n/format";
import { InviteControls } from "@/components/invite-controls";
import { InviteHint } from "@/components/invite-hint";
import { MonoLabel } from "@/components/mono";
import { RenderControls } from "@/components/render-controls";
import { filmFrame, RunPlayer } from "@/components/run-player";
import { TemplateSelect } from "@/components/template-select";
import { VideoOptions } from "@/components/video-options";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { trackEvent } from "@/lib/logger";
import { useElementWidth } from "@/lib/use-element-width";
import { useShareRun } from "@/lib/use-share-run";
import { cn } from "@/lib/utils";

/**
 * How wide the film is allowed to be on a wide screen.
 *
 * A 9:16 film's size is settled by its *height*, so this is measured off the
 * viewport rather than being the fixed column it used to be — `w-[272px]`, or
 * `310px` at xl, which showed a 27" display exactly the same stamp as a 13"
 * laptop and left the run list three times the area of the thing the athlete
 * came to watch. `15rem` is the studio's own chrome (the picker above, the
 * transport and the two actions below) plus room to breathe, so the film and
 * everything attached to it land inside one screen.
 *
 * The floor is what a short screen gets and is already wider than the old xl
 * column, so no display loses. The ceiling stops the film outgrowing the row it
 * shares — it is a `max-width` on a `flex-1` column, so a narrow window hands it
 * whatever is actually left rather than overflowing.
 *
 * Theatre mode has the list's space and an athlete who has just asked for the
 * film big: it keeps less back, and lets its transport sit below the fold.
 */
const STAGE = "max-w-[clamp(380px,calc((100svh_-_15rem)*9/16),560px)]";
const STAGE_THEATRE = "max-w-[clamp(420px,calc((100svh_-_11rem)*9/16),640px)]";

/**
 * The other runner as a composition takes them.
 *
 * The API's contract is snake_case and the props contract is camelCase, so the
 * crossing happens once, here — a template that had to know about both would be
 * a template that could be handed either.
 */
function toVideoPartner(
  partner: RunPartner | null | undefined,
): VideoPartner | null {
  if (!partner) return null;
  return {
    name: partner.name,
    activity: partner.activity,
    streams: partner.streams,
    avatarUrl: avatarSource(partner.avatar_url),
  };
}

/**
 * One run's film, and everything that shapes it.
 *
 * Two layouts, and deliberately two *trees* rather than one tree wearing
 * breakpoints. On a wide screen the film is the stage the rest of the page is
 * arranged around: it takes the height the display can carry, the list beside it
 * is a rail rather than the widest thing on screen, and the options card is
 * pinned to the far edge. On a narrow one the list *is* the page and picking a
 * run opens this over it — a 9:16 film, a transport and a panel of switches do
 * not stack into anything readable on a phone, and the design answers that with
 * a screen, not a scroll.
 *
 * The two also differ in who draws the transport. The wide layout can spend
 * three rows under the picture; the phone cannot, because every row under a film
 * measured off the leftover height is taken out of the film. There the controls
 * go over the picture (Remotion's own) and everything else collapses into one
 * row of four icons. See `FilmChrome`.
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
  // Closed to start: the film is what the athlete came for, and a sheet over it
  // on arrival is a question nobody asked.
  const [optionsOpen, setOptionsOpen] = useState(false);
  const share = useShareRun(run);
  // The phone's whole layout hangs off the film's width, and the film's width
  // hangs off the height left on the screen — a number CSS can hand the frame
  // but not the picker above it. So it is measured. Wide screens size the film
  // off a column they already know the width of, and never attach this.
  const [measureFilm, filmWidth] = useElementWidth<HTMLDivElement>();

  const { data: streams, error: streamsError } = useQuery(
    getRunStreamsOptions({ path: { id: String(run.id) } }),
  );
  const { data: athlete, error: athleteError } = useQuery(
    getStravaAthleteOptions(),
  );
  // Whoever accepted an invitation to this run, if anybody has. Their run comes
  // with them — the film draws it, and the browser cannot read it from Strava
  // itself. Null is the normal case and is not an error: most runs are solo.
  const { data: partnerState, error: partnerError } = useQuery(
    getRunPartnerOptions({ path: { id: String(run.id) } }),
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
  // Memoised because the composition builds a camera track from it: a fresh
  // object on every re-render of this page would rebuild a few hundred
  // keyframes over both routes for nothing.
  const partner = useMemo(
    () => toVideoPartner(partnerState?.partner),
    [partnerState?.partner],
  );
  const input: TemplateInput | null = streams
    ? { activity: run, streams, partner }
    : null;
  const verdict = input ? templateEligibility(chosen, input) : null;
  // Waiting on somebody is not the same kind of no as a treadmill run. It is
  // the only verdict the athlete can overturn from this screen, and picking the
  // cut is how they reach the invitation — so their choice stands: the picker
  // keeps saying Duo replay and the film draws with the second lane empty,
  // which is also the clearest possible statement of what is missing.
  const awaitingPartner = verdict?.reasonKey === "needs-partner";
  // Otherwise the athlete's choice, unless this run can't have it — clicking a
  // treadmill run in the list must not leave the route replay selected and
  // empty. Derived rather than stored, so their choice comes back the moment a
  // run can serve it.
  const template =
    input && !verdict?.eligible && !awaitingPartner
      ? recommendTemplate(input)
      : chosen;
  // A template that draws no runner has nothing for the avatar switch to do,
  // and one whose plate isn't ours to re-tint has nothing for the theme. Both
  // are resolved once, so the player and the render are handed the same answers.
  const entry = getTemplate(template);
  const avatarSupported = entry.supportsAvatar;
  const filmTheme = entry.supportsTheme ? theme : DEFAULT_THEME;
  // Bringing the person you ran with is only a question a cut with a second
  // lane can ask — `needsPartner` on the catalogue entry, which today is the
  // duo replay and nothing else. On every other template the run's invitations
  // are neither shown nor fetched: there is nowhere in the film to put them.
  const takesPartner = entry.needsPartner;
  // And that cut with the other lane still empty is a render the API refuses
  // with a 409, so the download says what is missing rather than sending the
  // athlete to Lambda for an error.
  const missingPartner = takesPartner && !partner;
  // And a cut that draws two must not *open* on one it is about to be given.
  // The map plate builds its Mapbox sources from the frame it opens on, so a
  // partner landing a moment after the streams costs a remount and a visible
  // reload of the tiles — where waiting costs one spinner. Only until the
  // question is answered: a partner who is genuinely null, or a request that
  // failed, opens the film with the lane empty, which is what it draws anyway.
  const awaitingPartnerData =
    takesPartner && partnerState === undefined && !partnerError;
  // The same emptiness the download refuses, once the answer is actually in
  // rather than in flight — which is what the phone marks on its Options tile,
  // because there the invitation is behind an icon rather than in view. See
  // `InviteHint`.
  const secondLaneEmpty = missingPartner && !awaitingPartnerData;
  const hasOptions = entry.supportsTheme || avatarSupported;
  // What the phone's Options tile opens: the switches, and the invitation on a
  // cut that takes two runners — a template that honours neither and asks
  // nobody along has nothing behind that tile, so it is drawn greyed rather
  // than dropped. A row of actions that changes length as you click down the
  // catalogue reads as a bug.
  const hasSheet = hasOptions || takesPartner;
  // The avatar switch is one switch: both faces on the map, or neither. A film
  // with one runner wearing a photo and the other a plain dot reads as a bug
  // rather than as a choice.
  const filmPartner = useMemo(
    () =>
      partner && showAvatar && avatarSupported
        ? partner
        : partner && { ...partner, avatarUrl: "" },
    [partner, showAvatar, avatarSupported],
  );
  const fit = narrow ? "height" : "width";
  // Both the loading placeholder and the film it stands in for answer this, so
  // the picker is the right width from the first paint rather than after one.
  const frameRef = narrow ? measureFilm : undefined;
  // Line the picker and the action grid up with the film's edge. A max-width
  // rather than a width, so before the first measurement they simply fill the
  // column instead of collapsing to nothing.
  const railWidth = { maxWidth: filmWidth ?? undefined };

  /** Which cut is playing, above the film it names. */
  const picker = (
    <TemplateSelect
      template={template}
      input={input}
      onChange={onChooseTemplate}
    />
  );

  const stage =
    (!streams && !streamsError) || awaitingPartnerData ? (
      <div
        ref={frameRef}
        className={cn(
          "flex items-center justify-center rounded-lg border bg-black",
          filmFrame(fit),
        )}
      >
        <Loader2Icon className="text-muted-foreground size-6 animate-spin" />
        <span className="sr-only">{t("replays.loadingReplay")}</span>
      </div>
    ) : streamsError ? (
      <Alert variant="destructive">
        <AlertTitle>{t("replays.loadRunError")}</AlertTitle>
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
        athleteName={athlete?.firstname ?? t("videoOptions.you")}
        partner={filmPartner}
        theme={filmTheme}
        fit={fit}
        chrome={narrow ? "player" : "studio"}
        frameRef={frameRef}
        expanded={expanded}
        // Theatre mode is a wide-screen idea; the phone studio is already the
        // whole screen, so the control simply isn't there.
        onToggleExpanded={narrow ? undefined : onToggleExpanded}
      />
    );

  const mapboxNote = !mapboxToken && entry.usesMap && (
    <p className="text-caption text-stone w-full shrink-0">
      {/* The two <code> spans are part of the sentence, so the translation
          owns where they fall — a French clause puts the filename somewhere
          an English one does not. */}
      <Trans i18nKey="replays.noMapboxToken" components={{ code: <code /> }} />
    </p>
  );

  const options = hasOptions && (
    <VideoOptions
      template={template}
      theme={theme}
      onThemeChange={onThemeChange}
      avatarSupported={avatarSupported}
      avatarUrl={avatarUrl}
      name={athlete?.firstname ?? ""}
      pending={athlete === undefined && athleteError == null}
      failed={athleteError != null}
      showAvatar={showAvatar}
      onShowAvatarChange={onShowAvatarChange}
    />
  );

  // Only on a cut that has somewhere to put a second runner, and the same stack
  // in both layouts: the wide card and the phone's sheet are the two places the
  // studio keeps everything that shapes the film, and waiting on somebody is a
  // state with four things to say, not an icon.
  const invite = (
    <InviteControls
      key={`invite:${run.id}`}
      activityId={run.id}
      runName={run.name}
      supported={takesPartner}
    />
  );

  // Rendering happens on Lambda from the API's copy of the run, so it stands
  // even when the browser could not load the streams.
  const render = (layout: "panel" | "tile") => (
    <RenderControls
      // Its own namespace — see the player's key above.
      key={`render:${run.id}:${template}`}
      run={run}
      template={template}
      showAvatar={showAvatar && avatarSupported}
      theme={filmTheme}
      layout={layout}
      blocked={missingPartner ? t("video.eligibility.needs-partner") : null}
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
            aria-label={t("replays.backToList")}
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
            item floors at its content and pushes the row of actions off the
            bottom. See `filmFrame("height")`.

            Three rows and nothing else — picker, film, actions — because that
            is all a phone can show at once without the film becoming a stamp.
            The transport that used to sit between the last two is over the
            picture now, and the sheet that used to sit under them opens on top
            of it. The safe-area pad keeps the actions clear of a home
            indicator. */}
        <div className="flex min-h-0 flex-1 flex-col items-center gap-3 px-4 pt-3.5 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <div className="w-full shrink-0" style={railWidth}>
            {picker}
          </div>

          {stage}

          {/* Everything the athlete can do with the film they are watching, on
              one row measured off the film itself. Icons alone: at four across
              the width of a 9:16 phone film there is no room for a word, and a
              row that wrapped would take another slice out of the picture.
              Download is the loud pill because it is what they came to do; the
              other three are the ring of secondary controls around it. */}
          <div
            className="relative grid w-full shrink-0 grid-cols-4 gap-2"
            style={railWidth}
          >
            <Button
              size="icon-fill"
              variant="subtle"
              aria-label={t("player.share")}
              onClick={share}
            >
              <Share2Icon />
            </Button>

            {/* The coach reads the run you are watching: `?run=` arrives at the
                Coach screen as an attached run, so the first question is about
                this session without naming it. */}
            <Button
              size="icon-fill"
              variant="subtle"
              aria-label={t("player.askCoach")}
              onClick={() =>
                trackEvent("ui.ask_coach_clicked", { activityId: run.id })
              }
              render={<Link to={`/coach?run=${run.id}`} />}
            >
              <SparklesIcon />
            </Button>

            {/* Behind the sheet, not beside Share. An invitation had a cell of
                its own here while it was one tap — mint a link, hand it to the
                share sheet — and stopped fitting the moment the athlete could
                also be waiting on an answer, ask for it, or take somebody back
                out. Those are states with sentences, and the sheet is where the
                phone keeps everything that has one.

                Which leaves a sliders icon standing for the only way to fill a
                lane the athlete can see is empty, so it carries a dot while it
                does — and says why once, on arrival. The dot outlives the
                sentence: it is the state, where the callout is the moment. */}
            <InviteHint
              show={secondLaneEmpty && !optionsOpen}
              activityId={run.id}
            >
              <Button
                size="icon-fill"
                variant="subtle"
                aria-label={t("videoOptions.section")}
                aria-expanded={optionsOpen}
                disabled={!hasSheet}
                onClick={() => setOptionsOpen(true)}
              >
                <span className="relative">
                  <SlidersHorizontalIcon />
                  {secondLaneEmpty && (
                    <span className="bg-brand animate-in fade-in zoom-in-75 absolute -top-1 -right-1.5 size-1.5 rounded-full" />
                  )}
                </span>
              </Button>
            </InviteHint>

            {render("tile")}
          </div>

          {mapboxNote}
        </div>

        {/* Over the film rather than under it: the options are a detour off
            watching, and the picture keeps the height it had while they are
            open. DESIGN.md's largest radius on the leading edge only — a panel
            that arrives from the bottom of the screen has no bottom corners. */}
        <Sheet open={optionsOpen} onOpenChange={setOptionsOpen}>
          <SheetContent
            side="bottom"
            className="max-h-[80svh] rounded-t-xl"
            render={<aside aria-label={t("videoOptions.section")} />}
          >
            <SheetHeader>
              <SheetTitle>{t("videoOptions.section")}</SheetTitle>
            </SheetHeader>
            <SheetBody className="flex flex-col gap-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
              {options}
              {invite}
            </SheetBody>
          </SheetContent>
        </Sheet>
      </div>
    );
  }

  return (
    // The studio takes everything the list rail leaves, and the film is centred
    // in what the options card doesn't need — `mx-auto` on a `flex-1` column
    // whose growth is capped by `STAGE`, so the free space falls either side of
    // the film instead of behind it. The card stays against the far edge, which
    // is what makes the film read as the stage and the panels as its margins.
    // Theatre mode hides the list, and the same two rules centre it there.
    <div className="flex min-w-0 flex-1 items-start gap-6">
      <div
        className={cn(
          "mx-auto flex min-w-0 flex-1 flex-col gap-3.5",
          expanded ? STAGE_THEATRE : STAGE,
        )}
      >
        <div className="shrink-0">{picker}</div>
        {stage}
        {mapboxNote}
      </div>

      <aside
        aria-label={t("videoOptions.section")}
        className="flex w-[248px] shrink-0 flex-col gap-5 rounded-lg border p-5 xl:w-[288px] xl:p-6"
      >
        <MonoLabel>{t("videoOptions.section")}</MonoLabel>
        {options}
        {render("panel")}
        {invite}
      </aside>
    </div>
  );
}
