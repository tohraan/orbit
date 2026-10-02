/* A fixed-window rate limiter, per client, per route group.
 *
 * Honest about what it is: process-local. It survives neither a restart nor a
 * second instance, so it is a courtesy guard against a loop in the page's own
 * code or one impatient script -- not a defence against a distributed flood.
 * That belongs at the edge (a WAF or the platform's own limiter), and this
 * exists so the hosted Postgres behind the cache is not the first thing to
 * notice. Entries are evicted lazily, bounded by MAX_KEYS, so the map cannot
 * grow without limit from spoofed forwarded-for headers. */

import "server-only";

const WINDOW_MS = 60_000;
const MAX_KEYS = 5_000;

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

function sweep(now: number) {
  for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
  if (buckets.size > MAX_KEYS) {
    /* Still over after the sweep: drop the oldest half rather than let a
     * header-spoofing caller use this map as free memory. */
    const sorted = [...buckets.entries()].sort((a, b) => a[1].resetAt - b[1].resetAt);
    for (let i = 0; i < sorted.length / 2; i++) buckets.delete(sorted[i][0]);
  }
}

/** Best-effort client identity. Spoofable; see the note above. */
export function clientKey(req: Request): string {
  const h = req.headers;
  const fwd = h.get("x-forwarded-for");
  const ip = fwd ? fwd.split(",")[0]!.trim() : h.get("x-real-ip") ?? h.get("cf-connecting-ip") ?? "local";
  return ip.slice(0, 64);
}

export type Verdict = { ok: true; remaining: number } | { ok: false; retryAfter: number };

export function take(key: string, limit: number): Verdict {
  const now = Date.now();
  if (buckets.size > 64) sweep(now);
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return { ok: true, remaining: limit - 1 };
  }
  if (b.count >= limit) return { ok: false, retryAfter: Math.ceil((b.resetAt - now) / 1000) };
  b.count += 1;
  return { ok: true, remaining: limit - b.count };
}
