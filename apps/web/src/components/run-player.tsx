import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
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
import { formatClock, getTemplate, type TemplateId } from "@repo/video";
import { VIDEO_COMPONENTS } from "@repo/video/compositions";
import type { Run, RunStreams } from "@/api";
import { trackEvent } from "@/lib/logger";
import { MonoLabel } from "@/components/mono";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";

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
  expanded,
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
  expanded: boolean;
  onToggleExpanded: () => void;
}) {
  const { durationInFrames, fps, width, height } = getTemplate(template);
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
      toast.success("Link copied", { description: "Anyone signed in can open this run." });
    } catch (error) {
      // A dismissed share sheet rejects too — only surface real failures.
      if (error instanceof DOMException && error.name === "AbortError") return;
      toast.error("Could not share this run");
    }
  }, [activity.id, activity.name]);

  return (
    // Fills whatever width it is given; the page owns the theatre-mode measure.
    <div className="flex flex-col gap-4">
      <div className="aspect-9/16 w-full overflow-hidden rounded-lg border bg-black">
        <Player
          ref={player}
          component={VIDEO_COMPONENTS[template]}
          inputProps={{ activity, streams, mapboxToken, avatarUrl }}
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

      <div className="flex items-center gap-3.5">
        <Button
          size="icon"
          aria-label={playing ? "Pause replay" : "Play replay"}
          onClick={() => player.current?.toggle()}
        >
          {playing ? <PauseIcon /> : <PlayIcon />}
        </Button>

        <MonoLabel className="tabular-nums whitespace-nowrap">
          {formatClock(frame / fps)} / {formatClock(durationInFrames / fps)}
        </MonoLabel>

        <Slider
          aria-label="Seek"
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

        <Button
          size="icon"
          variant="subtle"
          aria-label={expanded ? "Leave theatre mode" : "Enter theatre mode"}
          aria-pressed={expanded}
          onClick={onToggleExpanded}
        >
          {expanded ? <MinimizeIcon /> : <MaximizeIcon />}
        </Button>
      </div>

      {/* The design's second action here was "Download MP4"; that is now a real
          Lambda render, and it lives in <RenderControls> under the player
          because it has three states and a progress bar to show. */}
      <div className="flex justify-end gap-2">
        {/* The coach reads the run you are watching: `?run=` arrives at the
            Coach screen as an attached run, so the first question is about
            this session without naming it. */}
        <Button
          onClick={() => trackEvent("ui.ask_coach_clicked", { activityId: activity.id })}
          render={<Link to={`/coach?run=${activity.id}`} />}
          size="sm"
          variant="subtle"
        >
          <SparklesIcon />
          Ask the coach
        </Button>
        <Button size="sm" variant="subtle" onClick={share}>
          <Share2Icon />
          Share
        </Button>
      </div>
    </div>
  );
}
