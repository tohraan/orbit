"use client";

/* Who is using the portal.
 *
 * WHAT IS NOT HERE, DELIBERATELY: which opportunities a given student saved.
 * db/017 keeps interest as totals with no student ids precisely so that question
 * has no answer, and the consent banner tells students the count is "a number
 * only, never who". Per-listing totals are on the Listings screen. The two are
 * never joined, and joining them later would make a promise already made to
 * students untrue.
 */

import { useEffect, useMemo, useState } from "react";
import t from "@/components/table.module.css";
import { Banner, Input, Pill } from "@rof/ui";
import { desk } from "@/lib/desk";

type Student = {
  name: string | null; id: string | null; email: string | null;
  degree: string | null; branch: string | null; year: number | null; level: string | null;
  onboarded: boolean; joinedAt: string | null; staff: boolean;
};

export default function StudentsPage() {
  const [data, setData] = useState<{ students: Student[]; total: number; onboarded: number; withLevel: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    void (async () => {
      const r = await desk<typeof data>("students");
      if (!r.ok) { setError(r.error.message); return; }
      setData(r.data);
    })();
  }, []);

  const shown = useMemo(() => {
    const n = q.trim().toLowerCase();
    const list = data?.students ?? [];
    if (!n) return list;
    return list.filter((s) => `${s.name ?? ""} ${s.id ?? ""} ${s.branch ?? ""} ${s.degree ?? ""}`.toLowerCase().includes(n));
  }, [data, q]);

  const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

  return (
    <>
      <header className={t.head}>
        <span className="eyebrow">People</span>
        <h1 className="t-page-title">Students</h1>
        <p className="t-body-sm c-secondary">
          Everyone who has registered on the portal, and how far through setup they got.
        </p>
      </header>

      {error ? <Banner tone="error">{error}</Banner> : null}

      <div className={t.stats}>
        <div className={t.stat}>
          <span className={t.statVal}>{data?.total ?? "—"}</span>
          <span className={t.statKey}>Registered</span>
        </div>
        <div className={t.stat}>
          <span className={t.statVal}>{data?.onboarded ?? "—"}</span>
          <span className={t.statKey}>Finished onboarding</span>
          {data ? <span className={t.statNote}>{pct(data.onboarded, data.total)}% of those registered</span> : null}
        </div>
        <div className={t.stat}>
          <span className={t.statVal}>{data?.withLevel ?? "—"}</span>
          <span className={t.statKey}>Enough to be matched</span>
          {data ? <span className={t.statNote}>Degree level set — the matcher’s biggest factor</span> : null}
        </div>
      </div>

      <div className={t.toolbar}>
        <Input className={t.search} value={q} onChange={(e) => setQ(e.target.value)}
               placeholder="Search by name, ID or branch" />
      </div>

      <div className={t.wrap}>
        <div className={t.scroll}>
          <table className={t.table}>
            <thead>
              <tr><th>Name</th><th>ID</th><th>Programme</th><th>Level</th><th>Setup</th><th>Joined</th></tr>
            </thead>
            <tbody>
              {!data ? (
                <tr><td colSpan={6} className={t.empty}>Loading…</td></tr>
              ) : shown.length === 0 ? (
                <tr><td colSpan={6} className={t.empty}>
                  {data.total === 0 ? "Nobody has registered yet." : "Nothing matches that."}
                </td></tr>
              ) : shown.map((s) => (
                <tr key={s.email ?? s.id ?? Math.random()}>
                  <td>
                    <div className={t.title}>{s.name ?? <span className={t.dim}>Not given</span>}</div>
                    {s.staff ? <div className={t.sub}>Desk access</div> : null}
                  </td>
                  <td><code>{s.id ?? "—"}</code></td>
                  <td>{[s.degree, s.branch].filter(Boolean).join(" · ") || <span className={t.dim}>—</span>}</td>
                  <td>{s.level ?? <span className={t.dim}>Not set</span>}</td>
                  <td>
                    {s.onboarded
                      ? <Pill tone="success">Done</Pill>
                      : <Pill tone="neutral">Not finished</Pill>}
                  </td>
                  <td className={t.dim}>{s.joinedAt ? s.joinedAt.slice(0, 10) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className={t.note}>
        This list does not show what any student saved or applied to. Those totals are counted without
        student identities attached, which is what the portal promises them.
      </p>
    </>
  );
}
