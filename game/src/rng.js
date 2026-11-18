// Seeded random numbers (mulberry32) so the city, the traffic and the screenshot scenes come out
// the same for the same seed and a bug can be reproduced exactly. Exports createRng (an
// independent generator for one system), the shared run-time generator behind frand/frange/fpick
// (reseeded by seedShared for tests and screenshots) and hash2 (a stateless per-cell hash).

/** An independent generator: the same seed gives the same sequence (a 0 or NaN seed counts as 1). */
export function createRng(seed) {
  let a = (seed >>> 0) || 1;
  const next = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    /** Uniform in [0, 1). */
    next,
    /** Uniform in [lo, hi). */
    range: (lo, hi) => lo + next() * (hi - lo),
    /** Uniform integer in lo..hi inclusive. */
    int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
    /** One element of `list` (undefined for an empty list; a number is drawn either way). */
    pick: (list) => list[Math.floor(next() * list.length)],
    /** True with probability p. */
    chance: (p) => next() < p,
    /** -1 or 1. */
    sign: () => (next() < 0.5 ? -1 : 1),
    /** Fisher-Yates shuffle of `list` in place; returns it. */
    shuffle(list) {
      for (let i = list.length - 1; i > 0; i -= 1) {
        const j = Math.floor(next() * (i + 1));
        const t = list[i];
        list[i] = list[j];
        list[j] = t;
      }
      return list;
    },
  };
}

/** The shared generator for run-time variety (traffic colours, particle jitter, AI choices). */
let shared = createRng(Math.floor(Math.random() * 4294967296));

/** Reseed the shared generator: main.js does it from the ?seed= parameter and the screenshot scenes again. */
export function seedShared(seed) {
  shared = createRng(seed);
}

/** Uniform in [0, 1) from the shared generator. */
export function frand() {
  return shared.next();
}

/** Uniform in [lo, hi) from the shared generator. */
export function frange(lo, hi) {
  return lo + shared.next() * (hi - lo);
}

/** One element of `list` from the shared generator. */
export function fpick(list) {
  return list[Math.floor(shared.next() * list.length)];
}

/** A fast stateless hash of two integers (and a salt) to [0, 1): per-cell variation without a generator. */
export function hash2(x, y, seed = 0) {
  let h = (x * 374761393 + y * 668265263 + seed * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
