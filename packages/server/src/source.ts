/* The only module that talks to Supabase.
 *
 * SECURITY. SUPABASE_SERVICE_KEY bypasses row-level security, so it must never
 * reach a browser. Three things keep it there:
 *
 *   1. `server-only` above -- Next refuses to build if a client component
 *      imports this file, instead of silently inlining the key into a bundle.
 *   2. The key is read from a plain env var. A NEXT_PUBLIC_ prefix is what
 *      would ship it to the client, and nothing here uses one.
 *   3. Nothing in this module is re-exported from a "use client" file. The API
 *      routes are the only callers, and they return projected rows, never the
 *      raw payload blobs.
 *
 * Everything else here is about not hammering a hosted Postgres from a page
 * render: one in-process cache of the whole open-call set, refreshed on a TTL,
 * with the committed snapshot as the fallback. 431 rows is small enough that
 * filtering in memory is faster than a round trip per query, and it means the
 * demo works with no credentials at all. */

import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  daysUntil,
  fromRawItem,
  applyOverrides,
  overrideIndex,
  type OverrideRow,
  fromSnapshot,
  type OpportunityDetail,
  type RawItem,
  type SourceRow,
} from "@rof/core";

const TTL_MS = 5 * 60 * 1000;
/* The point past which a request stops being served stale and waits for the
   truth. See getIndex(). */
const HARD_MS = 2 * TTL_MS;
const PAGE = 500;

export type Index = {
  items: OpportunityDetail[];
  byId: Map<number, OpportunityDetail>;
  origin: "live" | "snapshot";
  freshestAt: string | null;
  loadedAt: number;
};

/* The cache lives on globalThis, not in a module variable.
 *
 * Next does not guarantee one module instance per process: instrumentation.ts
 * and the route handlers are compiled into different bundles, so each got its
 * OWN `cache` binding. The boot warm genuinely ran — the log proved it — and
 * the first request still paid 2.6s, because it was reading a different copy
 * of this module with an empty cache.
 *
 * A global key is shared by construction, which is the only thing that makes
 * warming on boot actually reach the request path. */
type Store = { cache: Index | null; inflight: Promise<Index> | null };
const KEY = Symbol.for("rof.index.store");
const store: Store = ((globalThis as Record<symbol, unknown>)[KEY] as Store) ?? { cache: null, inflight: null };
(globalThis as Record<symbol, unknown>)[KEY] = store;

function finalise(all: OpportunityDetail[], origin: "live" | "snapshot"): Index {
  /* A closed listing leaves the portal entirely -- not muted, not sorted last,
   * gone. A student cannot act on it, and showing it is an invitation to waste
   * an evening on an application that cannot be submitted.
   *
   * Done here rather than per screen so there is exactly one answer: the
   * counts, the facets, the timeline and the detail route all see the same
   * set, and an id that expires stops resolving (the saved and tracker screens
   * already report that as "left the index"). A listing closing TODAY is kept
   * -- days === 0 is still open.
   *
   * The cost is that this is evaluated against the SERVER's calendar day and
   * then cached for five minutes, so a listing can linger for a few minutes
   * past midnight in some timezone. The per-card countdown is computed in the
   * browser, which is where the viewer's own date is known. */
  const items = all.filter((o) => {
    if (!o.deadline) return true; // rolling and undated listings never expire
    const d = daysUntil(o.deadline);
    return d == null || d >= 0;
  });

  /* Soonest real deadline first, undated last -- the order a student wants,
   * and the order the list falls back to when no sort is requested. */
  items.sort(
    (a, b) =>
      (a.deadline ? 0 : 1) - (b.deadline ? 0 : 1) ||
      String(a.deadline).localeCompare(String(b.deadline)),
  );
  let freshest: string | null = null;
  for (const o of items) {
    const t = o.indexedAt ?? o.postedAt;
    if (t && (!freshest || t > freshest)) freshest = t;
  }
  const expired = all.length - items.length;
  if (expired) console.log(`[source] dropped ${expired} listing(s) past their deadline`);

  return {
    items,
    byId: new Map(items.map((o) => [o.id, o])),
    origin,
    freshestAt: freshest,
    loadedAt: Date.now(),
  };
}

/* The snapshot is looked for in several places because two different apps
 * mount this module and their working directories differ: the frontend runs
 * from web/, the data service from api/, and a local script may run from the
 * repo root. OPPORTUNITIES_SNAPSHOT overrides all of it. */
const SNAPSHOT_CANDIDATES = [
  process.env.OPPORTUNITIES_SNAPSHOT,
  join(process.cwd(), "data/opportunities.json"),
  join(process.cwd(), "../ui/opportunities.json"),
  join(process.cwd(), "ui/opportunities.json"),
].filter((p): p is string => !!p);

async function loadSnapshot(): Promise<Index> {
  const tried: string[] = [];
  for (const candidate of SNAPSHOT_CANDIDATES) {
    try {
      const raw = await readFile(candidate, "utf8");
      const rows = JSON.parse(raw) as Record<string, unknown>[];
      if (!Array.isArray(rows) || !rows.length) throw new Error("snapshot is empty");
      return finalise(rows.map(fromSnapshot), "snapshot");
    } catch {
      tried.push(candidate);
    }
  }
  /* Nothing to serve and nothing to fall back to. The route handlers turn this
   * into a 500 with a fixed sentence; the paths go to the server log only. */
  throw new Error(`no readable snapshot (tried ${tried.join(", ")})`);
}

async function loadLive(url: string, key: string): Promise<Index> {
  const base = `${url.replace(/\/+$/, "")}/rest/v1`;
  const headers = { apikey: key, Authorization: `Bearer ${key}` };
  const get = async <T>(path: string): Promise<T> => {
    const res = await fetch(`${base}/${path}`, { headers, cache: "no-store" });
    if (!res.ok) throw new Error(`supabase ${res.status}`);
    return res.json() as Promise<T>;
  };

  const sources = await get<SourceRow[]>("sources?select=slug,name,authority_tier,config");

  /* ALLOWLIST, not a blocklist. db/012 and db/013 split the registry four ways
   * -- open_call, awarded, institutional, programme -- and only the first is
   * something a student can apply to. A kind invented later stays out of the
   * finder until someone decides it belongs, rather than leaking in by
   * default. */
  const openCall = new Set(
    sources
      .filter((s) => ((s.config ?? {}).record_kind ?? "open_call") === "open_call")
      .map((s) => s.slug),
  );
  const meta = new Map(sources.map((s) => [s.slug, s]));

  const select =
    "select=id,source_slug,external_id,url,payload,detail,deadline,deadline_kind,first_seen_at";

  /* The open-call filter goes in the QUERY, not in the loop below.
   *
   * It used to fetch every raw_item and discard the ones from awarded,
   * institutional and programme sources in JavaScript. That meant pulling
   * 2,274 rows to keep 432 -- 81% of the download thrown away -- and because
   * payload and detail are large jsonb blobs, a page of 500 is about 3 MB.
   * Five pages, ~13.6 MB, and a measured 9.4 SECONDS before the first card
   * could render. With the TTL at five minutes, one visitor in every window
   * paid that.
   *
   * PostgREST's `in.()` takes the slugs directly, so the database sends only
   * the rows that were ever going to be kept. */
  const slugs = [...openCall];
  if (!slugs.length) throw new Error("no open_call sources configured");
  const only = `&source_slug=in.(${slugs.map((s) => encodeURIComponent(s)).join(",")})`;

  /* Staff corrections (db/020). Fetched whole rather than joined: there is one
   * row per CORRECTED listing, not per listing, so this is a few rows against
   * 432 — and a left join would have made the paged query above, which is
   * carefully shaped, considerably less obvious. An empty table costs one
   * request and nothing else.
   *
   * It is fetched BEFORE the listings on purpose. If it failed after the pages
   * were already in hand, the natural thing to write is a catch that carries on
   * without it — and carrying on without it means serving a listing staff have
   * suppressed. Failing here fails the whole load, which falls back to the
   * snapshot, which is the correct outcome: better a slightly stale feed than
   * one showing something that was taken down. */
  const overrides = overrideIndex(
    await get<OverrideRow[]>("opportunity_overrides?select=raw_item_id,suppressed,featured,patch"),
  );

  const items: OpportunityDetail[] = [];
  let after = 0;
  for (;;) {
    const page = await get<RawItem[]>(`raw_items?${select}${only}&id=gt.${after}&order=id.asc&limit=${PAGE}`);
    if (!page.length) break;
    for (const r of page) items.push(fromRawItem(r, meta.get(r.source_slug)));
    if (page.length < PAGE) break;
    after = page[page.length - 1].id;
  }
  if (!items.length) throw new Error("supabase returned no open calls");

  /* Corrections applied and suppressed listings dropped before anything else
   * sees them, so every downstream consumer — the facets, the search index,
   * the deadline calendar, the matcher — works on the corrected set and cannot
   * disagree with the cards about what exists. */
  const corrected = applyOverrides(items, overrides);
  if (!corrected.length) throw new Error("every open call is suppressed");
  return finalise(corrected, "live");
}

/** Drop the cache so the next read refetches.
 *
 * Called after a write through /api/admin: otherwise a staff member adds a
 * listing and does not see it for up to five minutes, which reads as the
 * feature being broken. Only affects THIS process — with several serverless
 * instances the others still serve their own cache until it expires, which is
 * the honest limit of an in-process cache and the reason the TTL is short. */
export function invalidateIndex(): void {
  store.cache = null;
}

/** Kick off a refresh without waiting for it.
 *
 *  A failed background refresh must never surface to a request already being
 *  served perfectly well from cache, so it is caught here. It is LOGGED rather
 *  than swallowed: this used to be `.catch(() => {})`, which meant a refresh
 *  that threw every time was indistinguishable from one that never ran, and
 *  the cache would sit at whatever it last held with nothing anywhere saying
 *  why. */
function refreshInBackground(): void {
  if (store.inflight) return;
  void load().catch((err) => {
    console.error("[source] background refresh failed:", err instanceof Error ? err.message : err);
  });
}

/** The whole open-call index.
 *
 * STALE-WHILE-REVALIDATE. A request never waits for a refresh it did not
 * cause: once there is a cache, an expired one is returned immediately and the
 * refresh happens behind it. Before this, the unlucky visitor who arrived just
 * after the TTL lapsed paid the entire reload -- which was the 9-second stall.
 *
 * Only the very first request of a process can block, and `warm()` below moves
 * even that off the request path.
 *
 * Never throws: falls back to the committed snapshot.
 */
export async function getIndex(): Promise<Index> {
  if (store.cache) {
    const age = Date.now() - store.cache.loadedAt;

    /* Past HARD_MS the request waits. Stale-while-revalidate assumes the
       revalidate half actually happens, and on a serverless host it often does
       not: the instance is frozen the moment the response is returned, so a
       promise nobody is awaiting is suspended mid-flight and may never finish.
       Without this bound the next request finds the same expired cache, starts
       another refresh that meets the same end, and serves the same stale data
       — for as long as that instance keeps being reused.

       Measured, rather than reasoned about: a listing deleted from the
       database was still being served ten minutes later, against a five minute
       TTL, while a fresh load of the same data locally returned the correct
       set immediately. The load path was fine; only its scheduling was not.

       So the window keeps its original purpose — nobody pays the reload just
       for arriving a second after the TTL lapsed — and staleness is bounded at
       HARD_MS instead of being bounded by luck. */
    if (age >= HARD_MS) {
      if (store.inflight) return store.inflight;
      return load();
    }

    if (age >= TTL_MS) refreshInBackground();
    return store.cache;
  }
  if (store.inflight) return store.inflight;

  return load();
}

function load(): Promise<Index> {
  if (store.inflight) return store.inflight;

  store.inflight = (async () => {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_KEY;
    if (url && key) {
      try {
        return await loadLive(url, key);
      } catch (err) {
        /* Server log only. The route handlers never forward this to the client:
         * a Supabase error message can name tables and columns. */
        console.error("[source] live read failed, serving snapshot:", (err as Error).message);
      }
    }
    return loadSnapshot();
  })()
    .then((idx) => {
      store.cache = idx;
      return idx;
    })
    .finally(() => {
      store.inflight = null;
    });

  return store.inflight;
}

/* Warm the cache as the process starts, so the first visitor does not pay for
 * the first load either. Fire-and-forget: if it fails, the first real request
 * falls back to the snapshot exactly as before. */
export function warm(): void {
  refreshInBackground();
}
