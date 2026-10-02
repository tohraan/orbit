"use client";

/* §53, §89: workflow-oriented, with the status visually SECONDARY to the
 * opportunity — §53 says so twice over, which rules out the five-column
 * kanban board of coloured cards. A status filter row above a date-ordered
 * list puts the opportunity first and the status beside it.
 *
 * §55: colour sparingly. Interested is deliberately neutral, and only the
 * three statuses that mean something has happened carry an accent surface. */

import Link from "next/link";
import { useMemo, useState } from "react";
import r from "../rows.module.css";
import { PageHead } from "@/components/layout/AppShell";
import { DeadlineIndicator } from "@/components/opportunities/Indicators";
import { TrackControl } from "@/components/opportunities/Actions";
import { RowsSkeleton } from "@/components/feedback/Skeletons";
import { EmptyState, ErrorState } from "@/components/feedback/States";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { useItemsByIds } from "@/lib/useApi";
import { relativeTime, typeLabel } from "@rof/core";
import type { OpportunitySummary } from "@rof/core";
import { STATUSES, STATUS_LABELS, STATUS_TONE, useTracker, type Status } from "@/lib/store";

export default function ApplicationsPage() {
  const { entries, ready, clear } = useTracker();
  const ids = useMemo(() => entries.map((e) => e.id), [entries]);
  const { byId, missing, initial, error, reload } = useItemsByIds<OpportunitySummary>(ids);
  const [filter, setFilter] = useState<Status | "all">("all");

  const counts = useMemo(() => {
    const m = new Map<Status, number>();
    for (const e of entries) m.set(e.status, (m.get(e.status) ?? 0) + 1);
    return m;
  }, [entries]);

  /* Soonest deadline first, because that is the next thing that needs doing.
   * Entries whose row has left the index sort last; they are reported, not
   * rendered as a row. */
  const rows = useMemo(() => {
    const list = filter === "all" ? entries : entries.filter((e) => e.status === filter);
    return [...list].sort((a, b) => {
      const da = byId.get(a.id)?.deadline ?? "9999-99-99";
      const db = byId.get(b.id)?.deadline ?? "9999-99-99";
      return da.localeCompare(db);
    });
  }, [entries, filter, byId]);

  return (
    <>
      <PageHead
        eyebrow="Track"
        title="Applications"
        description="What you have started, where it stands, and what closes next. Stored on this device only."
        actions={
          entries.length ? (
            <Button variant="ghost" icon="trash" onClick={clear}>
              Clear all
            </Button>
          ) : null
        }
      />

      {!ready ? (
        <RowsSkeleton count={5} />
      ) : entries.length === 0 ? (
        <EmptyState
          icon="applications"
          title="No applications tracked yet"
          body="Open any opportunity and set a status — Interested, Planning, Applied — and it will appear here beside its deadline."
          actions={
            <ButtonLink href="/explore" variant="primary">
              Explore opportunities
            </ButtonLink>
          }
        />
      ) : error ? (
        <ErrorState
          title="Couldn't load your applications"
          body="The index could not be read, so the titles behind your tracked items are unavailable."
          actions={<Button variant="secondary" icon="refresh" onClick={reload}>Try again</Button>}
        />
      ) : (
        <>
          <div className={r.tabs}>
            <Button
              variant={filter === "all" ? "primary" : "secondary"}
              size="sm"
              aria-pressed={filter === "all"}
              onClick={() => setFilter("all")}
            >
              All ({entries.length})
            </Button>
            {STATUSES.filter((st) => counts.get(st)).map((st) => (
              <Button
                key={st}
                variant={filter === st ? "primary" : "secondary"}
                size="sm"
                aria-pressed={filter === st}
                onClick={() => setFilter(st)}
              >
                {STATUS_LABELS[st]} ({counts.get(st)})
              </Button>
            ))}
          </div>

          {initial ? (
            <RowsSkeleton count={Math.min(6, entries.length)} />
          ) : rows.length === 0 ? (
            <EmptyState
              compact
              icon="inbox"
              title="Nothing at this status"
              body="Switch back to All to see every application you are tracking."
              actions={
                <Button variant="secondary" onClick={() => setFilter("all")}>
                  Show all
                </Button>
              }
            />
          ) : (
            <div className={r.list} style={{ marginTop: "var(--s-4)" }}>
              {rows.map((e) => {
                const item = byId.get(e.id);
                if (!item) return null;
                return (
                  <div className={r.row} key={e.id}>
                    <Link href={`/opportunity/${e.id}`} className={r.date}>
                      {item.deadline ?? "—"}
                    </Link>
                    <Link href={`/opportunity/${e.id}`} className={r.body}>
                      <span className={`${r.title} clamp-1`}>{item.title}</span>
                      <span className={r.meta}>
                        {typeLabel(item.type)} &middot; {item.sourceName} &middot; status changed{" "}
                        {relativeTime(e.updatedAt)}
                      </span>
                    </Link>
                    <span className={r.status}>
                      <Chip tone={STATUS_TONE[e.status]}>{STATUS_LABELS[e.status]}</Chip>
                      <DeadlineIndicator item={item} />
                    </span>
                    <span className={r.actions}>
                      <TrackControl id={e.id} />
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {missing.length ? (
            <p className="t-body-sm c-muted" style={{ marginTop: "var(--s-6)" }}>
              {missing.length} tracked {missing.length === 1 ? "application points" : "applications point"} at a
              listing that has left the index — most likely closed. Its status is still stored, but there is
              nothing left to open.
            </p>
          ) : null}
        </>
      )}
    </>
  );
}
