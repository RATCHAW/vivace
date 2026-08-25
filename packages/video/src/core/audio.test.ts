import { describe, expect, it } from "vitest";
import {
  HEARTBEAT_SAMPLE_RATE,
  HEARTBEAT_SECONDS,
  heartbeatClip,
  heartbeatSamples,
  wavDataUri,
} from "./audio";

/** The bytes back out of a data URL, so the header can be read as a header. */
function decode(uri: string): Uint8Array {
  const base64 = uri.slice(uri.indexOf(",") + 1);
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const digits = [...base64.replace(/=+$/, "")].map((char) =>
    alphabet.indexOf(char),
  );
  const bytes: number[] = [];
  for (let i = 0; i < digits.length; i += 4) {
    const word =
      (digits[i] << 18) |
      ((digits[i + 1] ?? 0) << 12) |
      ((digits[i + 2] ?? 0) << 6) |
      (digits[i + 3] ?? 0);
    bytes.push((word >> 16) & 0xff);
    if (digits[i + 2] !== undefined) bytes.push((word >> 8) & 0xff);
    if (digits[i + 3] !== undefined) bytes.push(word & 0xff);
  }
  return Uint8Array.from(bytes);
}

const ascii = (bytes: Uint8Array, from: number, length: number) =>
  String.fromCharCode(...bytes.slice(from, from + length));

const uint32 = (bytes: Uint8Array, at: number) =>
  bytes[at] |
  (bytes[at + 1] << 8) |
  (bytes[at + 2] << 16) |
  (bytes[at + 3] << 24);

const uint16 = (bytes: Uint8Array, at: number) =>
  bytes[at] | (bytes[at + 1] << 8);

describe("wavDataUri", () => {
  it("writes a header ffmpeg will accept", () => {
    const samples = [0, 0.5, -0.5, 1, -1];
    const bytes = decode(wavDataUri(samples, 8000));

    expect(ascii(bytes, 0, 4)).toBe("RIFF");
    expect(ascii(bytes, 8, 4)).toBe("WAVE");
    expect(ascii(bytes, 12, 4)).toBe("fmt ");
    expect(uint32(bytes, 16)).toBe(16); // PCM header length
    expect(uint16(bytes, 20)).toBe(1); // uncompressed
    expect(uint16(bytes, 22)).toBe(1); // mono
    expect(uint32(bytes, 24)).toBe(8000);
    expect(uint32(bytes, 28)).toBe(16_000); // byte rate
    expect(uint16(bytes, 32)).toBe(2); // block align
    expect(uint16(bytes, 34)).toBe(16); // bits per sample
    expect(ascii(bytes, 36, 4)).toBe("data");

    // The two lengths a decoder reads to know where the audio ends. Getting
    // either wrong produces a file that plays as silence or as a burst of noise.
    expect(uint32(bytes, 40)).toBe(samples.length * 2);
    expect(uint32(bytes, 4)).toBe(36 + samples.length * 2);
    expect(bytes.length).toBe(44 + samples.length * 2);
  });

  it("keeps full scale on both sides of zero", () => {
    // The one arithmetic mistake that matters here: 1 × 32768 wraps to full
    // negative in a signed 16-bit word, putting a crack in the loudest sample
    // of every beat.
    const bytes = decode(wavDataUri([1, -1, 2, -2], 8000));
    const word = (index: number) => {
      const value = uint16(bytes, 44 + index * 2);
      return value >= 32_768 ? value - 65_536 : value;
    };
    expect(word(0)).toBe(32_767);
    expect(word(1)).toBe(-32_768);
    // …and anything past full scale is clamped, not wrapped.
    expect(word(2)).toBe(32_767);
    expect(word(3)).toBe(-32_768);
  });

  it("announces itself as a wav", () => {
    expect(wavDataUri([0], 8000).startsWith("data:audio/wav;base64,")).toBe(
      true,
    );
  });
});

describe("the heartbeat", () => {
  const samples = heartbeatSamples();

  it("is exactly as long as the clip it is played from", () => {
    expect(samples.length).toBe(
      Math.round(HEARTBEAT_SECONDS * HEARTBEAT_SAMPLE_RATE),
    );
  });

  it("starts and ends at silence, so it cannot click", () => {
    // A waveform that begins or ends at anything but zero is a step function,
    // and a step function is a click — once per beat, thirty times a film.
    expect(Math.abs(samples[0])).toBeLessThan(0.001);
    expect(Math.abs(samples[samples.length - 1])).toBeLessThan(0.001);
  });

  it("never clips, even where two beats overlap", () => {
    const loudest = Math.max(...samples.map(Math.abs));
    expect(loudest).toBeGreaterThan(0.5);
    expect(loudest).toBeLessThanOrEqual(0.9);
  });

  it("is two thuds and not one", () => {
    // The whole difference between a heartbeat and a drum: energy in the first
    // sixth of a second, near-silence, then a second, quieter hit.
    const energy = (from: number, to: number) =>
      samples
        .slice(
          Math.round(from * HEARTBEAT_SAMPLE_RATE),
          Math.round(to * HEARTBEAT_SAMPLE_RATE),
        )
        .reduce((sum, sample) => sum + sample * sample, 0);

    const lub = energy(0, 0.09);
    const gap = energy(0.13, 0.19);
    const dub = energy(0.2, 0.29);
    expect(gap).toBeLessThan(lub / 100);
    expect(dub).toBeGreaterThan(gap * 100);
    expect(dub).toBeLessThan(lub);
  });

  it("is the same bytes every time", () => {
    // The promise `renderPropsHash` makes covers the audio track too: same
    // input, same options, byte-identical file.
    expect(heartbeatClip()).toBe(heartbeatClip());
    expect(heartbeatSamples()).toEqual(heartbeatSamples());
  });

  it("stays small enough to ship on every frame it is heard on", () => {
    // Remotion serialises the `src` of every mounted <Audio> out of the browser
    // once per frame. This is the number that makes a synthesised track viable
    // at all — see the note at the top of core/audio.ts.
    expect(heartbeatClip().length).toBeLessThan(16_000);
  });
});
