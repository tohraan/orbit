"use client";

/* The one fetch hook every screen uses, so loading, empty and error are the
 * same three states everywhere (§119 states checklist).
 *
 * Three behaviours worth naming:
 *   - every request is abortable, and a superseded response is discarded; a
 *     slow page-1 landing after a fast page-2 would otherwise show page 1
 *   - `data` is KEPT while a refetch is in flight, with `loading` true, so a
 *     filter change dims the current grid instead of blanking it (§102, avoid
 *     sudden layout jumps)
 *   - the error is always our own sentence; the route handlers never send an
 *     internal message, and this never invents one from a status code
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api-base";

export type ApiState<T> = {
  data: T | null;
  loading: boolean;
  error: string | null;
  /** True only for the very first load, which is when the skeletons show. */
  initial: boolean;
  reload: () => void;
};

export function useApi<T>(url: string | null, fallbackError = "This could not be loaded right now."): ApiState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(!!url);
  const [error, setError] = useState<string | null>(null);
  const [initial, setInitial] = useState(true);
  const [nonce, setNonce] = useState(0);
  const live = useRef(0);

  useEffect(() => {
    if (!url) {
      /* A null url means the caller is not ready to ask yet — typically it is
       * still reading the session seed or the saved list out of storage. That
       * is a LOADING condition, not an empty result, so `initial` stays true.
       * Reporting it as finished made every cold load flash the empty state
       * ("Nothing left to suggest") for a frame before the real request went
       * out. Callers that genuinely have nothing to fetch, like
       * useItemsByIds with an empty id list, override `initial` themselves. */
      setLoading(false);
      return;
    }
    const seq = ++live.current;
    const ac = new AbortController();
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const res = await fetch(url, { signal: ac.signal, headers: { accept: "application/json" } });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
          throw new Error(body?.error?.message || fallbackError);
        }
        const json = (await res.json()) as T;
        if (seq !== live.current) return;
        setData(json);
        setError(null);
      } catch (err) {
        if ((err as Error).name === "AbortError" || seq !== live.current) return;
        setError((err as Error).message || fallbackError);
      } finally {
        if (seq === live.current) {
          setLoading(false);
          setInitial(false);
        }
      }
    })();

    return () => ac.abort();
  }, [url, nonce, fallbackError]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { data, loading, error, initial, reload };
}

/* Resolve a stored id list (saved, compared, tracked) to real records.
 *
 * The ids come from localStorage, so the titles behind them are not stored
 * with them — deliberately: caching a title locally means showing a stale
 * title, or a deadline that has since moved, with no way to tell. One request
 * against /api/opportunities?ids= keeps the index authoritative.
 *
 * `missing` matters: an id can survive in localStorage after its row leaves
 * the index (the deadline passed and a sweep removed it). The screens say so
 * rather than rendering a ghost row. */
export function useItemsByIds<T extends { id: number }>(ids: number[]) {
  const key = ids.join(",");
  const { data, loading, error, initial, reload } = useApi<{ items: T[] }>(
    key ? api(`/api/opportunities?ids=${key}&pageSize=60`) : null,
  );

  const byId = new Map((data?.items ?? []).map((i) => [i.id, i]));
  return {
    byId,
    /* Caller order wins: the saved list is newest-first, and the API returns
     * deadline order. */
    items: ids.map((id) => byId.get(id)).filter((x): x is T => !!x),
    missing: key ? ids.filter((id) => !byId.has(id)) : [],
    loading,
    error,
    initial: key ? initial : false,
    reload,
  };
}

/* ---------------------------------------------------------------- chunks ---
 * Accumulating pagination: each chunk is appended to what is already on
 * screen, and changing the query starts over.
 *
 * It exists because the alternative was shipping all 431 records — about
 * 740 kB of JSON — on the first paint, with 419 of them below the fold. Twelve
 * at a time is roughly one screen, and the pages are consistent because the
 * `mixed` ordering is seeded rather than random (lib/shuffle.ts).
 *
 * `key` is what resets it: pass a string that changes when the query does.
 */
export function useChunks<T extends { id: number }>(
  key: string,
  urlFor: (page: number) => string | null,
  extra?: (body: unknown) => void,
) {
  const [items, setItems] = useState<T[]>([]);
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [initial, setInitial] = useState(true);
  const live = useRef(0);
  const extraRef = useRef(extra);
  extraRef.current = extra;

  const fetchPage = useCallback(
    async (n: number, replace: boolean) => {
      const url = urlFor(n);
      if (!url) return;
      const seq = ++live.current;
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(url, { headers: { accept: "application/json" } });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
          throw new Error(body?.error?.message || "This could not be loaded right now.");
        }
        const body = (await res.json()) as { items: T[]; total: number; page: number; pageCount: number };
        if (seq !== live.current) return;
        extraRef.current?.(body);
        /* De-duplicate on append. A chunk boundary can repeat a row if the
         * index is refreshed mid-scroll, and a duplicate React key is a
         * rendering bug, not a cosmetic one. */
        setItems((cur) => {
          if (replace) return body.items;
          const seen = new Set(cur.map((i) => i.id));
          return [...cur, ...body.items.filter((i) => !seen.has(i.id))];
        });
        setTotal(body.total);
        setPage(body.page);
        setPageCount(body.pageCount);
      } catch (err) {
        if (seq === live.current) setError((err as Error).message);
      } finally {
        if (seq === live.current) {
          setLoading(false);
          setInitial(false);
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
  );

  /* A new key is a new query: clear the list first so the student is not
   * looking at results for filters they have just changed. */
  useEffect(() => {
    setItems([]);
    setTotal(null);
    setPage(1);
    setPageCount(1);
    setInitial(true);
    void fetchPage(1, true);
  }, [key, fetchPage]);

  return {
    items,
    total,
    page,
    pageCount,
    loading,
    error,
    initial,
    hasMore: page < pageCount,
    loadMore: () => {
      if (!loading && page < pageCount) void fetchPage(page + 1, false);
    },
    reload: () => void fetchPage(1, true),
  };
}
