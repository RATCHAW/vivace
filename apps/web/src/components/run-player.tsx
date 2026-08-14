import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Player, type PlayerRef } from "@remotion/player";
import { toast } from "sonner";
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

/** The replay with its own transport. Remotion's built-in controls are a video
 *  chrome; this one speaks the film's language instead — a mono clock, and a
 *  theatre toggle that gives the 9:16 the whole row.
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

  // The player owns playback; this component only mirrors it, so the transport
  // stays right even when playback is driven from somewhere else (a seek that
  // pauses, the loop wrapping round, autoplay being refused).
  useEffect(() => {
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
  }, []);

  const share = useCallback(async () => {
    const url = `${window.location.origin}/runs?run=${activity.id}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: activity.name, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      toast.success(t("player.linkCopied"), {
        description: t("player.linkCopiedBody"),
      });
    } catch (error) {
      // A dismissed share sheet rejects too — only surface real failures.
      if (error instanceof DOMException && error.name === "AbortError") return;
      toast.error(t("player.shareFailed"));
    }
  }, [activity.id, activity.name, t]);

  return (
    // Fills whatever measure it is given; the page owns both the theatre-mode
    // width and, on a phone, the height the frame has to grow into.
    <div
      className={cn(
        "flex flex-col",
        fit === "height" ? "min-h-0 flex-1 gap-3" : "gap-4",
      )}
    >
      <div
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
          style={{ width: "100%", height: "100%" }}
        />
      </div>

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
