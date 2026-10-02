"use client";

/* Three states, not two: light, dark, and "follow the system" — which is what
 * a viewer who has never touched this control is actually in, and the only one
 * of the three that keeps tracking the OS when it switches at sunset.
 *
 * The stored value is the CHOICE, not the resolved theme. Storing "dark"
 * because the OS was dark at the time would silently pin someone to dark
 * forever the first time they loaded the page at night.
 *
 * The attribute is written to <html> by the inline script in app/layout.tsx
 * before first paint; this component only keeps it in step afterwards.
 */

import { useEffect, useState } from "react";
import s from "./theme.module.css";
import { Icon, type IconName } from "./Icon";

export type ThemeChoice = "light" | "dark" | "system";

const KEY = "rof.v1.theme";

const OPTIONS: { value: ThemeChoice; label: string; icon: IconName }[] = [
  { value: "light", label: "Light", icon: "sun" },
  { value: "dark", label: "Dark", icon: "moon" },
  { value: "system", label: "System", icon: "monitor" },
];

export function applyTheme(choice: ThemeChoice) {
  const root = document.documentElement;
  if (choice === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", choice);
}

export function ThemeToggle({ compact }: { compact?: boolean }) {
  const [choice, setChoice] = useState<ThemeChoice>("system");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(KEY);
    } catch {
      /* Private window or blocked storage: the control still works for this
       * page view, it simply will not be remembered. */
    }
    if (stored === "light" || stored === "dark" || stored === "system") setChoice(stored);
    setReady(true);
  }, []);

  const pick = (next: ThemeChoice) => {
    setChoice(next);
    applyTheme(next);
    try {
      window.localStorage.setItem(KEY, next);
    } catch {
      /* As above — the theme is applied either way. */
    }
  };

  return (
    <div className={[s.group, compact ? s.compact : null].filter(Boolean).join(" ")} role="group" aria-label="Colour theme">
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          className={[s.opt, ready && choice === o.value ? s.optActive : null].filter(Boolean).join(" ")}
          aria-pressed={ready && choice === o.value}
          title={`${o.label} theme`}
          onClick={() => pick(o.value)}
        >
          <Icon name={o.icon} size={16} />
          <span className="sr-only">{o.label} theme</span>
        </button>
      ))}
    </div>
  );
}
