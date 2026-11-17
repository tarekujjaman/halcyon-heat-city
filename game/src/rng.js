// Seeded random numbers (mulberry32) for the whole game: the city plan, textures, traffic and
// screenshot scenes come out the same for the same seed, so a layout bug or a screenshot can be
// reproduced exactly. Exports createRng (an independent generator), the shared run-time
// generator behind frand/frange/fpick (seedShared fixes it for the scripted scenes), and hash2.

/**
 * An independent generator for `seed` (any number; 0 and NaN become 1): {next() in [0, 1),
 * range(lo, hi), int(lo, hi) inclusive, pick(list), chance(p), sign(), shuffle(list) in place}.
 * Each call advances the stream, so the order of calls is part of what a seed reproduces.
 */
export function createRng(seed) {
  let a = (seed >>> 0) || 1;
  const next = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    range: (lo, hi) => lo + next() * (hi - lo),
    int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
    pick: (list) => list[Math.floor(next() * list.length)],
    chance: (p) => next() < p,
    sign: () => (next() < 0.5 ? -1 : 1),
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

/** The shared generator for run-time variety (traffic colours, particle jitter, AI choices); seeded in screenshot scenes. */
let shared = createRng(Math.floor(Math.random() * 4294967296));

/** Restart the shared generator from `seed`: the playtest and the screenshot scenes call this at boot. */
export function seedShared(seed) {
  shared = createRng(seed);
}

/** The next shared draw in [0, 1). */
export function frand() {
  return shared.next();
}

/** A shared draw in [lo, hi). */
export function frange(lo, hi) {
  return lo + shared.next() * (hi - lo);
}

/** A shared pick from `list` (undefined for an empty list). */
export function fpick(list) {
  return list[Math.floor(shared.next() * list.length)];
}

/**
 * A fast integer hash of (x, y, seed) to [0, 1): per-cell variation (window offsets, scattered
 * props) without carrying a generator around. Stable across loads, so it shapes the city too.
 */
export function hash2(x, y, seed = 0) {
  let h = (x * 374761393 + y * 668265263 + seed * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
