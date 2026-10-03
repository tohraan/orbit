"use client";

/* Two buttons: Light and Dark. That is the whole control.
 *
 * It used to be three, the third being "System" — which is defensible in a
 * settings page and wrong in a header. "System" is not a third appearance; it
 * is the absence of a choice, so the segmented control showed one of its three
 * segments lit while the page could be in either of the other two, and the
 * student had to know what their OS was set to in order to read it. Two
 * segments name the two things the page can actually look like, and the lit one
 * is always the one they are looking at.
 *
 * Following the OS is still the default, and still tracks it at sunset: that is
 * what happens when nothing is stored, which is every first visit. Pressing a
 * button is the student overriding it on purpose, and from then on it is
 * remembered. There is no way back to "follow the system" from here — clearing
 * site data is the honest one, and nobody needs a button for a state they are
 * already in until they leave it.
 *
 * The stored value is still the CHOICE, so storing "dark" because the OS was
 * dark cannot happen: nothing is stored until a button is pressed.
 *
 * The attribute is written to <html> by the inline script in app/layout.tsx
 * before first paint; this component only keeps it in step afterwards.
 */

import { useEffect, useState } from "react";
import s from "./theme.module.css";
import { Icon, type IconName } from "./Icon";

/* "system" is still a value the TYPE admits, because it is what older visitors
 * have in localStorage and reading it has to keep working. It is no longer
 * something this control can be set to. */
export type ThemeChoice = "light" | "dark" | "system";

const KEY = "rof.v1.theme";

const OPTIONS: { value: "light" | "dark"; label: string; icon: IconName }[] = [
  { value: "light", label: "Light", icon: "sun" },
  { value: "dark", label: "Dark", icon: "moon" },
];

export function applyTheme(choice: ThemeChoice) {
  const root = document.documentElement;
  if (choice === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", choice);
}

/* What the page currently looks like, which is not the same as what is stored.
 * With nothing stored, it is whatever the OS says — so the control lights the
 * segment matching what is on screen rather than lighting nothing. */
function resolved(): "light" | "dark" {
  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  } catch {
    return "light";
  }
}

export function ThemeToggle({ compact }: { compact?: boolean }) {
  const [choice, setChoice] = useState<"light" | "dark">("light");
  /* Whether the student has made a choice, as opposed to following the OS.
   * Tracked so that an unpressed control still follows the OS when it changes
   * at sunset, and a pressed one stops. */
  const [pinned, setPinned] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(KEY);
    } catch {
      /* Private window or blocked storage: the control still works for this
       * page view, it simply will not be remembered. */
    }
    if (stored === "light" || stored === "dark") {
      setChoice(stored);
      setPinned(true);
    } else {
      /* Nothing stored, or the old "system" value — which is the same state,
       * and the one the rest of this component already handles. It is left in
       * storage rather than rewritten: migrating it to a concrete theme would
       * pin whoever loaded the page at night to dark forever. */
      setChoice(resolved());
    }
    setReady(true);
  }, []);

  /* Keep up with the OS for as long as nobody has overridden it. */
  useEffect(() => {
    if (pinned) return;
    let mq: MediaQueryList;
    try {
      mq = window.matchMedia("(prefers-color-scheme: dark)");
    } catch {
      return;
    }
    const onChange = (e: MediaQueryListEvent) => setChoice(e.matches ? "dark" : "light");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [pinned]);

  const pick = (next: "light" | "dark") => {
    setChoice(next);
    setPinned(true);
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
