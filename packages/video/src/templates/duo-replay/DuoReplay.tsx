import { useMemo } from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { buildRoutesCameraTrack, cameraAtProgress } from "../../core/camera";
import {
  avatarSource,
  RUNNER_AVATAR_CLEARANCE,
  RUNNER_CLEARANCE,
} from "../../core/marker";
import { KEY_COLOR } from "../../core/greenscreen";
import { RouteCanvas } from "../../core/RouteCanvas";
import { RouteMap, type RouteLayer } from "../../core/RouteMap";
import { clamp01, envelope } from "../../core/timing";
import type { VideoActivity, VideoPartner, VideoStreams } from "../../types";
import {
  duoClock,
  duoDrawnAt,
  duoFrame,
  duoOutro,
  duoRunners,
  DUO_DRAW_FROM,
  DUO_DRAW_TO,
  DUO_ROUTE_PADDING,
} from "./duo";
import {
  CREDIT_SIZE,
  duoInk,
  DuoOverlay,
  StoryProgress,
  Watermark,
} from "./overlay";
import { DuoOutroCards } from "./outro";

// A type alias, not an interface — Remotion's <Composition> needs props
// assignable to Record<string, unknown>, which interfaces never are.
export type DuoReplayProps = {
  activity: VideoActivity;
  streams: VideoStreams;
  mapboxToken: string;
  /** The athlete's Strava picture, riding the head of their trace in place of
   *  the dot. Empty — the default — keeps the dot. */
  avatarUrl: string;
  /** The other runner. Null renders the film with one empty bar, which is what
   *  Studio opens on; the API never sends a duo render without one. */
  partner: VideoPartner | null;
  /** What to call the athlete on their own bar. */
  athleteName: string;
  /** Cut the canvas as a chroma key plate — see `core/greenscreen.ts`. As in
   *  the replay it also takes the basemap out: tiles are somebody else's
   *  photograph of the ground, and this cut exists to put the athletes' own
   *  footage there instead. */
  greenscreen?: boolean;
};

/**
 * The replay, run twice at once.
 *
 * One shot, two traces, two sets of live numbers — and one clock underneath all
 * of it, so the dot on the map and the pace under it belong to the same second
 * of the same athlete's run. See `duo.ts`: everything hard about this template
 * is the clock, and everything on screen is read off it.
 *
 * The last three and a half seconds are a second movement: the draw is over,
 * the map goes out of focus, and the film rebuilds itself into a card — the
 * mark and the title to the middle, each runner's name and fill out of the
 * bottom band and up under their own face. The window is `DUO_OUTRO_FROM`, and
 * `duoOutro` is the only thing that knows what is moving; nothing below reads
 * the frame counter for it.
 */
export function DuoReplay({
  activity,
  streams,
  mapboxToken,
  avatarUrl,
  partner,
  athleteName,
  greenscreen = false,
}: DuoReplayProps) {
  const frame = useCurrentFrame();
  const { fps, width, height, durationInFrames } = useVideoConfig();

  // Where the film is, 0–1. The story bar reads the same value.
  const t = Math.min(1, frame / Math.max(1, durationInFrames - 1));

  const drawStart = Math.round(DUO_DRAW_FROM * durationInFrames);
  const drawEnd = Math.max(
    drawStart + 1,
    Math.round(DUO_DRAW_TO * durationInFrames),
  );
  const drawFrames = drawEnd - drawStart;
  const drawProgress = clamp01((frame - drawStart) / drawFrames);

  const runners = useMemo(
    () =>
      duoRunners(
        activity,
        streams,
        avatarSource(avatarUrl),
        partner ?? EMPTY_PARTNER,
        athleteName,
      ),
    [activity, streams, avatarUrl, partner, athleteName],
  );
  const clock = useMemo(() => duoClock(runners), [runners]);
  const frames = duoFrame(runners, clock, drawProgress, fps, drawFrames);

  // Pure geometry, so the map can open on the right shot instead of easing into
  // one once the style lands. The avatars are the wider markers, so they are
  // also the wider shot — and one of them being on is enough to owe the berth.
  const clearance = runners.some((runner) => runner.avatarUrl)
    ? RUNNER_AVATAR_CLEARANCE
    : RUNNER_CLEARANCE;
  const track = useMemo(
    () =>
      buildRoutesCameraTrack(
        runners.map((runner) => runner.points),
        (progress) => duoDrawnAt(runners, clock, progress),
        { width, height, padding: DUO_ROUTE_PADDING },
        { clearance },
      ),
    [runners, clock, width, height, clearance],
  );

  const layers: RouteLayer[] = frames.map((state) => ({
    key: state.runner.key,
    points: state.runner.points,
    drawn: state.drawn,
    color: state.runner.color,
    avatarUrl: state.runner.avatarUrl,
  }));

  const hasRoute = layers.some((layer) => layer.points.length >= 2);
  // A keyed film never mounts the map, token or not.
  const hasMap = hasRoute && mapboxToken !== "" && !greenscreen;
  const plate = greenscreen ? KEY_COLOR : "#000000";
  const ink = duoInk(greenscreen);

  // The type dissolves up over the opening beat rather than being there on frame
  // one; released past 1, so the closing frame still holds the final numbers.
  const hudOpacity = envelope(t, 0, 1.02, 0.03, 0.01);

  const outro = duoOutro(t);

  return (
    <AbsoluteFill style={{ backgroundColor: plate, color: "#ffffff" }}>
      {/* The map plate is the film — it stays mounted and lit for every frame;
          remounting it would cost a Mapbox style load mid-video. */}
      <AbsoluteFill style={{ overflow: "hidden" }}>
        {/* The blur is what puts the closing card in front of the run rather
            than on top of it. Applied only once it is worth anything: a filter
            of `blur(0px)` still promotes the plate to its own layer and has
            Chromium re-rasterise 1080×1920 on every frame of the replay. The
            plate is pushed slightly past the frame at the same time, because a
            blur pulls in the transparency outside it and would otherwise draw
            its own soft border around the video. */}
        <AbsoluteFill
          style={
            outro.veil > 0
              ? {
                  filter: `blur(${outro.veil * 20}px)`,
                  transform: `scale(${1 + outro.veil * 0.06})`,
                }
              : undefined
          }
        >
          {hasMap ? (
            <RouteMap
              layers={layers}
              camera={cameraAtProgress(track, drawProgress)}
              token={mapboxToken}
              width={width}
              height={height}
            />
          ) : hasRoute ? (
            <RouteCanvas
              layers={layers}
              width={width}
              height={height}
              padding={DUO_ROUTE_PADDING}
              plate={plate}
              trackColor={ink.track}
            />
          ) : null}
        </AbsoluteFill>

        {/* Scrims keep type legible over the map without breaking the
            no-drop-shadow rule — elevation via canvas luminance only. The
            bottom one is taller than the replay's: it has two bars to carry.

            There is no map on the key plate, and a gradient that fades *into*
            the key colour is the one shape a chroma key cannot cut cleanly: it
            would leave a dark halo across the top and bottom of the athletes'
            own footage. */}
        {!greenscreen && (
          <>
            <div
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                height: 520,
                background:
                  "linear-gradient(to bottom, rgba(0,0,0,0.88), rgba(0,0,0,0))",
              }}
            />
            <div
              style={{
                position: "absolute",
                bottom: 0,
                left: 0,
                right: 0,
                height: 860,
                background:
                  "linear-gradient(to top, rgba(0,0,0,0.94), rgba(0,0,0,0))",
              }}
            />
          </>
        )}

        {/* The card's own canvas. The blur alone leaves the run legible enough
            to compete with the numbers standing in front of it. */}
        <AbsoluteFill
          style={{
            backgroundColor: plate,
            opacity: outro.veil * 0.55,
          }}
        />

        {hasMap && (
          <div
            style={{
              position: "absolute",
              bottom: 26,
              right: 32,
              fontSize: CREDIT_SIZE,
              color: "rgba(255,255,255,0.45)",
            }}
          >
            © Mapbox © OpenStreetMap
          </div>
        )}
      </AbsoluteFill>

      {/* Under the overlay, deliberately: the name and the fill travel out of
          the running layout and land *on* their card, so the layer they land on
          has to be drawn first. */}
      <DuoOutroCards frames={frames} plan={outro} />

      <DuoOverlay
        activity={activity}
        frames={frames}
        opacity={hudOpacity}
        outro={outro}
      />
      <Watermark move={outro.move} />
      <StoryProgress progress={t} />
    </AbsoluteFill>
  );
}

/** What Studio opens on, and the only shape that lets the composition render
 *  with no invitation answered: a second runner with nothing in them. */
const EMPTY_PARTNER: VideoPartner = {
  name: "Partner",
  activity: {
    id: 0,
    name: "",
    distance: 0,
    moving_time: 0,
    total_elevation_gain: 0,
    sport_type: "Run",
    start_date_local: "2026-08-09T07:12:00Z",
    average_speed: 0,
    average_heartrate: null,
    max_heartrate: null,
    workout_type: "default",
  },
  streams: {},
  avatarUrl: "",
};
