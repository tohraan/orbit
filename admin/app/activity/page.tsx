"use client";

/* Who did what. A shared token could never answer this; per-person sign-in can,
 * and a panel several people use needs it. Entries are written by the API with
 * the service key — db/020 denies INSERT to every role a browser can hold, so a
 * staff member cannot author their own trail. */

import { useEffect, useState } from "react";
import t from "@/components/table.module.css";
import { Banner } from "@rof/ui";
import { desk } from "@/lib/desk";

type Entry = { id: number; actor_email: string | null; action: string; target: string | null; detail: Record<string, unknown>; at: string };

const VERB: Record<string, string> = {
  publish: "published", update: "corrected", suppress: "removed", restore: "restored",
  feature: "pinned", unfeature: "unpinned", scrape: "read a page",
};

export default function ActivityPage() {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const r = await desk<{ entries: Entry[] }>("audit");
      if (!r.ok) { setError(r.error.message); setEntries([]); return; }
      setEntries(r.data.entries);
    })();
  }, []);

  return (
    <>
      <header className={t.head}>
        <span className="eyebrow">Record</span>
        <h1 className="t-page-title">Activity</h1>
        <p className="t-body-sm c-secondary">The last 200 actions taken at the desk, newest first.</p>
      </header>

      {error ? <Banner tone="error">{error}</Banner> : null}

      <div className={t.wrap}>
        <div className={t.scroll}>
          <table className={t.table}>
            <thead><tr><th>When</th><th>Who</th><th>What</th><th>Which</th></tr></thead>
            <tbody>
              {entries === null ? (
                <tr><td colSpan={4} className={t.empty}>Loading…</td></tr>
              ) : entries.length === 0 ? (
                <tr><td colSpan={4} className={t.empty}>Nothing has happened at the desk yet.</td></tr>
              ) : entries.map((e) => (
                <tr key={e.id}>
                  <td className={t.dim}>{e.at.slice(0, 16).replace("T", " ")}</td>
                  <td>{e.actor_email ?? <span className={t.dim}>Account removed</span>}</td>
                  <td>{VERB[e.action] ?? e.action}</td>
                  <td className={t.dim}>
                    {(e.detail?.title as string) ?? e.target ?? "—"}
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
