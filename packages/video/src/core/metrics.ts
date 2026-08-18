/**
 * What the numbers read at one instant of a run.
 *
 * Moved out of `templates/run-video/data.ts` when the duo replay needed the
 * same reading for two runners at once; the replay's module re-exports it with
 * its own draw window bound in, so its film and its tests are unchanged.
 *
 * React-free — apps/api reaches this through the package's entry.
 */
import type { VideoActivity, VideoStreams } from "../types";
import { clamp01, sampleIndex } from "./timing";

// A whole run is compressed into the draw, so one video frame steps over many
// stream samples. Reading a single sample makes the instantaneous channels
// (pace, heart rate) jump between neighbouring frames; averaging this much
// video time's worth of samples into each frame settles them.
export const SMOOTHING_SECONDS = 0.5;

/** Mean of `data` over `centre ± halfWidth`, clamped to the stream bounds.
 *  Null when the window holds nothing finite to average. */
export function windowMean(
  data: readonly number[] | undefined,
  centre: number,
  halfWidth: number,
): number | null {
  if (!data || data.length === 0) return null;
  const from = Math.max(0, centre - halfWidth);
  const to = Math.min(data.length - 1, centre + halfWidth);
  let sum = 0;
  let count = 0;
  for (let i = from; i <= to; i += 1) {
    const value = data[i];
    if (Number.isFinite(value)) {
      sum += value;
      count += 1;
    }
  }
  return count > 0 ? sum / count : null;
}

/** Half-width, in stream samples, of the moving average that covers
 *  `SMOOTHING_SECONDS` of video. A draw spreads `sampleCount` samples over
 *  `drawFrames` frames, which fixes the samples-per-frame rate. */
export function smoothingHalfWidth(
  sampleCount: number,
  fps: number,
  drawFrames: number,
): number {
  if (drawFrames <= 0) return 0;
  const samplesPerFrame = sampleCount / drawFrames;
  return Math.round((samplesPerFrame * SMOOTHING_SECONDS * fps) / 2);
}

export interface LiveMetrics {
  distanceMeters: number;
  elapsedSeconds: number;
  paceSecondsPerKm: number | null;
  heartrate: number | null;
  elevationGainMeters: number;
}

/** What an overlay shows at a given progress through a run. Distance and time
 *  come straight off the streams — they only ever climb — while pace and heart
 *  rate are averaged over a half-second window so they read instead of flicker.
 *  Falls back to linearly scaled activity totals when there are no streams. */
export function liveMetrics(
  activity: VideoActivity,
  streams: VideoStreams,
  progress: number,
  fps: number,
  drawFrames: number,
): LiveMetrics {
  const p = clamp01(progress);
  const averagePace =
    activity.average_speed > 0 ? 1000 / activity.average_speed : null;

  const time = streams.time?.data;
  const distance = streams.distance?.data;
  const sampleCount = Math.max(time?.length ?? 0, distance?.length ?? 0);

  if (sampleCount < 2) {
    return {
      distanceMeters: activity.distance * p,
      elapsedSeconds: activity.moving_time * p,
      paceSecondsPerKm: averagePace,
      heartrate: activity.average_heartrate
        ? Math.round(activity.average_heartrate)
        : null,
      elevationGainMeters: activity.total_elevation_gain * p,
    };
  }

  const idx = sampleIndex(sampleCount, p);
  const halfWidth = smoothingHalfWidth(sampleCount, fps, drawFrames);
  const velocity = windowMean(streams.velocity_smooth?.data, idx, halfWidth);
  const heartrate =
    windowMean(streams.heartrate?.data, idx, halfWidth) ??
    activity.average_heartrate;
  return {
    distanceMeters: distance?.[idx] ?? activity.distance * p,
    elapsedSeconds: time?.[idx] ?? activity.moving_time * p,
    // Standing still produces absurd instantaneous paces — fall back to average.
    paceSecondsPerKm:
      velocity && velocity > 0.5 ? 1000 / velocity : averagePace,
    heartrate: heartrate ? Math.round(heartrate) : null,
    elevationGainMeters: activity.total_elevation_gain * p,
  };
}
