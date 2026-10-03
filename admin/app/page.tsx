"use client";

/* The overview: is the portal healthy, and what needs attention.
 *
 * Built out of what already exists rather than new counters. v_source_health
 * has been in db/002 since the beginning and nothing has ever read it — it is
 * the first question a department will ask when the feed looks thin, and the
 * answer was already in the database. */

import Link from "next/link";
import { useEffect, useState } from "react";
import t from "@/components/table.module.css";
import shell from "@/components/shell.module.css";
import { desk } from "@/lib/desk";
import { todayInDubai } from "@/lib/draft";

type Listing = { id: number; title?: string; deadline?: string | null; manual: boolean; suppressed: boolean; featured: boolean; saved: number };
type Source = { slug?: string; name?: string; items?: number; last_item_at?: string | null; enabled?: boolean; [k: string]: unknown };
type Roster = { total: number; onboarded: number; withLevel: number };

export default function Overview() {
  const [listings, setListings] = useState<Listing[] | null>(null);
  const [roster, setRoster] = useState<Roster | null>(null);
  const [sources, setSources] = useState<Source[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const [l, r, s] = await Promise.all([
        desk<{ items: Listing[] }>("listings"),
        desk<Roster>("students"),
        desk<{ sources: Source[] }>("sources"),
      ]);
      if (!l.ok) setError(l.error.message); else setListings(l.data.items);
      if (r.ok) setRoster(r.data);
      if (s.ok) setSources(s.data.sources);
    })();
  }, []);

  const today = todayInDubai();
  const live = listings?.filter((x) => !x.suppressed) ?? [];
  const closingSoon = live.filter((x) => {
    const d = x.deadline;
    if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d) || d < today) return false;
    const days = Math.round((Date.UTC(+d.slice(0,4), +d.slice(5,7)-1, +d.slice(8,10)) -
      Date.UTC(+today.slice(0,4), +today.slice(5,7)-1, +today.slice(8,10))) / 86_400_000);
    return days <= 14;
  });
  const mostSaved = [...live].sort((a, b) => (b.saved ?? 0) - (a.saved ?? 0)).filter((x) => x.saved > 0).slice(0, 6);

  return (
    <>
      <header className={t.head}>
        <span className="eyebrow">Desk</span>
        <h1 className="t-page-title">Overview</h1>
        <p className="t-body-sm c-secondary">
          The state of the portal: what students can see, who is using it, and whether the automatic feed is
          still bringing things in.
        </p>
      </header>

      {error ? <p className={shell.error} role="alert">{error}</p> : null}

      <div className={t.stats}>
        <div className={t.stat}>
          <span className={t.statVal}>{listings ? live.length : "—"}</span>
          <span className={t.statKey}>Live listings</span>
          {listings ? <span className={t.statNote}>{listings.filter((x) => x.manual).length} added by the desk</span> : null}
        </div>
        <div className={t.stat}>
          <span className={t.statVal}>{listings ? closingSoon.length : "—"}</span>
          <span className={t.statKey}>Closing in 14 days</span>
          <span className={t.statNote}>Worth an announcement</span>
        </div>
        <div className={t.stat}>
          <span className={t.statVal}>{roster?.total ?? "—"}</span>
          <span className={t.statKey}>Students registered</span>
          {roster ? <span className={t.statNote}>{roster.onboarded} finished setup</span> : null}
        </div>
        <div className={t.stat}>
          <span className={t.statVal}>{sources ? sources.filter((s) => s.enabled !== false).length : "—"}</span>
          <span className={t.statKey}>Sources enabled</span>
          <span className={t.statNote}>Of {sources?.length ?? "—"} configured</span>
        </div>
      </div>

      <div className={t.toolbar}>
        <Link href="/add" className={shell.primary}>Add an opportunity</Link>
        <Link href="/listings" className={shell.ghost}>Manage listings</Link>
      </div>

      <h2 className="t-section" style={{ marginBottom: "var(--space-3)" }}>What students are saving</h2>
      <div className={t.wrap}>
        <div className={t.scroll}>
          <table className={t.table}>
            <thead><tr><th>Listing</th><th className={t.num}>Saved by</th></tr></thead>
            <tbody>
              {!listings ? (
                <tr><td colSpan={2} className={t.empty}>Loading…</td></tr>
              ) : mostSaved.length === 0 ? (
                <tr><td colSpan={2} className={t.empty}>
                  Nobody has saved anything yet. Counts appear here as students use the portal.
                </td></tr>
              ) : mostSaved.map((x) => (
                <tr key={x.id}>
                  <td className={t.title}>{x.title ?? `Listing #${x.id}`}</td>
                  <td className={t.num}>{x.saved}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <h2 className="t-section" style={{ margin: "var(--space-8) 0 var(--space-3)" }}>The automatic feed</h2>
      <div className={t.wrap}>
        <div className={t.scroll}>
          <table className={t.table}>
            <thead><tr><th>Source</th><th className={t.num}>Items</th><th>Last brought something in</th><th>State</th></tr></thead>
            <tbody>
              {!sources ? (
                <tr><td colSpan={4} className={t.empty}>Loading…</td></tr>
              ) : sources.length === 0 ? (
                <tr><td colSpan={4} className={t.empty}>No sources configured.</td></tr>
              ) : sources.map((s, i) => (
                <tr key={String(s.slug ?? i)}>
                  <td>
                    <div className={t.title}>{String(s.name ?? s.slug ?? "—")}</div>
                    <div className={t.sub}>{String(s.slug ?? "")}</div>
                  </td>
                  <td className={t.num}>{typeof s.items === "number" ? s.items : "—"}</td>
                  <td className={t.dim}>{s.last_item_at ? String(s.last_item_at).slice(0, 10) : "—"}</td>
                  <td>
                    {s.enabled === false
                      ? <span className={`${t.pill} ${t.pillEdited}`}>Manual</span>
                      : <span className={`${t.pill} ${t.pillOk}`}>Scraping</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
