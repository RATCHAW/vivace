/**
 * The only sound in the catalogue, and it is arithmetic.
 *
 * A heartbeat is synthesised here rather than shipped as a file, for the same
 * reason the grain is `feTurbulence` and the jitter comes from `core/seed.ts`:
 * **determinism is a feature**. `renderPropsHash` promises the athlete that the
 * stored MP4 *is* the film they just watched, and that promise has to cover the
 * audio track too. A pure function of a sample rate is the strongest possible
 * form of that guarantee — there is no asset to go missing from a bundle, no
 * `public/` folder for `deploySite` to find, and nothing to re-encode.
 *
 * Three constraints shape everything below:
 *
 * 1. **The clip has to be small.** Remotion collects the assets on screen once
 *    per frame and ships them out of Chromium as JSON, so the `src` of every
 *    mounted `<Audio>` crosses that boundary on every single frame. A data URL
 *    is charged at its full length there, which is why this is one short beat
 *    played many times and not one long track played once — 10 KB per frame
 *    against 900 KB, over four hundred frames.
 * 2. **It has to survive 11 kHz.** Which it does: a heart sound is all below
 *    200 Hz, so a rate with 5.5 kHz of headroom loses nothing an ear would miss
 *    and costs a quarter of what CD rate would.
 * 3. **It cannot click.** Both at the attack, where a sine starting at full
 *    amplitude is a step function, and at the tail, where a waveform cut
 *    mid-cycle is another one. Hence the short raised-cosine ramps at each end.
 *
 * React-free, like the rest of `core/`.
 */
import { hashSeed, seededRandom } from "./seed";

/**
 * 11.025 kHz — a standard rate, so nothing downstream has to resample oddly,
 * and four times more than a 200 Hz heart sound needs.
 */
export const HEARTBEAT_SAMPLE_RATE = 11_025;

/** How long one lub-dub lasts. Shorter than the gap between two beats at any
 *  heart rate a running human has, which is what keeps the clips from piling
 *  up: at most two are ever mounted at once. */
export const HEARTBEAT_SECONDS = 0.34;

/**
 * One of the two thuds a heart makes, as a damped sinusoid.
 *
 * S1 ("lub") is the valves between the chambers closing; S2 ("dub") is the ones
 * to the arteries, a moment later, higher and quieter. Everything a heartbeat
 * sounds like is in those two facts.
 */
interface Thud {
  /** Seconds from the start of the clip. */
  at: number;
  /** Fundamental, in Hz. */
  freq: number;
  /** Time constant of the exponential decay, in seconds. */
  decay: number;
  /** How long it is worth summing for — past this the envelope is silence. */
  length: number;
  gain: number;
}

const S1: Thud = { at: 0, freq: 46, decay: 0.03, length: 0.16, gain: 1 };
const S2: Thud = { at: 0.2, freq: 62, decay: 0.022, length: 0.13, gain: 0.62 };

/** The attack ramp. Long enough to kill the step, short enough that the thud
 *  still lands rather than swells. */
const ATTACK_SECONDS = 0.004;
/** The tail ramp, so the clip ends at zero whatever phase it was in. */
const RELEASE_SECONDS = 0.012;

/** A second partial gives the thud an edge; without it a pure sine reads as a
 *  test tone rather than as a body. */
const HARMONIC_GAIN = 0.32;
/** Filtered noise under the tone — the muscle, rather than the pitch. */
const NOISE_GAIN = 0.14;
/** Where that noise is rolled off. Above this it stops being a chest and starts
 *  being a hiss. */
const NOISE_CUTOFF_HZ = 180;

/** The peak the clip is normalised to. Short of full scale, because two beats
 *  can overlap at a high heart rate and the sum must not clip. */
const PEAK = 0.86;

const raisedCosine = (t: number) =>
  0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, Math.max(0, t)));

/**
 * One lub-dub, as samples in [-1, 1].
 *
 * Pure and seeded: the noise layer comes from `core/seed.ts`, so the same rate
 * always produces the same bytes and two renders of one film are the same file.
 */
export function heartbeatSamples(
  sampleRate: number = HEARTBEAT_SAMPLE_RATE,
): number[] {
  const count = Math.round(HEARTBEAT_SECONDS * sampleRate);
  const samples = new Array<number>(count).fill(0);

  // A one-pole low pass over white noise, run once and shared by both thuds —
  // the filter has state, so it cannot be a per-sample expression.
  const random = seededRandom(hashSeed("heartbeat", sampleRate));
  const coefficient =
    1 - Math.exp((-2 * Math.PI * NOISE_CUTOFF_HZ) / sampleRate);
  const noise = new Array<number>(count);
  let low = 0;
  for (let i = 0; i < count; i += 1) {
    low += coefficient * (random() * 2 - 1 - low);
    noise[i] = low;
  }

  for (const thud of [S1, S2]) {
    const from = Math.round(thud.at * sampleRate);
    const span = Math.round(thud.length * sampleRate);
    for (let i = 0; i < span; i += 1) {
      const index = from + i;
      if (index >= count) break;
      const t = i / sampleRate;
      const envelope =
        Math.exp(-t / thud.decay) * raisedCosine(t / ATTACK_SECONDS);
      const angle = 2 * Math.PI * thud.freq * t;
      const tone = Math.sin(angle) + HARMONIC_GAIN * Math.sin(2 * angle);
      samples[index] +=
        thud.gain * envelope * (tone + NOISE_GAIN * noise[index]);
    }
  }

  // Normalise, then fade the tail — in that order, because the fade must be the
  // last thing that touches the waveform or it is not a fade.
  let loudest = 0;
  for (const sample of samples) loudest = Math.max(loudest, Math.abs(sample));
  const scale = loudest > 0 ? PEAK / loudest : 0;
  const release = Math.max(1, Math.round(RELEASE_SECONDS * sampleRate));
  for (let i = 0; i < count; i += 1) {
    const fade = raisedCosine((count - 1 - i) / release);
    samples[i] *= scale * fade;
  }
  return samples;
}

/* ---- WAV ----------------------------------------------------------------- */

/** Little-endian, one byte at a time — no `DataView`, so the same code runs in
 *  Chromium, in Lambda's Chromium and in a Node test with no assumptions. */
function pushUint32(bytes: number[], value: number): void {
  bytes.push(
    value & 0xff,
    (value >>> 8) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 24) & 0xff,
  );
}

function pushUint16(bytes: number[], value: number): void {
  bytes.push(value & 0xff, (value >>> 8) & 0xff);
}

function pushAscii(bytes: number[], text: string): void {
  for (let i = 0; i < text.length; i += 1) bytes.push(text.charCodeAt(i));
}

const BASE64 =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/**
 * Base 64, by hand.
 *
 * `btoa` exists in every environment this runs in, but it takes a "binary
 * string" — a detour through `String.fromCharCode` over eight thousand bytes —
 * and `Buffer` does not exist in a browser. Sixteen lines is cheaper than
 * either, and it is the same sixteen lines everywhere.
 */
function base64(bytes: readonly number[]): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const b = bytes[i + 1];
    const c = bytes[i + 2];
    const word = (bytes[i] << 16) | ((b ?? 0) << 8) | (c ?? 0);
    out +=
      BASE64[(word >> 18) & 63] +
      BASE64[(word >> 12) & 63] +
      (b === undefined ? "=" : BASE64[(word >> 6) & 63]) +
      (c === undefined ? "=" : BASE64[word & 63]);
  }
  return out;
}

/**
 * Samples in [-1, 1] as a 16-bit mono PCM WAV, as a data URL.
 *
 * A data URL rather than `staticFile()` on purpose: the clip is *computed*, so
 * there is no file for the bundler to copy and no `public/` folder for
 * `deploySite` to be pointed at. Remotion's renderer decodes `data:` sources
 * itself, which is the whole reason this shape is available.
 */
export function wavDataUri(
  samples: readonly number[],
  sampleRate: number = HEARTBEAT_SAMPLE_RATE,
): string {
  const dataLength = samples.length * 2;
  const bytes: number[] = [];

  pushAscii(bytes, "RIFF");
  pushUint32(bytes, 36 + dataLength);
  pushAscii(bytes, "WAVE");
  pushAscii(bytes, "fmt ");
  pushUint32(bytes, 16); // PCM header length
  pushUint16(bytes, 1); // PCM, uncompressed
  pushUint16(bytes, 1); // mono
  pushUint32(bytes, sampleRate);
  pushUint32(bytes, sampleRate * 2); // byte rate
  pushUint16(bytes, 2); // block align
  pushUint16(bytes, 16); // bits per sample
  pushAscii(bytes, "data");
  pushUint32(bytes, dataLength);

  for (const sample of samples) {
    // Clamped before rounding: a sum that overshot would otherwise wrap from
    // full positive to full negative and put a crack in the middle of the beat.
    const clamped = Math.max(-1, Math.min(1, sample));
    const value = Math.round(clamped * (clamped < 0 ? 32_768 : 32_767));
    pushUint16(bytes, value < 0 ? value + 65_536 : value);
  }

  return `data:audio/wav;base64,${base64(bytes)}`;
}

/** The clip every heartbeat in a film plays, built once per module rather than
 *  once per render: it is the same eight thousand bytes every time. */
export function heartbeatClip(
  sampleRate: number = HEARTBEAT_SAMPLE_RATE,
): string {
  return wavDataUri(heartbeatSamples(sampleRate), sampleRate);
}
