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
  fromSnapshot,
  type OpportunityDetail,
  type RawItem,
  type SourceRow,
} from "@rof/core";

const TTL_MS = 5 * 60 * 1000;
const PAGE = 500;

export type Index = {
  items: OpportunityDetail[];
  byId: Map<number, OpportunityDetail>;
  origin: "live" | "snapshot";
  freshestAt: string | null;
  loadedAt: number;
};

let cache: Index | null = null;
let inflight: Promise<Index> | null = null;

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
  const items: OpportunityDetail[] = [];
  let after = 0;
  for (;;) {
    const page = await get<RawItem[]>(`raw_items?${select}&id=gt.${after}&order=id.asc&limit=${PAGE}`);
    if (!page.length) break;
    for (const r of page) {
      if (!openCall.has(r.source_slug)) continue;
      items.push(fromRawItem(r, meta.get(r.source_slug)));
    }
    after = page[page.length - 1].id;
  }
  if (!items.length) throw new Error("supabase returned no open calls");
  return finalise(items, "live");
}

/** Drop the cache so the next read refetches.
 *
 * Called after a write through /api/admin: otherwise a staff member adds a
 * listing and does not see it for up to five minutes, which reads as the
 * feature being broken. Only affects THIS process — with several serverless
 * instances the others still serve their own cache until it expires, which is
 * the honest limit of an in-process cache and the reason the TTL is short. */
export function invalidateIndex(): void {
  cache = null;
}

/** The whole open-call index, cached. Never throws: falls back to the snapshot. */
export async function getIndex(): Promise<Index> {
  if (cache && Date.now() - cache.loadedAt < TTL_MS) return cache;
  if (inflight) return inflight;

  inflight = (async () => {
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
      cache = idx;
      return idx;
    })
    .finally(() => {
      inflight = null;
    });

  return inflight;
}
