"use client";

/* Which view a list-and-board screen was last left in.
 *
 * Per BROWSER rather than per account, and deliberately: this is a preference
 * of whoever is sitting at the machine, like the theme, not a record about a
 * student. It is also the kind of thing that must never block a render, so it
 * starts from a default and adopts the stored value on mount — reading
 * localStorage during render makes the server HTML and the first client render
 * disagree, and React resolves that by throwing the tree away.
 */

import { useCallback, useEffect, useState } from "react";

export type ListView = "list" | "board";

const KEY = "rof.v1.view.applications";

export function usePersistedView(fallback: ListView = "list") {
  const [view, setView] = useState<ListView>(fallback);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(KEY);
      if (raw === "list" || raw === "board") setView(raw);
    } catch {
      /* Storage blocked. The default is correct and nothing is persisted,
         which is the right outcome rather than an error. */
    }
  }, []);

  const commit = useCallback((next: ListView) => {
    setView(next);
    try {
      window.localStorage.setItem(KEY, next);
    } catch {
      /* fall through */
    }
  }, []);

  return [view, commit] as const;
}
