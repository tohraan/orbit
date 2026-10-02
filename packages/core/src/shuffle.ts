/* Deterministic shuffling, and the "mixed" ordering the first screen uses.
 *
 * The problem this solves: sorted by deadline, the first twelve cards are
 * always the twelve closest to closing — which on this index means twelve
 * listings a student has at most a week to act on, and the same twelve for
 * everyone, every visit, until those deadlines pass. Sorted at random, the
 * ordering changes under the student's feet as they page.
 *
 * So the ordering is SEEDED and STRATIFIED. Every listing is placed in an
 * urgency band, each band is shuffled with a seed derived from the session,
 * and the bands are then interleaved round-robin. The result:
 *
 *   - any slice of it carries a spread of urgency, not one band
 *   - it is stable for a session, so page 2 never repeats page 1
 *   - two students see different orderings, so the same dozen listings are
 *     not the only ones anyone ever sees
 *
 * None of this is cryptographic and none of it needs to be. It decides the
 * order of a list of public listings. */

/** mulberry32 — small, fast, and identical on every platform. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a. Turns a session string into the 32-bit seed mulberry32 wants. */
export function hashSeed(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Fisher–Yates against a seeded generator. Does not mutate the input. */
export function shuffle<T>(items: readonly T[], seed: number): T[] {
  const out = [...items];
  const next = rng(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export const BANDS = ["week", "month", "quarter", "later", "rolling"] as const;
export type Band = (typeof BANDS)[number];

export function bandOf(daysLeft: number | null): Band {
  if (daysLeft == null) return "rolling";
  if (daysLeft < 0) return "rolling"; // expired listings sort with the undated
  if (daysLeft <= 7) return "week";
  if (daysLeft <= 30) return "month";
  if (daysLeft <= 90) return "quarter";
  return "later";
}

/**
 * Reorder the WHOLE list, not just the first page — that is what makes
 * pagination consistent. Bands are interleaved round-robin, weighted so the
 * urgent ones come round more often: a deadline this week is worth seeing
 * before one eighteen months out, but not to the exclusion of everything else.
 */
export function mixedOrder<T>(items: readonly T[], daysLeftOf: (item: T) => number | null, seed: number): T[] {
  const buckets = new Map<Band, T[]>(BANDS.map((b) => [b, []]));
  for (const item of items) buckets.get(bandOf(daysLeftOf(item)))!.push(item);

  /* A different sub-seed per band, so two bands of equal length do not come
   * out in lockstep with each other. */
  const queues = BANDS.map((b, i) => ({ band: b, items: shuffle(buckets.get(b)!, seed + i * 0x9e3779b9), at: 0 }));

  /* How many to take from each band per round. Urgent listings appear about
   * twice as often as distant ones, which is a visible bias without becoming
   * a deadline sort by another name. */
  const WEIGHT: Record<Band, number> = { week: 2, month: 2, quarter: 1, later: 1, rolling: 1 };

  const out: T[] = [];
  while (out.length < items.length) {
    let moved = false;
    for (const q of queues) {
      for (let n = 0; n < WEIGHT[q.band]; n++) {
        if (q.at < q.items.length) {
          out.push(q.items[q.at++]);
          moved = true;
        }
      }
    }
    /* Guard against a weight of 0 or an empty input turning this into a spin. */
    if (!moved) break;
  }
  return out;
}
