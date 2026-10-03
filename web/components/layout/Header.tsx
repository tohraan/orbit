"use client";

/* §17: the header stays light. Three things only — the command palette
 * trigger, in-site notifications, and the account menu.
 *
 * The old inline search field is gone: ⌘K does that job better and across the
 * whole product, and two search inputs on one screen (the header's and
 * Explore's) was a duplicate affordance (§81, §114). */

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import s from "./layout.module.css";
import { Icon } from "../ui/Icon";
import { CommandTrigger } from "../command/CommandPalette";
import { CurrencySwitch } from "../ui/CurrencySwitch";
import { ThemeToggle } from "../ui/ThemeToggle";
import { TITLES } from "./nav";
import { APP_NAME, APP_TAGLINE } from "./brand";
import { useItemsByIds } from "@/lib/useApi";
import { daysUntil } from "@rof/core";
import type { OpportunitySummary } from "@rof/core";
import { useProfile, useSaved, useTracker } from "@/lib/data";
import { useAuth } from "@/lib/auth";

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
        <Icon name="bell" size={16} />
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

/* The account menu is two states and never more than four rows.
 *
 * It used to be five rows that each sounded like the same thing — "Sign in or
 * create an account", "Profile and preferences", "Re-run setup", "College
 * desk", "Clear my data" — under a heading showing the student's name. A name
 * above a sign-in prompt is a contradiction, and "profile" vs "preferences" vs
 * "setup" were one destination described three ways.
 *
 * Now the top of the menu answers the only question the student actually has
 * — is my work safe anywhere but this browser — and one button changes it.
 * Setup is no longer a menu row: it is the primary CTA on /profile, which is
 * where the progress that gives it meaning lives. */
/* Sign in, in the open.
 *
 * Signing in used to live only inside the account menu, behind an avatar that
 * shows a generic person icon when nobody is signed in — so the one action a
 * first-time visitor most needs was the one thing they had to go looking for.
 * It is a button in the top right now, and it is simply absent once there is a
 * session: a signed-in student has no use for it, and leaving it there would
 * read as "you are not signed in" to someone who is.
 *
 * Rendered only when accounts are configured, and never while the session is
 * still resolving — a Sign in button that flashes for one frame in front of a
 * signed-in student is worse than a slightly later one. */
function SignInButton() {
  const { status, configured } = useAuth();
  const pathname = usePathname();

  if (!configured || status !== "signed-out") return null;
  /* Already on the way in; a second prompt is noise. */
  if (pathname.startsWith("/account") || pathname.startsWith("/welcome")) return null;

  const next = pathname && pathname !== "/" ? `?next=${encodeURIComponent(pathname)}` : "";
  return (
    <Link href={`/account${next}`} className={s.signIn}>
      Sign in
    </Link>
  );
}

function AccountMenu() {
  const [open, setOpen] = useState(false);
  const ref = useAway(() => setOpen(false));
  const router = useRouter();
  const { profile, isStaff } = useProfile();
  const { status, user, signOut, configured } = useAuth();
  const signedIn = status === "signed-in";

  const name = profile.name.trim();
  const email = user?.email ?? "";
  const initials =
    (name || email)
      .trim()
      .split(/[\s@.]+/)
      .slice(0, 2)
      .map((part: string) => part[0]?.toUpperCase())
      .join("") || "·";

  /* Signed out, there is no session to end — only this browser's copy of the
   * data — so the honest destructive action is to clear it, and it asks. */
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
        className={s.avatarBtn}
        aria-label="Account"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {signedIn || name ? initials : <Icon name="user" size={18} />}
      </button>

      {open ? (
        <div className={[s.menu, s.menuNarrow].join(" ")} role="menu">
          {/* Who, and — the part that was missing — where the data lives. */}
          <div className={s.ident}>
            <span className={s.identAvatar} aria-hidden="true">
              {initials}
            </span>
            <span className={s.identText}>
              <span className={s.identName}>{name || email || "Not signed in"}</span>
              <span className={s.identWhere}>
                <span className={[s.identDot, signedIn ? s.identSynced : s.identLocal].join(" ")} />
                {signedIn ? "Synced to your account" : "Saved on this device"}
              </span>
            </span>
          </div>

          {configured && !signedIn ? (
            <Link href="/account" className={s.identCta} role="menuitem" onClick={() => setOpen(false)}>
              Sign in
            </Link>
          ) : null}

          <Link href="/profile" className={s.menuItem} role="menuitem" onClick={() => setOpen(false)}>
            <Icon name="user" size={16} />
            Your profile
          </Link>
          {isStaff || !configured ? (
            <Link href="/admin" className={s.menuItem} role="menuitem" onClick={() => setOpen(false)}>
              <Icon name="shield" size={16} />
              College desk
            </Link>
          ) : null}

          <div className={s.menuRule} />

          {signedIn ? (
            <button
              type="button"
              className={s.menuItem}
              role="menuitem"
              onClick={async () => {
                await signOut();
                setOpen(false);
                router.push("/");
              }}
            >
              <Icon name="close" size={16} />
              Sign out
            </button>
          ) : (
            <button type="button" className={[s.menuItem, s.menuItemDanger].join(" ")} role="menuitem" onClick={clearDevice}>
              <Icon name="trash" size={16} />
              Clear this device
            </button>
          )}
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
      {/* Full-bleed bar, page-aligned content (Step 5). */}
      <div className={s.headerInner}>
      {/* The emblem sits top-left now that the rail is icon-only. */}
      <Link href="/" className={s.brand}>
        <Image className={s.mark} src="/bits-logo-128.png" alt="" width={30} height={30} priority />
        <span className={s.brandText}>
          <span className={s.brandName}>{APP_NAME}</span>
          <span className={s.brandSub}>{APP_TAGLINE}</span>
        </span>
      </Link>

      <span className={s.headerDivider} aria-hidden="true" />

      <nav className={s.crumbs} aria-label="Breadcrumb">
        {pathname.startsWith("/opportunity/") ? (
          <>
            <Link href="/explore" className={s.crumb}>
              Explore
            </Link>
            <span className={s.crumbSep} aria-hidden="true">
              <Icon name="chevron-right" size={14} />
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
        <SignInButton />
        <AccountMenu />
      </div>
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
      <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center" }}>
        <button type="button" className={s.iconBtn} aria-label="Search" onClick={onOpenCommand}>
          <Icon name="search" size={16} />
        </button>
        <Notifications />
        {/* The mobile header carried no account control at all, so a signed-out
            visitor on a phone had no way in short of finding Profile in the
            bottom bar. */}
        <SignInButton />
      </div>
    </div>
  );
}
