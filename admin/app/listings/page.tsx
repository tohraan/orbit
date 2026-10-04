"use client";

/* Everything on the portal, scraped and staff-written alike, with the two
 * powers staff asked for: remove, and correct.
 *
 * Both go to /api/desk/override, which writes an override row rather than
 * touching raw_items — the scraper re-upserts raw_items on every run, so an
 * edit written there would be gone by the next scrape with nothing to show for
 * it. A removal is "suppressed", not a DELETE, for the same reason: the scraper
 * would simply find a deleted listing again and put it back.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import t from "@/components/table.module.css";
import { Banner, Button, Input, Pill } from "@rof/ui";
import { desk } from "@/lib/desk";

type Row = {
  id: number; title?: string; sourceName?: string; host?: string; deadline?: string | null;
  manual: boolean; suppressed: boolean; featured: boolean; edited: boolean;
  note: string | null; saved: number; tracked: number;
};

export default function ListingsPage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [hidden, setHidden] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "manual" | "hidden" | "featured" | "saved">("all");
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    const r = await desk<{ items: Row[]; hidden: Row[] }>("listings");
    if (!r.ok) { setError(r.error.message); setRows([]); return; }
    setError(null);
    setRows(r.data.items);
    setHidden(r.data.hidden ?? []);
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function change(id: number, body: Record<string, unknown>) {
    setBusyId(id);
    const r = await desk("override", { method: "PATCH", body: JSON.stringify({ id, ...body }) });
    setBusyId(null);
    if (!r.ok) { setError(r.error.message); return; }
    await load();
  }

  const all = useMemo(() => [...(rows ?? []), ...hidden], [rows, hidden]);
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return all.filter((r) => {
      if (filter === "manual" && !r.manual) return false;
      if (filter === "hidden" && !r.suppressed) return false;
      if (filter === "featured" && !r.featured) return false;
      if (filter === "saved" && !r.saved) return false;
      if (!needle) return true;
      return `${r.title ?? ""} ${r.sourceName ?? ""} ${r.host ?? ""}`.toLowerCase().includes(needle);
    });
  }, [all, q, filter, hidden]);

  return (
    <>
      <header className={t.head}>
        <span className="eyebrow">Manage</span>
        <h1 className="t-page-title">Listings</h1>
        <p className="t-body-sm c-secondary">
          Everything students can see, from the automatic feed and from the desk. Hiding a listing removes it
          from the portal; the scraper keeps its own copy, so a listing you hide stays hidden even when it is
          found again.
        </p>
      </header>

      {error ? <Banner tone="error">{error}</Banner> : null}

      <div className={t.toolbar}>
        <Input className={t.search} value={q} onChange={(e) => setQ(e.target.value)}
               placeholder="Search by title, source or host" />
        {([["all", "All"], ["manual", "Ours"], ["featured", "Pinned"], ["hidden", "Hidden"], ["saved", "Saved by students"]] as const)
          .map(([k, label]) => (
            <Button key={k} size="sm" tone={filter === k ? "primary" : "secondary"}
                    onClick={() => setFilter(k)}>{label}</Button>
          ))}
      </div>

      <div className={t.wrap}>
        <div className={t.scroll}>
          <table className={t.table}>
            <thead>
              <tr>
                <th>Listing</th><th>State</th>
                <th className={t.num}>Saved</th><th className={t.num}>Tracking</th>
                <th>Deadline</th><th />
              </tr>
            </thead>
            <tbody>
              {rows === null ? (
                <tr><td colSpan={6} className={t.empty}>Loading…</td></tr>
              ) : shown.length === 0 ? (
                <tr><td colSpan={6} className={t.empty}>Nothing matches that.</td></tr>
              ) : shown.map((r) => (
                <tr key={r.id} className={r.suppressed ? t.rowSuppressed : undefined}>
                  <td>
                    <div className={t.title}>{r.title ?? `Listing #${r.id}`}</div>
                    <div className={t.sub}>{r.sourceName ?? r.host ?? "—"}{r.note ? ` · ${r.note}` : ""}</div>
                  </td>
                  <td>
                    <div className={t.rowActions} style={{ justifyContent: "flex-start" }}>
                      {r.manual ? <Pill tone="accent">Ours</Pill> : null}
                      {r.featured ? <Pill tone="warning">Pinned</Pill> : null}
                      {r.edited ? <Pill tone="neutral">Edited</Pill> : null}
                      {r.suppressed ? <Pill tone="error">Hidden</Pill> : null}
                      {!r.manual && !r.featured && !r.edited && !r.suppressed
                        ? <span className={t.dim}>Live</span> : null}
                    </div>
                  </td>
                  <td className={t.num}>{r.saved || <span className={t.dim}>0</span>}</td>
                  <td className={t.num}>{r.tracked || <span className={t.dim}>0</span>}</td>
                  <td className={t.dim}>{r.deadline ?? "—"}</td>
                  <td>
                    <div className={t.rowActions}>
                      <Button size="sm" tone="ghost" disabled={busyId === r.id}
                              onClick={() => void change(r.id, { featured: !r.featured })}>
                        {r.featured ? "Unpin" : "Pin"}
                      </Button>
                      <Button size="sm" tone={r.suppressed ? "ghost" : "danger"}
                              disabled={busyId === r.id}
                              onClick={() => void change(r.id, { suppressed: !r.suppressed })}>
                        {r.suppressed ? "Restore" : "Remove"}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className={t.note}>
        “Saved” and “Tracking” are totals. Which students they are is not recorded anywhere — the portal
        promises students the count is a number only.
      </p>
    </>
  );
}
