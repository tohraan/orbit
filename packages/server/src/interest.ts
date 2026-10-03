/* How many students are interested in each opportunity.
 *
 * Deliberately NOT part of the opportunity index. The index is big, expensive
 * and changes when a scrape runs — minutes or hours apart — so it is cached
 * hard. These counts change every time anyone saves anything, and a student
 * who saves a listing and sees the number not move assumes the save failed.
 * Two different rates of change, so two different caches.
 *
 * The numbers come from `opportunity_interest`, maintained by triggers
 * (db/017). Nothing here can write them, and nothing in the browser can
 * either — a count the client reports is a count the client can invent.
 */

export type Interest = { saved: number; tracked: number };

/* Short, because the cost of being 45 seconds stale is a slightly old number
 * and the cost of not caching is a Supabase round trip on every single card
 * render. */
const TTL_MS = 45_000;

/* Same globalThis trick as the index, and for the same reason: instrumentation
 * and route handlers are separate module instances, so a module-level cache
 * would be two caches that never see each other. */
type Store = { data: Map<number, Interest>; loadedAt: number; inflight: Promise<Map<number, Interest>> | null };
const KEY = Symbol.for("rof.interest.store");
const store: Store = ((globalThis as Record<symbol, unknown>)[KEY] as Store) ?? {
  data: new Map(),
  loadedAt: 0,
  inflight: null,
};
(globalThis as Record<symbol, unknown>)[KEY] = store;

type Row = { opportunity_id: number; saved_count: number; tracked_count: number };

async function load(): Promise<Map<number, Interest>> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  const out = new Map<number, Interest>();
  if (!url || !key) return out;

  /* Only rows that actually have interest exist, so this is small — a few
   * hundred at most, and zero on a fresh deployment. */
  const res = await fetch(
    `${url}/rest/v1/opportunity_interest?select=opportunity_id,saved_count,tracked_count&or=(saved_count.gt.0,tracked_count.gt.0)`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` }, cache: "no-store" },
  );
  if (!res.ok) throw new Error(`${res.status}`);
  for (const r of (await res.json()) as Row[]) {
    out.set(Number(r.opportunity_id), { saved: r.saved_count ?? 0, tracked: r.tracked_count ?? 0 });
  }
  return out;
}

/**
 * The current counts, keyed by opportunity id.
 *
 * Never throws and never blocks a page. If db/017 has not been applied, or
 * Supabase is unreachable, this returns what it last had — an empty map on a
 * cold process — and the cards simply show no interest line. A missing count
 * is a missing count; it is not worth failing a page over.
 */
export async function getInterest(): Promise<Map<number, Interest>> {
  const fresh = Date.now() - store.loadedAt < TTL_MS;
  if (fresh && store.loadedAt) return store.data;
  if (store.inflight) return store.inflight;

  store.inflight = load()
    .then((m) => {
      store.data = m;
      store.loadedAt = Date.now();
      return m;
    })
    .catch(() => {
      /* Keep serving the last good map, and keep the stale timestamp so the
       * next request retries rather than hammering a failing endpoint. */
      store.loadedAt = Date.now() - TTL_MS + 5_000;
      return store.data;
    })
    .finally(() => {
      store.inflight = null;
    });

  return store.inflight;
}

/* Below this, the number is withheld rather than shown.
 *
 * Not squeamishness: this is one campus. "1 student is interested" on a niche
 * listing, in a cohort where everyone knows everyone, is close to naming them —
 * and it is useless as social proof anyway. Three is the smallest number that
 * says "some people" rather than "a person". */
export const MIN_VISIBLE = 3;

/** Attach counts to whatever is being returned, withholding the small ones. */
export function withInterest<T extends { id: number }>(
  items: T[],
  counts: Map<number, Interest>,
): (T & { interest: number | null })[] {
  return items.map((it) => {
    const c = counts.get(it.id);
    /* Saved and tracked overlap heavily — a student usually saves a listing
     * before tracking it — so the headline figure is the larger of the two
     * rather than their sum, which would double-count the same person. */
    const n = c ? Math.max(c.saved, c.tracked) : 0;
    return { ...it, interest: n >= MIN_VISIBLE ? n : null };
  });
}
