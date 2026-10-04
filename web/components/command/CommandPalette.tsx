"use client";

/* ⌘K / Ctrl-K — one way into every page and every action.
 *
 * Opens with a prefilled list of destinations and quick actions, so it is
 * useful before a single key is typed. Typing narrows it with a forgiving
 * matcher (fuzzy.ts), and a query that matches nothing offers the nearest
 * label rather than an empty box.
 *
 * Listings are searched too, through the same /api/opportunities the Explore
 * grid uses, debounced and abortable — so the palette and the page can never
 * disagree about what matches.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import s from "./command.module.css";
import { Icon, type IconName } from "../ui/Icon";
import { didYouMean, subsequenceScore } from "./fuzzy";
import { api } from "@/lib/api-base";
import { PHASES } from "@/lib/completeness";
import type { OpportunitySummary } from "@rof/core";
import { AGENT_NAME } from "../layout/brand";

type Entry = {
  id: string;
  title: string;
  sub?: string;
  icon: IconName;
  group: "Go to" | "Actions" | "Opportunities";
  /* Extra words that should match this entry but need not be shown — how
   * "scholarships" finds Explore and "dark mode" finds the theme action. */
  keywords?: string;
  run: () => void;
};

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [hits, setHits] = useState<OpportunitySummary[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const go = useCallback(
    (href: string) => {
      onClose();
      router.push(href);
    },
    [onClose, router],
  );

  const setTheme = useCallback((choice: "light" | "dark" | "system") => {
    const root = document.documentElement;
    if (choice === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", choice);
    try {
      window.localStorage.setItem("rof.v1.theme", choice);
    } catch {
      /* Theme still applied for this page view. */
    }
    onClose();
  }, [onClose]);

  const base = useMemo<Entry[]>(
    () => [
      { id: "home", title: "Home", sub: "Your dashboard", icon: "home", group: "Go to", keywords: "dashboard overview start", run: () => go("/") },
      { id: "explore", title: "Explore", sub: "Browse every opportunity", icon: "explore", group: "Go to", keywords: "search browse find scholarships fellowships internships grants", run: () => go("/explore") },
      { id: "rover", title: AGENT_NAME, sub: "Ask for what you want in your own words", icon: "rover", group: "Go to", keywords: "chat agent ask assistant advisor recommend help rover", run: () => go("/rover") },
      { id: "deadlines", title: "Deadlines", sub: "Timeline and closing dates", icon: "calendar", group: "Go to", keywords: "timeline closing dates calendar urgent", run: () => go("/deadlines") },
      { id: "saved", title: "Saved", sub: "Opportunities you kept", icon: "bookmark", group: "Go to", keywords: "bookmarks favourites shortlist", run: () => go("/saved") },
      { id: "apps", title: "Applications", sub: "What you are tracking", icon: "applications", group: "Go to", keywords: "tracker status applied progress", run: () => go("/applications") },
      { id: "compare", title: "Compare", sub: "Two opportunities side by side", icon: "compare", group: "Go to", keywords: "versus side by side difference", run: () => go("/compare") },
      { id: "profile", title: "Profile", sub: "Your details and preferences", icon: "user", group: "Go to", keywords: "account settings preferences me", run: () => go("/profile") },
      { id: "account", title: "Account", sub: "Sign in, sign up, or sign out", icon: "user", group: "Go to", keywords: "login signin signup register logout session", run: () => go("/account") },

      /* The count comes from PHASES rather than a number typed here, which is
         how this line came to say "three" while the flow had four steps. */
      { id: "onboard", title: "Set up your profile", sub: `${PHASES.length} short steps`, icon: "sparkle", group: "Actions", keywords: "onboarding welcome setup start", run: () => go("/welcome") },
      { id: "soon", title: "Closing in the next 7 days", icon: "clock", group: "Actions", keywords: "urgent soon week deadline", run: () => go("/explore?deadline=d7&sort=deadline") },
      { id: "funded", title: "Fully funded only", icon: "coins", group: "Actions", keywords: "money funding free scholarship", run: () => go("/explore?funding=fully_funded") },
      { id: "college", title: "Added by the college", icon: "shield", group: "Actions", keywords: "bits staff official internal", run: () => go("/explore?source=college_desk") },
      { id: "dark", title: "Switch to dark theme", icon: "moon", group: "Actions", keywords: "night theme appearance", run: () => setTheme("dark") },
      { id: "light", title: "Switch to light theme", icon: "sun", group: "Actions", keywords: "day theme appearance", run: () => setTheme("light") },
      { id: "system", title: "Match the system theme", icon: "monitor", group: "Actions", keywords: "auto theme appearance", run: () => setTheme("system") },
    ],
    [go, setTheme],
  );

  /* Reset on every open: a palette that reopens holding the last query is a
   * palette you have to clear before you can use it. */
  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
      setHits([]);
      /* rAF, not a timeout: focus after the element is actually in the DOM. */
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  /* Listing search, debounced and abortable so a slow response for a short
   * query cannot land after a fast one for a longer query. */
  useEffect(() => {
    const q = query.trim();
    if (!open || q.length < 2) {
      setHits([]);
      return;
    }
    const ac = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch(api(`/api/opportunities?q=${encodeURIComponent(q)}&sort=relevance&pageSize=5`), { signal: ac.signal });
        if (!res.ok) return;
        const body = (await res.json()) as { items: OpportunitySummary[] };
        setHits(body.items);
      } catch {
        /* Aborted or offline: the page and action results still stand. */
      }
    }, 180);
    return () => {
      ac.abort();
      window.clearTimeout(timer);
    };
  }, [query, open]);

  const entries = useMemo<Entry[]>(() => {
    const listingEntries: Entry[] = hits.map((h) => ({
      id: `o-${h.id}`,
      title: h.title,
      sub: `${h.sourceName}${h.deadline ? ` · closes ${h.deadline}` : ""}`,
      icon: "file",
      group: "Opportunities",
      run: () => go(`/opportunity/${h.id}`),
    }));

    const q = query.trim();
    if (!q) return [...base, ...listingEntries];

    const scored = base
      .map((e) => {
        const direct = subsequenceScore(q, e.title);
        const viaKeyword = e.keywords ? subsequenceScore(q, e.keywords) : null;
        const viaSub = e.sub ? subsequenceScore(q, e.sub) : null;
        /* A title hit outranks a keyword hit for the same query. */
        const best = Math.max(direct ?? -1e9, (viaKeyword ?? -1e9) - 200, (viaSub ?? -1e9) - 300);
        return best > -1e8 ? { e, score: best } : null;
      })
      .filter((x): x is { e: Entry; score: number } => !!x)
      .sort((a, b) => b.score - a.score)
      .map((x) => x.e);

    return [...scored, ...listingEntries];
  }, [base, hits, query, go]);

  const suggestion = useMemo(() => {
    if (!query.trim() || entries.length) return null;
    return didYouMean(query, base.map((e) => e.title));
  }, [query, entries.length, base]);

  useEffect(() => setActive(0), [query]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); onClose(); }
      else if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(entries.length - 1, i + 1)); }
      else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
      else if (e.key === "Enter") { e.preventDefault(); entries[active]?.run(); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, entries, active, onClose]);

  if (!open) return null;

  let lastGroup = "";

  return (
    <div className={s.scrim} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={s.panel} role="dialog" aria-modal="true" aria-label="Command palette">
        <div className={s.inputRow}>
          <Icon name="search" size={20} />
          <input
            ref={inputRef}
            className={s.input}
            value={query}
            placeholder="Search pages, actions and opportunities…"
            aria-label="Search pages, actions and opportunities"
            onChange={(e) => setQuery(e.target.value)}
          />
          <span className={s.esc}>esc</span>
        </div>

        <div className={s.results}>
          {entries.length === 0 ? (
            <div className={s.empty}>
              <p className={s.emptyTitle}>Nothing matches “{query.trim()}”</p>
              <p className={s.emptyBody}>Try a page name, or a word from an opportunity title.</p>
              {suggestion ? (
                <p className={s.didYouMean}>
                  Did you mean{" "}
                  <button type="button" className={s.didYouMeanBtn} onClick={() => setQuery(suggestion)}>
                    {suggestion}
                  </button>
                  ?
                </p>
              ) : null}
            </div>
          ) : (
            entries.map((e, i) => {
              const head = e.group !== lastGroup ? e.group : null;
              lastGroup = e.group;
              return (
                <div key={e.id}>
                  {head ? (
                    <div className={s.group}>
                      <span className={s.groupLabel}>{head}</span>
                    </div>
                  ) : null}
                  <button
                    type="button"
                    className={[s.item, i === active ? s.itemActive : null].filter(Boolean).join(" ")}
                    onMouseEnter={() => setActive(i)}
                    onClick={e.run}
                  >
                    <Icon name={e.icon} size={16} className={s.itemIcon} />
                    <span className={s.itemBody}>
                      <span className={s.itemTitle}>{e.title}</span>
                      {e.sub ? <span className={s.itemSub}>{e.sub}</span> : null}
                    </span>
                    {i === active ? <span className={s.itemKey}>↵</span> : null}
                  </button>
                </div>
              );
            })
          )}
        </div>

        <div className={s.foot}>
          <span><span className={s.kbd}>↑↓</span>navigate</span>
          <span><span className={s.kbd}>↵</span>open</span>
          <span><span className={s.kbd}>esc</span>close</span>
        </div>
      </div>
    </div>
  );
}

/** The global shortcut that opens the palette. */
export function useCommandPalette() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  return { open, setOpen };
}

/* The header's trigger button lived here. It is gone with the header's search
 * cluster: ⌘K (useCommandPalette, above) still opens this from any screen, and
 * a button that duplicated Explore's own search field is not worth permanent
 * space in the chrome. The palette itself is untouched. */
