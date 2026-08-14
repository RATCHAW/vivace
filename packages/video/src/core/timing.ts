/**
 * Beats and easing, as pure maths.
 *
 * Remotion's own `interpolate`/`Easing` do this too, but a beat plan has to be
 * readable from apps/api's side of the fence (it is what `estimateDuration`
 * counts) and from a test with no composition around it — so the timeline lives
 * here, React-free, and the components only read it.
 */

export const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

export const secondsToFrames = (seconds: number, fps: number) =>
  Math.max(0, Math.round(seconds * fps));

/** One movement of a template, in frames. `to` is exclusive-ish: the beat is
 *  over at `to`, which is where the next one starts. */
export interface Beat {
  id: string;
  from: number;
  to: number;
}

export interface BeatSpec {
  id: string;
  seconds: number;
}

/**
 * Lay `spans` end to end from frame 0, then stretch or trim the last one so the
 * plan ends exactly at `total`.
 *
 * That last step is the whole point: a template is handed its duration by
 * `useVideoConfig`, which is the *calculated* one on Lambda and in the player,
 * and the catalogue's fixed default anywhere `calculateMetadata` didn't run. A
 * plan that always fills the frames it was given can't leave black at the end or
 * cut its own final card off.
 */
export function buildBeats(spans: BeatSpec[], fps: number, total?: number): Beat[] {
  const beats: Beat[] = [];
  let at = 0;
  for (const span of spans) {
    const to = at + secondsToFrames(span.seconds, fps);
    beats.push({ id: span.id, from: at, to });
    at = to;
  }
  if (total != null && beats.length > 0) {
    const last = beats[beats.length - 1];
    // Never shorter than a single frame, whatever nonsense a duration override
    // hands us.
    last.to = Math.max(last.from + 1, total);
  }
  return beats;
}

/** The frame the whole plan ends on. */
export function beatsDuration(beats: Beat[]): number {
  return beats.length === 0 ? 0 : beats[beats.length - 1].to;
}

export function findBeat(beats: Beat[], id: string): Beat | null {
  return beats.find((beat) => beat.id === id) ?? null;
}

/** Where `frame` sits inside `beat`, 0–1, clamped at both ends. */
export function beatProgress(frame: number, beat: Beat | null): number {
  if (!beat || beat.to <= beat.from) return 0;
  return clamp01((frame - beat.from) / (beat.to - beat.from));
}

/** 0 before `from`, 1 after `from + length`, eased in between. */
export function ramp(frame: number, from: number, length: number): number {
  if (length <= 0) return frame >= from ? 1 : 0;
  return clamp01((frame - from) / length);
}

/** A trapezoid envelope: up over `fadeIn`, held, down over `fadeOut`. */
export function envelope(
  frame: number,
  from: number,
  to: number,
  fadeIn: number,
  fadeOut = fadeIn,
): number {
  if (frame <= from || frame >= to) return 0;
  return Math.min(ramp(frame, from, fadeIn), 1 - ramp(frame, to - fadeOut, fadeOut));
}

/* ---- Easing -------------------------------------------------------------
 *
 * Ease-out everywhere something arrives, ease-in-out where something travels.
 * Nothing is ever linear: a counter that ticks at a constant rate reads as a
 * stopwatch, and the point of a count-up is that it lands.
 */

export const easeOutCubic = (t: number) => 1 - (1 - clamp01(t)) ** 3;

export const easeOutQuint = (t: number) => 1 - (1 - clamp01(t)) ** 5;

export const easeInOutCubic = (t: number) => {
  const x = clamp01(t);
  return x < 0.5 ? 4 * x ** 3 : 1 - (-2 * x + 2) ** 3 / 2;
};

/** Overshoots once and settles — the stamp. Kept mild: past ~1.15 it reads as a
 *  toy. */
export const easeOutBack = (t: number, overshoot = 1.2) => {
  const x = clamp01(t);
  return 1 + (overshoot + 1) * (x - 1) ** 3 + overshoot * (x - 1) ** 2;
};

/** Linear map with clamping — `interpolate` without the Remotion import. */
export function mix(t: number, from: number, to: number): number {
  return from + (to - from) * clamp01(t);
}

/** The frame the `index`-th item of a cascade enters on. */
export function stagger(index: number, from: number, everyFrames: number): number {
  return from + index * everyFrames;
}
