/* Forgiving matching for the command palette.
 *
 * Two jobs, because they answer different questions:
 *
 *   subsequence  — does the query appear in order, with gaps? Catches "dl" for
 *                  "Deadlines" and "cmp" for "Compare". Fast, and it is what
 *                  makes a palette feel like a palette rather than a filter.
 *
 *   edit distance — how far off is the query from the target? Catches a typo,
 *                  "deadlins" or "compair", which a subsequence check misses
 *                  because the letters are not in order.
 *
 * The first drives the result list; the second drives "did you mean", shown
 * only when nothing matched outright — a suggestion offered alongside results
 * is noise, a suggestion offered instead of an empty box is a rescue.
 *
 * Deliberately not a library: this ranks at most a few dozen entries on every
 * keystroke, and the whole thing is forty lines.
 */

/** Position-aware subsequence score, or null when the query does not fit. */
export function subsequenceScore(query: string, target: string): number | null {
  const q = query.toLowerCase().trim();
  const t = target.toLowerCase();
  if (!q) return 0;
  if (t.includes(q)) {
    /* A straight substring always beats a scattered match, and a hit at the
     * start beats one in the middle. */
    return 1000 - t.indexOf(q) * 4 - (t.length - q.length);
  }
  let ti = 0;
  let score = 0;
  let streak = 0;
  for (const ch of q) {
    const found = t.indexOf(ch, ti);
    if (found === -1) return null;
    /* Consecutive characters are worth more than scattered ones, so "dead"
     * ranks "Deadlines" above a word that merely contains d, e, a and d. */
    streak = found === ti ? streak + 1 : 0;
    score += 10 + streak * 6 - Math.min(found - ti, 8);
    ti = found + 1;
  }
  return score - t.length * 0.2;
}

/** Levenshtein, capped — anything past `max` is "not close" and we stop caring. */
export function editDistance(a: string, b: string, max = 4): number {
  const s = a.toLowerCase();
  const t = b.toLowerCase();
  if (Math.abs(s.length - t.length) > max) return max + 1;
  let prev = Array.from({ length: t.length + 1 }, (_, i) => i);
  for (let i = 1; i <= s.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= t.length; j++) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      best = Math.min(best, cur[j]);
    }
    if (best > max) return max + 1;
    prev = cur;
  }
  return prev[t.length];
}

/** The closest label to a query that matched nothing, or null if none is close. */
export function didYouMean(query: string, candidates: string[]): string | null {
  const q = query.trim();
  if (q.length < 3) return null;
  /* Allow more slack in a longer word: one typo in four letters is noise, one
   * in ten is a slip. */
  const tolerance = Math.max(1, Math.min(4, Math.floor(q.length / 3)));
  let best: { label: string; d: number } | null = null;
  for (const c of candidates) {
    /* Compare against whole words too, so "deadlins" reaches "Deadlines" even
     * when the candidate is "Deadlines — upcoming closing dates". */
    for (const part of [c, ...c.split(/[\s—·]+/)]) {
      if (part.length < 3) continue;
      const d = editDistance(q, part, tolerance);
      if (d <= tolerance && (!best || d < best.d)) best = { label: c, d };
    }
  }
  return best?.label ?? null;
}
