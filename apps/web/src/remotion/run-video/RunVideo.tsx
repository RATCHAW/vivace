import { AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import type { Run, RunStreams } from "@/api";
import { DRAW_END, DRAW_START, fadeAt, metricsAtProgress } from "./data";
import {
  ChapterBar,
  EffortChapter,
  RouteChapter,
  SummaryChapter,
  TitleChapter,
  TYPE,
} from "./chapters";
import { RunMap } from "./RunMap";
import { RouteFallback } from "./RouteFallback";

export interface RunVideoProps {
  activity: Run;
  streams: RunStreams;
  mapboxToken: string;
}

/** The effort chapter's sparkline draws on over this slice of the timeline,
 *  starting once the chapter has faded up. */
const EFFORT_DRAW_FROM = 0.68;
const EFFORT_DRAW_TO = 0.81;

/** How much of the map is left showing behind the effort chapter — enough to
 *  keep the run's shape in the frame, faint enough to read numbers over. */
const MAP_GHOST = 0.28;

export function RunVideo({ activity, streams, mapboxToken }: RunVideoProps) {
  const frame = useCurrentFrame();
  const { fps, width, height, durationInFrames } = useVideoConfig();

  // Where the film is, 0–1. Everything below is expressed against this, so the
  // chapter table in data.ts is the only place the timeline is retimed.
  const t = Math.min(1, frame / Math.max(1, durationInFrames - 1));

  // One progress value drives the trace, the camera and the live numbers, so
  // the dot on the map and the metrics always agree.
  const routeProgress = interpolate(frame, [DRAW_START, DRAW_END], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.33, 0, 0.25, 1),
  });

  const points = streams.latlng?.data ?? [];
  const hasRoute = points.length >= 2;
  const hasMap = hasRoute && mapboxToken !== "";
  const live = metricsAtProgress(activity, streams, routeProgress, fps);

  // Overlapping envelopes: each chapter dissolves into the next rather than
  // cutting. The map outlives its own chapter, dimmed, under the effort read.
  const titleOpacity = fadeAt(t, 0, 0.02, 0.1, 0.14);
  const routeOpacity = fadeAt(t, 0.1, 0.15, 0.64, 0.68);
  const effortOpacity = fadeAt(t, 0.66, 0.7, 0.84, 0.87);
  // Released past 1: the closing frame holds the summary rather than fading out.
  const summaryOpacity = fadeAt(t, 0.85, 0.89, 1.01, 1.02);
  const mapOpacity = Math.max(
    routeOpacity,
    fadeAt(t, 0.64, 0.68, 0.84, 0.87) * MAP_GHOST,
  );

  const effortDraw = interpolate(t, [EFFORT_DRAW_FROM, EFFORT_DRAW_TO], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.33, 0, 0.25, 1),
  });

  return (
    <AbsoluteFill style={{ backgroundColor: "#000000", color: "#ffffff" }}>
      {/* The map plate stays mounted for the whole film — remounting it would
          cost a Mapbox style load mid-video — and is faded by the timeline. */}
      <AbsoluteFill style={{ opacity: mapOpacity }}>
        {hasMap ? (
          <RunMap
            points={points}
            progress={routeProgress}
            token={mapboxToken}
            width={width}
            height={height}
          />
        ) : hasRoute ? (
          <RouteFallback
            points={points}
            progress={routeProgress}
            width={width}
            height={height}
          />
        ) : null}

        {/* Scrims keep type legible over the map without breaking the
            no-drop-shadow rule — elevation via canvas luminance only. */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 560,
            background: "linear-gradient(to bottom, rgba(0,0,0,0.88), rgba(0,0,0,0))",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: 780,
            background: "linear-gradient(to top, rgba(0,0,0,0.92), rgba(0,0,0,0))",
          }}
        />

        {hasMap && (
          <div
            style={{
              position: "absolute",
              bottom: 26,
              right: 32,
              fontSize: TYPE.credit,
              color: "rgba(255,255,255,0.45)",
            }}
          >
            © Mapbox © OpenStreetMap
          </div>
        )}
      </AbsoluteFill>

      <RouteChapter activity={activity} live={live} opacity={routeOpacity} />
      <EffortChapter
        activity={activity}
        streams={streams}
        opacity={effortOpacity}
        drawProgress={effortDraw}
      />
      {/* Both opaque, so they stack above the chapters they cover. */}
      <TitleChapter activity={activity} opacity={titleOpacity} />
      <SummaryChapter activity={activity} opacity={summaryOpacity} />

      <ChapterBar progress={t} />
    </AbsoluteFill>
  );
}
