/**
 * Determinism: same input, same options, same output — byte for byte.
 *
 * Anything that wants to look random (grain, the jitter on a stamp) takes its
 * numbers from here instead of from `Math.random`, seeded off the run's id. A
 * render that came out differently the second time would make the stored-video
 * reuse check a lie: the hash says "you already have this film", and it has to
 * be true.
 */

/** FNV-1a over the string form of the parts. Small, stable, and no dependency. */
export function hashSeed(...parts: Array<string | number>): number {
  let hash = 0x811c9dc5;
  for (const part of parts) {
    const text = String(part);
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
  }
  // Keep it positive and small enough for an SVG `seed` attribute.
  return Math.abs(hash) % 100_000;
}

/** mulberry32 — a seeded PRNG in eight lines, uniform enough for jitter. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}
