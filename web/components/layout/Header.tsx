"use client";

/* §17: the header stays light. Three things only — the command palette
 * trigger, in-site notifications, and the account menu.
 *
 * The old inline search field is gone: ⌘K does that job better and across the
 * whole product, and two search inputs on one screen (the header's and
 * Explore's) was a duplicate affordance (§81, §114). */

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import s from "./layout.module.css";
import { Icon } from "../ui/Icon";
import { CommandTrigger } from "../command/CommandPalette";
import { CurrencySwitch } from "../ui/CurrencySwitch";
import { ThemeToggle } from "../ui/ThemeToggle";
import { TITLES } from "./nav";
import { APP_NAME } from "./brand";
import { useItemsByIds } from "@/lib/useApi";
import { daysUntil } from "@rof/core";
import type { OpportunitySummary } from "@rof/core";
import { useProfile, useSaved, useTracker } from "@/lib/store";

/* In-site notifications, derived rather than stored: anything saved or tracked
 * that is closing soon, plus a nudge when the profile is empty. Nothing is
 * pushed and nothing is emailed — those need a backend and a provider, and
 * inventing a bell that lights up for nothing would be worse than no bell. */
function useNotifications() {
  const { saved } = useSaved();
  const { entries } = useTracker();
  const { profile, started, ready } = useProfile();
  const ids = useMemo(() => [...new Set([...saved, ...entries.map((e) => e.id)])], [saved, entries]);
  const { items } = useItemsByIds<OpportunitySummary>(ids);

  return useMemo(() => {
    const out: { id: string; tone: "urgent" | "soon" | "info"; title: string; sub: string; href: string }[] = [];
    for (const item of items) {
      const d = daysUntil(item.deadline);
      if (d == null || d < 0 || d > 14) continue;
      out.push({
        id: `d-${item.id}`,
        tone: d <= 3 ? "urgent" : "soon",
        title: item.title,
        sub: d === 0 ? "Closes today" : `Closes in ${d} day${d === 1 ? "" : "s"}`,
        href: `/opportunity/${item.id}`,
      });
    }
    out.sort((a, b) => (a.tone === "urgent" ? -1 : 1) - (b.tone === "urgent" ? -1 : 1));
    if (ready && !started) {
      out.push({
        id: "profile",
        tone: "info",
        title: "Finish setting up your profile",
        sub: "So we can rank opportunities for you",
        href: "/welcome",
      });
    }
    void profile;
    return out;
  }, [items, ready, started, profile]);
}

function useAway(onAway: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const away = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onAway();
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onAway();
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [onAway]);
  return ref;
}

function Notifications() {
  const [open, setOpen] = useState(false);
  const notes = useNotifications();
  const ref = useAway(() => setOpen(false));

  return (
    <div className={s.menuWrap} ref={ref}>
      <button
        type="button"
        className={s.iconBtn}
        aria-label={`Notifications${notes.length ? `, ${notes.length} waiting` : ""}`}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <Icon name="bell" size={17} />
        {notes.length ? <span className={s.badge}>{notes.length > 9 ? "9+" : notes.length}</span> : null}
      </button>

      {open ? (
        <div className={s.menu} role="dialog" aria-label="Notifications">
          <div className={s.menuHead}>
            <span className={s.menuTitle}>Notifications</span>
            <span className="t-micro c-muted">{notes.length} waiting</span>
          </div>
          {notes.length === 0 ? (
            <p className={s.menuEmpty}>
              Nothing needs you right now. Save an opportunity and its deadline will show up here.
            </p>
          ) : (
            notes.map((n) => (
              <Link key={n.id} href={n.href} className={s.note} onClick={() => setOpen(false)}>
                <span
                  className={[
                    s.noteDot,
                    n.tone === "urgent" ? s.noteUrgent : n.tone === "soon" ? s.noteSoon : s.noteInfo,
                  ].join(" ")}
                />
                <span className={s.noteBody}>
                  <span className={`${s.noteTitle} clamp-2`}>{n.title}</span>
                  <span className={s.noteSub}>{n.sub}</span>
                </span>
              </Link>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}

function AccountMenu() {
  const [open, setOpen] = useState(false);
  const ref = useAway(() => setOpen(false));
  const router = useRouter();
  const { profile, started } = useProfile();

  const initials =
    profile.name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase())
      .join("") || "·";

  /* "Sign out" with no accounts would be a lie, so the destructive action is
   * named for what it actually does: clears this student's data from this
   * browser. It asks first, because it cannot be undone. */
  function clearDevice() {
    const ok = window.confirm(
      "This clears your profile, saved list and tracked applications from this browser. It cannot be undone. Continue?",
    );
    if (!ok) return;
    try {
      const uid = window.localStorage.getItem("rof.v1.uid");
      for (const k of Object.keys(window.localStorage)) {
        if (uid && k.startsWith(`rof.v1.u.${uid}.`)) window.localStorage.removeItem(k);
      }
    } catch {
      /* Storage blocked; nothing was stored to clear. */
    }
    setOpen(false);
    router.push("/");
    router.refresh();
  }

  return (
    <div className={s.menuWrap} ref={ref}>
      <button
        type="button"
        className={s.iconBtn}
        aria-label="Account"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {started ? <span style={{ fontSize: 12, fontWeight: 600 }}>{initials}</span> : <Icon name="user" size={17} />}
      </button>

      {open ? (
        <div className={[s.menu, s.menuNarrow].join(" ")} role="menu">
          <div className={s.menuHead}>
            <span className={s.menuTitle}>{profile.name.trim() || "Your account"}</span>
          </div>
          <Link href="/profile" className={s.menuItem} role="menuitem" onClick={() => setOpen(false)}>
            <Icon name="user" size={16} />
            Profile and preferences
          </Link>
          <Link href="/welcome" className={s.menuItem} role="menuitem" onClick={() => setOpen(false)}>
            <Icon name="sparkle" size={16} />
            Re-run setup
          </Link>
          <Link href="/admin" className={s.menuItem} role="menuitem" onClick={() => setOpen(false)}>
            <Icon name="shield" size={16} />
            College desk
          </Link>
          <div className={s.menuRule} />
          <button type="button" className={[s.menuItem, s.menuItemDanger].join(" ")} role="menuitem" onClick={clearDevice}>
            <Icon name="trash" size={16} />
            Clear my data
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function Header({ onOpenCommand }: { onOpenCommand: () => void }) {
  const pathname = usePathname();
  const here = pathname.startsWith("/opportunity/") ? "Opportunity" : TITLES[pathname] ?? APP_NAME;

  return (
    <header className={s.header}>
      <nav className={s.crumbs} aria-label="Breadcrumb">
        {pathname.startsWith("/opportunity/") ? (
          <>
            <Link href="/explore" className={s.crumb}>
              Explore
            </Link>
            <span className={s.crumb} aria-hidden="true">
              /
            </span>
          </>
        ) : null}
        <span className={`${s.crumb} ${s.crumbHere}`}>{here}</span>
      </nav>

      <span className={s.headerSpacer} />

      <div className={s.headerRight}>
        <CommandTrigger onOpen={onOpenCommand} />
        <CurrencySwitch />
        <ThemeToggle />
        <Notifications />
        <AccountMenu />
      </div>
    </header>
  );
}

export function MobileHeader({ onOpenCommand }: { onOpenCommand: () => void }) {
  const pathname = usePathname();
  const title = pathname.startsWith("/opportunity/") ? "Opportunity" : TITLES[pathname] ?? APP_NAME;
  return (
    <div className={s.mobileHeader}>
      <ThemeToggle compact />
      <span className={s.mobileTitle}>{title}</span>
      <div style={{ display: "flex", gap: "var(--s-2)" }}>
        <button type="button" className={s.iconBtn} aria-label="Search" onClick={onOpenCommand}>
          <Icon name="search" size={17} />
        </button>
        <Notifications />
      </div>
    </div>
  );
}
