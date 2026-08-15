import { useEffect, useRef, useState, type Ref } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Player, type PlayerRef } from "@remotion/player";
import {
  MaximizeIcon,
  MinimizeIcon,
  PauseIcon,
  PlayIcon,
  Share2Icon,
  SparklesIcon,
} from "lucide-react";
import {
  estimateDurationInFrames,
  formatClock,
  getTemplate,
  type TemplateId,
  type ThemeName,
} from "@repo/video";
import { VIDEO_COMPONENTS } from "@repo/video/compositions";
import type { Run, RunStreams } from "@/api";
import { trackEvent } from "@/lib/logger";
import { useShareRun } from "@/lib/use-share-run";
import { MonoLabel } from "@/components/mono";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

/**
 * The 9:16 frame the film plays in.
 *
 * Exported because the page draws the same box while the streams are still
 * loading, and a placeholder a different size from the thing it stands in for
 * makes the whole column jump when it arrives.
 *
 * `"width"` fills the column it is given and lets the height fall out of the
 * aspect ratio — the desktop stage, where the column is a known measure.
 * `"height"` is the other way round: it grows into whatever vertical space is
 * left over, which is the only way a phone can show a whole vertical film and
 * its transport at once.
 */
export function filmFrame(fit: FilmFit): string {
  return fit === "height"
    ? "aspect-9/16 min-h-0 w-auto max-w-full flex-1 self-center"
    : "aspect-9/16 w-full";
}

export type FilmFit = "width" | "height";

/**
 * Which chrome the film carries.
 *
 * `"studio"` draws our own: a transport under the picture that speaks the film's
 * language rather than a video player's — a mono clock, a theatre toggle — and
 * the two actions below it. It costs three rows under the frame, which the
 * desktop stage has and can spend without ever covering the picture.
 *
 * `"player"` hands the job to Remotion's own controls, over the film. That is
 * the phone: there the frame is measured off whatever height is left on the
 * screen, so every row *under* it comes straight out of the picture — and the
 * templates already keep their content inside `SAFE_TOP`…`SAFE_BOTTOM` for
 * exactly this, a story's own UI over the margins. The actions move out to the
 * studio's grid, where they sit beside Options and Download rather than in a
 * second row of their own.
 */
export type FilmChrome = "studio" | "player";

/** The replay, with whichever transport its layout can afford.
 *
 *  Mount one per activity *and template* (`key` on both): the composition is
 *  swapped wholesale when either changes — `RunMap` builds its Mapbox instance
 *  once per mount — and the transport below subscribes to one player. */
export function RunPlayer({
  template,
  activity,
  streams,
  mapboxToken,
  avatarUrl,
  theme,
  fit = "width",
  chrome = "studio",
  frameRef,
  expanded = false,
  onToggleExpanded,
}: {
  /** Which cut of the run to play. The same id is sent with the render, so the
   *  file that comes off Lambda is what was on screen. */
  template: TemplateId;
  activity: Run;
  streams: RunStreams;
  mapboxToken: string;
  /** The athlete's picture when the avatar option is on, else "" — see
   *  `<VideoOptions>`. A change re-renders the film, not the player. */
  avatarUrl: string;
  /** Which of the three looks to cut it in. */
  theme: ThemeName;
  /** Whether the frame is measured off its column or off the space left in the
   *  column. See `filmFrame`. */
  fit?: FilmFit;
  /** Who draws the transport. See `FilmChrome`. */
  chrome?: FilmChrome;
  /** Handed the 9:16 box itself, not this component — the studio lines the
   *  picker and the action grid up with the film's edge, and on a phone that
   *  edge is only knowable by measuring it. */
  frameRef?: Ref<HTMLDivElement>;
  expanded?: boolean;
  /** Omitted where theatre mode has no meaning — the phone studio is already
   *  the whole screen, and a control that can only be a no-op is noise. */
  onToggleExpanded?: () => void;
}) {
  const { t } = useTranslation();
  const { fps, width, height } = getTemplate(template);
  // The length of the film is a property of the *run*: a marathon's Split Rush
  // is longer than a parkrun's. Lambda gets the same number from the same
  // function through the composition's `calculateMetadata`, so what plays here
  // and what comes off the render are the same cut.
  const durationInFrames = estimateDurationInFrames(template, {
    activity,
    streams,
  });
  const player = useRef<PlayerRef>(null);
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const share = useShareRun(activity);

  // The player owns playback; this component only mirrors it, so the transport
  // stays right even when playback is driven from somewhere else (a seek that
  // pauses, the loop wrapping round, autoplay being refused).
  useEffect(() => {
    // Remotion's own controls read the player directly. Mirroring it here as
    // well would re-render this subtree on every frame for a clock nobody is
    // drawing — and it is the phone that would pay for it.
    if (chrome === "player") return;

    const current = player.current;
    if (!current) return;

    // `autoPlay` starts the film during mount, and the "play" that goes with it
    // is emitted before there is anything here to hear it — so playback state is
    // read from the player on every frame rather than accumulated from events.
    // "pause" still has to be listened for: a paused player emits no frames.
    const onFrame = (e: { detail: { frame: number } }) => {
      setFrame(e.detail.frame);
      setPlaying(current.isPlaying());
    };
    const onPause = () => setPlaying(false);

    current.addEventListener("frameupdate", onFrame);
    current.addEventListener("pause", onPause);
    setPlaying(current.isPlaying());

    return () => {
      current.removeEventListener("frameupdate", onFrame);
      current.removeEventListener("pause", onPause);
    };
  }, [chrome]);

  const film = (
    <div
      ref={frameRef}
      className={cn(
        "overflow-hidden rounded-lg border bg-black",
        filmFrame(fit),
      )}
    >
      <Player
        ref={player}
        component={VIDEO_COMPONENTS[template]}
        inputProps={{ activity, streams, mapboxToken, avatarUrl, theme }}
        durationInFrames={durationInFrames}
        fps={fps}
        compositionWidth={width}
        compositionHeight={height}
        loop
        autoPlay
        acknowledgeRemotionLicense
        controls={chrome === "player"}
        // Left to show themselves for good, Remotion's controls land on the
        // film's own bottom row — every template ends in one, and `run-video`'s
        // is a live clock, so the transport's `0:18 / 0:20` prints straight
        // through `TIME 18:12` and neither can be read. So they come and go
        // instead: a beat at mount to say they are there, then out of the way
        // while it plays, and back the moment it is paused. A tap on the film
        // pauses it (`clickToPlay`, on because `controls` is), which makes that
        // one gesture the way back to them — the same one every video on a
        // phone answers to.
        //
        // Nothing in the catalogue has an audio track, and a mute button that
        // silences silence is a control that can only lie.
        showVolumeControls={false}
        style={{ width: "100%", height: "100%" }}
      />
    </div>
  );

  // Remotion's controls are the whole chrome, so the film is the whole
  // component: no wrapper, and the 9:16 box is what the studio's column lays
  // out and measures directly.
  if (chrome === "player") return film;

  return (
    // Fills whatever measure it is given; the page owns both the theatre-mode
    // width and, on a phone, the height the frame has to grow into.
    <div
      className={cn(
        "flex flex-col",
        fit === "height" ? "min-h-0 flex-1 gap-3" : "gap-4",
      )}
    >
      {film}

      <div className="flex shrink-0 items-center gap-3.5">
        <Button
          size="icon"
          aria-label={playing ? t("player.pause") : t("player.play")}
          onClick={() => player.current?.toggle()}
        >
          {playing ? <PauseIcon /> : <PlayIcon />}
        </Button>

        <MonoLabel className="tabular-nums whitespace-nowrap">
          {formatClock(frame / fps)} / {formatClock(durationInFrames / fps)}
        </MonoLabel>

        <Slider
          aria-label={t("player.seek")}
          className="min-w-0 flex-1"
          min={0}
          max={durationInFrames - 1}
          value={frame}
          onValueChange={(value) => {
            const next = Array.isArray(value) ? value[0] : value;
            setFrame(next);
            player.current?.seekTo(next);
          }}
        />

        {onToggleExpanded && (
          <Button
            size="icon"
            variant="subtle"
            aria-label={
              expanded ? t("player.leaveTheatre") : t("player.enterTheatre")
            }
            aria-pressed={expanded}
            onClick={onToggleExpanded}
          >
            {expanded ? <MinimizeIcon /> : <MaximizeIcon />}
          </Button>
        )}
      </div>

      {/* The design's second action here was "Download MP4"; that is now a real
          Lambda render, and it lives in <RenderControls> beside the player
          because it has three states and a progress bar to show.

          Two equal halves of the film's own width rather than a pair of pills
          shoved right: this row is the film's footer, so it is measured off the
          film and not off whatever is left over. */}
      <div className="grid shrink-0 grid-cols-2 gap-2">
        {/* The coach reads the run you are watching: `?run=` arrives at the
            Coach screen as an attached run, so the first question is about
            this session without naming it. */}
        <Button
          className="w-full"
          onClick={() =>
            trackEvent("ui.ask_coach_clicked", { activityId: activity.id })
          }
          render={<Link to={`/coach?run=${activity.id}`} />}
          size="sm"
          variant="subtle"
        >
          <SparklesIcon />
          {t("player.askCoach")}
        </Button>
        <Button className="w-full" size="sm" variant="subtle" onClick={share}>
          <Share2Icon />
          {t("player.share")}
        </Button>
      </div>
    </div>
  );
}
