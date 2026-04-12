// src/utils/shuffle.ts
//
// Deterministic shuffle — used by queueBuilder so the same (profile, day)
// always produces the same card order. We seed a tiny 32-bit mulberry PRNG
// from the day-stamp and run Fisher-Yates with it. This is NOT cryptographic.

/** Mulberry32 — compact, decent-quality 32-bit PRNG. */
function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = t;
    r = Math.imul(r ^ (r >>> 15), r | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * In-place Fisher-Yates shuffle on a copy of the input, using a seeded PRNG.
 * Returns a new array so callers don't have to remember about mutation.
 */
export function deterministicShuffle<T>(arr: readonly T[], seed: number): T[] {
  const out = arr.slice();
  if (out.length < 2) return out;
  // Seed of 0 degenerates mulberry32, so nudge.
  const s = (seed | 0) === 0 ? 0xdead_beef : (seed | 0);
  const rand = mulberry32(s);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}
