"use client";

/* §18: reachable from every major screen, and the result list is a compact
 * command-style dropdown rather than a second page. §61 fixes the three states
 * it can be in — searching, no results, results found.
 *
 * It hits the same /api/opportunities the Explore grid uses, with pageSize=6
 * and sort=relevance, so a search here and a search there can never disagree. */

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import s from "./layout.module.css";
import u from "../ui/ui.module.css";
import { Icon } from "../ui/Icon";
import { deadlineState } from "@rof/core";
import type { OpportunitySummary } from "@rof/core";
import { api } from "@/lib/api-base";

type State = "idle" | "searching" | "done" | "error";

export function GlobalSearch({ placeholder = "Search opportunities..." }: { placeholder?: string }) {
  const router = useRouter();
  const listId = useId();
  const [term, setTerm] = useState("");
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<State>("idle");
  const [hits, setHits] = useState<OpportunitySummary[]>([]);
  const [cursor, setCursor] = useState(-1);
  const box = useRef<HTMLDivElement>(null);

  /* Debounced, and every in-flight request is aborted when the term changes.
   * Without the abort, a slow response for "sch" can land after the fast one
   * for "scholarship" and overwrite it. */
  useEffect(() => {
    const q = term.trim();
    if (q.length < 2) {
      setHits([]);
      setState("idle");
      return;
    }
    const ac = new AbortController();
    setState("searching");
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch(
          api(`/api/opportunities?q=${encodeURIComponent(q)}&sort=relevance&pageSize=6`),
          { signal: ac.signal },
        );
        if (!res.ok) throw new Error("search failed");
        const body = (await res.json()) as { items: OpportunitySummary[] };
        setHits(body.items);
        setState("done");
        setCursor(-1);
      } catch (err) {
        if ((err as Error).name !== "AbortError") setState("error");
      }
    }, 220);
    return () => {
      ac.abort();
      window.clearTimeout(timer);
    };
  }, [term]);

  useEffect(() => {
    const away = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, []);

  const go = (id: number) => {
    setOpen(false);
    setTerm("");
    router.push(`/opportunity/${id}`);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") return setOpen(false);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => Math.min(hits.length - 1, c + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => Math.max(-1, c - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (cursor >= 0 && hits[cursor]) go(hits[cursor].id);
      /* No highlighted row: hand the whole term to Explore, which can show
         every match with the filters beside it. */
      else if (term.trim()) {
        setOpen(false);
        router.push(`/explore?q=${encodeURIComponent(term.trim())}`);
      }
    }
  };

  return (
    <div className={s.search} ref={box}>
      <div className={u.field}>
        <Icon name="search" size={16} />
        <input
          className={u.fieldInput}
          value={term}
          placeholder={placeholder}
          onChange={(e) => {
            setTerm(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          role="combobox"
          aria-expanded={open && term.trim().length >= 2}
          aria-controls={listId}
          aria-label="Search opportunities"
          aria-autocomplete="list"
          maxLength={120}
        />
        {term ? (
          <button type="button" aria-label="Clear search" onClick={() => setTerm("")} style={{ color: "inherit" }}>
            <Icon name="close" size={16} />
          </button>
        ) : null}
      </div>

      {open && term.trim().length >= 2 ? (
        <div className={s.searchPanel} id={listId} role="listbox" aria-label="Search results">
          {state === "searching" ? (
            <p className={s.searchEmpty}>Searching&hellip;</p>
          ) : state === "error" ? (
            <p className={s.searchEmpty}>Search is unavailable right now.</p>
          ) : hits.length === 0 ? (
            <p className={s.searchEmpty}>No results for &ldquo;{term.trim()}&rdquo;.</p>
          ) : (
            <>
              {hits.map((o, i) => {
                const dl = deadlineState(o);
                return (
                  <button
                    key={o.id}
                    type="button"
                    role="option"
                    aria-selected={i === cursor}
                    className={[s.searchHit, i === cursor ? s.searchHitActive : null].filter(Boolean).join(" ")}
                    onMouseEnter={() => setCursor(i)}
                    onClick={() => go(o.id)}
                  >
                    <span className={`${s.searchHitTitle} clamp-1`}>{o.title}</span>
                    <span className={s.searchHitMeta}>
                      {o.sourceName} &middot; {dl.label}
                    </span>
                  </button>
                );
              })}
              <button
                type="button"
                className={s.searchHit}
                onClick={() => {
                  setOpen(false);
                  router.push(`/explore?q=${encodeURIComponent(term.trim())}`);
                }}
              >
                <span className={s.searchHitTitle}>See all matches in Explore &rarr;</span>
              </button>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
