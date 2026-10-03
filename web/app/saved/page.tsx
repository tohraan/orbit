"use client";

/* §52 and §86: the saved screen prioritises action, and reuses the SAME
 * opportunity card as everywhere else — §52 says so explicitly, and §115
 * lists Saved among the screens that must share one card component. The
 * category tabs are §52's controls. */

import { useMemo, useState } from "react";
import o from "@/components/opportunities/opportunity.module.css";
import card from "@/components/opportunities/card.module.css";
import { PageHead } from "@/components/layout/AppShell";
import { OpportunityCard } from "@/components/opportunities/OpportunityCard";
import { GridSkeleton } from "@/components/feedback/Skeletons";
import { EmptyState, ErrorState } from "@/components/feedback/States";
import { Button, ButtonLink } from "@/components/ui/Button";
import { useItemsByIds } from "@/lib/useApi";
import { typeLabel } from "@rof/core";
import type { OpportunitySummary } from "@rof/core";
import { useSaved } from "@/lib/data";
import { StartHere } from "@/components/feedback/StartHere";

export default function SavedPage() {
  const { saved, ready, clear } = useSaved();
  const { items, missing, initial, error, reload } = useItemsByIds<OpportunitySummary>(saved);
  const [tab, setTab] = useState<string>("all");

  /* §52's controls are generated from what is actually saved, rather than a
   * fixed list of four categories that may all be empty. */
  const tabs = useMemo(() => {
    const counts = new Map<string, number>();
    for (const i of items) {
      const key = i.type ?? "other";
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [
      { value: "all", label: "All", count: items.length },
      ...[...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([value, count]) => ({ value, label: typeLabel(value), count })),
    ];
  }, [items]);

  const shown = tab === "all" ? items : items.filter((i) => (i.type ?? "other") === tab);

  return (
    <>
      <PageHead
        eyebrow="Collection"
        title="Saved opportunities"
        description="Kept on this device only — this app has no accounts, so a saved list does not follow you to another browser."
        actions={
          saved.length ? (
            <Button variant="ghost" icon="trash" onClick={clear}>
              Clear all
            </Button>
          ) : null
        }
      />

      {!ready || initial ? (
        <div className={card.grid}>
          <GridSkeleton count={3} />
        </div>
      ) : error ? (
        <ErrorState
          title="Couldn't load your saved opportunities"
          body="The index could not be read, so the titles behind your saved items are unavailable."
          actions={
            <Button variant="secondary" icon="refresh" onClick={reload}>
              Try again
            </Button>
          }
        />
      ) : saved.length === 0 ? (
        /* §46, verbatim. */
        <EmptyState
          icon="bookmark"
          title="Your saved opportunities will appear here"
          body="Save opportunities while browsing so you can return to them later."
          actions={<StartHere />}
        />
      ) : (
        <>
          <div className={o.toolbar}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--s-2)" }} role="tablist" aria-label="Saved categories">
              {tabs.map((t) => (
                <Button
                  key={t.value}
                  variant={tab === t.value ? "selected" : "secondary"}
                  size="sm"
                  role="tab"
                  aria-selected={tab === t.value}
                  onClick={() => setTab(t.value)}
                >
                  {t.label} ({t.count})
                </Button>
              ))}
            </div>
            <p className={o.count}>
              <span className={o.countNumber}>{shown.length}</span> shown
            </p>
          </div>

          {missing.length ? (
            /* An id can outlive its row: the deadline passed and a sweep
               removed it. Say so rather than silently showing fewer cards
               than the sidebar count promised. */
            <p className="t-body-sm c-muted" style={{ marginBottom: "var(--s-4)" }}>
              {missing.length} saved {missing.length === 1 ? "item is" : "items are"} no longer in the index —
              they have most likely closed since you saved {missing.length === 1 ? "it" : "them"}.
            </p>
          ) : null}

          {shown.length === 0 ? (
            <EmptyState
              compact
              icon="inbox"
              title="Nothing saved in this category"
              body="Switch back to All, or save something of this kind while browsing."
              actions={
                <Button variant="secondary" onClick={() => setTab("all")}>
                  Show all saved
                </Button>
              }
            />
          ) : (
            <div className={card.grid}>
              {shown.map((item) => (
                <OpportunityCard key={item.id} item={item} />
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
}
