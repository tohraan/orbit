"use client";

/* §84 module order: page header, search, filters, sort, active filters, grid,
 * then — §102's second option — infinite loading rather than pagination.
 *
 * The grid loads in chunks of twelve. Sending all 431 records (about 740 kB)
 * on the first paint put 419 cards below the fold and made a cold visit feel
 * broken; §102 permits infinite loading provided it "preserves scroll position
 * and avoids sudden layout jumps", which is why each chunk appends beneath the
 * last and the sentinel below it is the same height as a card row.
 *
 * The default ordering is `mixed`, not deadline: see lib/shuffle.ts for what
 * that means and why the first screen should not be twelve listings that all
 * close inside a week. */

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import o from "@/components/opportunities/opportunity.module.css";
import u from "@/components/ui/ui.module.css";
import { PageHead } from "@/components/layout/AppShell";
import layout from "@/components/layout/layout.module.css";
import { OpportunityCard } from "@/components/opportunities/OpportunityCard";
import { ActiveFilters, FilterBar, MobileFilterBar, SortControl, useFilters } from "@/components/filters/Filters";
import { GridSkeleton } from "@/components/feedback/Skeletons";
import { EmptyState, ErrorState } from "@/components/feedback/States";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { useApi, useChunks } from "@/lib/useApi";
import { relativeTime } from "@rof/core";
import type { Facets, OpportunitySummary } from "@rof/core";
import { useSessionSeed } from "@/lib/data";
import { api } from "@/lib/api-base";

/* One screen of cards: the grid is three columns at desktop and a card is
 * ~344px, so twelve fills roughly four rows and the next batch is already in
 * flight before the student reaches the bottom.
 *
 * A fixed number rather than one measured from the viewport, on purpose: every
 * visitor then requests the same page boundaries, so the server's cached index
 * serves identical slices to everyone instead of a different cut per device.
 * It is a page size, not a limit -- the list runs to all 431. */
const CHUNK = 12;

/* Only parameters the API understands are forwarded. An unrecognised key in
 * the address bar changes nothing and is never echoed back. */
const FORWARD = ["q", "type", "country", "funding", "level", "source", "requires", "deadline"];

export function ExploreScreen() {
  const params = useSearchParams();
  const router = useRouter();
  const filters = useFilters();
  const seed = useSessionSeed();

  /* Facets are their own request: they describe the whole index, so they do
   * not change as the student pages, and bundling them into every chunk would
   * re-send 80 buckets per twelve cards. Cached for ten minutes server-side. */
  const facetsReq = useApi<{ facets: Facets }>(api("/api/facets"));
  const facets = facetsReq.data?.facets ?? null;

  const search = params.get("q")?.trim() ?? "";
  /* No explicit choice: a search means relevance, a browse means the mixed
   * urgency spread. Either way an explicit ?sort wins. */
  const sort = params.get("sort") ?? (search ? "relevance" : "mixed");

  const query = useMemo(() => {
    const sp = new URLSearchParams();
    for (const key of FORWARD) for (const v of params.getAll(key)) if (v) sp.append(key, v);
    sp.set("sort", sort);
    if (sort === "mixed" && seed) sp.set("seed", seed);
    sp.set("pageSize", String(CHUNK));
    return sp;
  }, [params, sort, seed]);

  /* The key resets the accumulated list. The seed is in it so that the very
   * first render — before sessionStorage has been read — does not get stuck
   * holding an unseeded first chunk. */
  const key = query.toString();
  const list = useChunks<OpportunitySummary>(key, (page) => {
    /* `mixed` needs the seed before it can be stable, so hold the first
     * request for the one frame it takes to read sessionStorage. */
    if (sort === "mixed" && !seed) return null;
    const sp = new URLSearchParams(query);
    if (page > 1) sp.set("page", String(page));
    return api(`/api/opportunities?${sp.toString()}`);
  });

  const freshness = useApi<{ freshestAt: string | null }>(api("/api/stats"));

  /* Auto-load the next chunk when the sentinel comes into view, with a wide
   * root margin so the chunk is usually already on screen by the time the
   * student reaches the bottom. The button stays: an observer does not fire
   * for anyone navigating by keyboard, and §74 wants a real control. */
  const sentinel = useRef<HTMLDivElement>(null);
  /* Whether scroll-triggered loading is actually working. The manual control
   * below is a fallback for when it is not -- an old browser, or an observer
   * that never fires -- rather than a permanent part of the UI. */
  const [autoLoads, setAutoLoads] = useState(true);

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") setAutoLoads(false);
  }, []);

  useEffect(() => {
    const node = sentinel.current;
    if (!node || !list.hasMore || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) list.loadMore();
      },
      { rootMargin: "600px 0px" },
    );
    io.observe(node);
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list.hasMore, list.loading, list.page, key]);

  return (
    <>
      <PageHead
        eyebrow="Discover"
        title="Find opportunities that match your goals"
        description="Scholarships, fellowships, grants, internships and other programmes a BITS Pilani Dubai student can actually apply to, in one place."
        actions={
          freshness.data?.freshestAt ? (
            <span className="t-meta c-muted">Updated {relativeTime(freshness.data.freshestAt)}</span>
          ) : null
        }
      />

      <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-4)" }}>
        <SearchField />
        <FilterBar facets={facets} />
        <MobileFilterBar facets={facets} sortFallback={sort} />
        <ActiveFilters facets={facets} />
      </div>

      <section style={{ marginTop: "var(--s-10)" }} id="results">
        <div className={o.toolbar}>
          {/* The total is the headline; how far through you are is secondary and
              phrased as progress, not as a batch size. Naming the batch made a
              paginated list read as a fixed sample with the rest bolted on. */}
          <p className={o.count} aria-live="polite">
            {list.initial ? (
              <span className="skeleton skeleton-line" style={{ width: 160, display: "inline-block" }} />
            ) : (
              <>
                <span className={o.countNumber}>{list.total ?? 0}</span>{" "}
                {list.total === 1 ? "opportunity" : "opportunities"}
                {filters.activeCount || search ? " match your filters" : ""}
                {list.items.length < (list.total ?? 0) ? (
                  <span className={o.countSeen}> · {list.items.length} seen</span>
                ) : null}
              </>
            )}
          </p>
          <span className={o.toolbarSort}>
            <SortControl fallback={sort} />
          </span>
        </div>

        {sort === "mixed" && !filters.activeCount && !search && !list.initial ? (
          /* Say what the ordering is. A list that is neither alphabetical nor
             by date and does not explain itself reads as arbitrary. */
          <p className="t-meta c-muted" style={{ marginBottom: "var(--s-4)" }}>
            Mixed by urgency: each batch holds a spread of deadlines rather than only the ones closing first.
            Sort by <strong>Deadline soonest</strong> for strict date order.
          </p>
        ) : null}

        {list.error && !list.items.length ? (
          <ErrorState
            body={list.error}
            actions={
              <Button variant="secondary" icon="refresh" onClick={list.reload}>
                Try again
              </Button>
            }
          />
        ) : list.initial ? (
          <div className={o.grid}>
            <GridSkeleton count={CHUNK} />
          </div>
        ) : list.items.length === 0 ? (
          /* §45, verbatim copy. The action matches what is actually wrong: a
             filtered empty result gets Clear filters; an unfiltered one has
             nothing to clear. */
          filters.activeCount || search ? (
            <EmptyState
              icon="explore"
              title="No opportunities found"
              body="Try removing a filter or changing your search."
              actions={
                <Button variant="primary" onClick={filters.clearAll}>
                  Clear filters
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon="inbox"
              title="The index is empty"
              body="No open calls are currently stored. This usually means the collection run has not finished."
              actions={
                <Button variant="secondary" icon="refresh" onClick={list.reload}>
                  Try again
                </Button>
              }
            />
          )
        ) : (
          <>
            <div className={o.grid}>
              {list.items.map((item) => (
                <OpportunityCard key={item.id} item={item} />
              ))}
              {/* The next chunk's skeletons sit INSIDE the grid, so the row
                  it is about to fill already has its height and nothing below
                  jumps when the cards arrive (§103). */}
              {list.loading && !list.initial ? <GridSkeleton count={3} /> : null}
            </div>

            <div ref={sentinel} className={o.pager}>
              {!list.hasMore ? (
                <span className={o.pagerInfo}>
                  That is all {list.total} {list.total === 1 ? "opportunity" : "opportunities"}
                  {filters.activeCount || search ? " for these filters" : " in the index"}.
                </span>
              ) : autoLoads && !list.error ? (
                /* Scrolling is doing the work. A spinner rather than a button,
                   so there is no seam in the middle of a continuous list. */
                <span className={o.pagerInfo} aria-live="polite">
                  <span className="spinner" style={{ display: "inline-block", verticalAlign: "-2px" }} />
                  <span className="sr-only">Loading more opportunities</span>
                </span>
              ) : (
                /* The fallback: shown only when the observer is unavailable or
                   a batch failed, so there is always a way forward. */
                <Button variant="secondary" onClick={list.loadMore} busy={list.loading} iconAfter="chevron-down">
                  {list.loading ? "Loading" : "Show more opportunities"}
                </Button>
              )}
            </div>

            {list.error ? (
              /* A chunk failed but earlier ones are still on screen: report it
                 beside the list rather than replacing what already loaded. */
              <p className="t-body-sm" style={{ color: "var(--color-danger)", textAlign: "center" }}>
                {list.error}{" "}
                <button
                  type="button"
                  onClick={list.loadMore}
                  style={{ textDecoration: "underline", textUnderlineOffset: 2 }}
                >
                  Retry
                </button>
              </p>
            ) : null}
          </>
        )}
      </section>
    </>
  );
}

/* §18's placeholder. The term lives in the URL like every filter, so a search
 * is shareable and the back button undoes it. Debounced: one request per
 * keystroke is one request too many. */
function SearchField() {
  const params = useSearchParams();
  const router = useRouter();
  const timer = useRef<number | undefined>(undefined);

  return (
    <div className={u.field} style={{ maxWidth: 520 }}>
      <Icon name="search" size={16} />
      <input
        className={u.fieldInput}
        defaultValue={params.get("q") ?? ""}
        placeholder="Search opportunities..."
        aria-label="Search opportunities"
        maxLength={120}
        onChange={(e) => {
          const value = e.target.value;
          window.clearTimeout(timer.current);
          timer.current = window.setTimeout(() => {
            const sp = new URLSearchParams(params.toString());
            if (value.trim()) sp.set("q", value.trim());
            else sp.delete("q");
            sp.delete("page");
            router.replace(`/explore?${sp.toString()}`, { scroll: false });
          }, 260);
        }}
      />
    </div>
  );
}
