// Seeded random numbers (mulberry32) so the city, traffic and screenshot scenes are identical for the
// same seed and any layout bug or screenshot can be reproduced exactly. Exports createRng(seed) with
// next/range/int/pick/chance/sign/shuffle, a shared gameplay stream (seedShared, frand, frange, fpick)
// and hash2 for a stable value from two coordinates.

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
export function seedShared(seed) {
  shared = createRng(seed);
}
export function frand() {
  return shared.next();
}
export function frange(lo, hi) {
  return lo + shared.next() * (hi - lo);
}
export function fpick(list) {
  return list[Math.floor(shared.next() * list.length)];
}

/** A fast integer hash for picking per-cell variation without carrying a generator around. */
export function hash2(x, y, seed = 0) {
  let h = (x * 374761393 + y * 668265263 + seed * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
