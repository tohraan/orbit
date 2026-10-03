"use client";

/* The shell every route renders inside. §14 desktop structure, §19 mobile,
 * §67 one navigation at a time.
 *
 * Client-side because the sidebar and bottom bar both show counts that live in
 * the browser (lib/store.ts), and because the compare tray must be able to
 * appear over any screen. The page bodies underneath are free to be server
 * components; none of them currently needs to be, since every screen fetches
 * through /api and shows the skeletons while it does. */

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import s from "./layout.module.css";
import { Sidebar } from "./Sidebar";
import { MobileNav } from "./MobileNav";
import { Header, MobileHeader } from "./Header";
import { CompareTray } from "../comparison/CompareTray";
import { ToastProvider } from "../feedback/Toast";
import { CommandPalette, useCommandPalette } from "../command/CommandPalette";
import { AuthProvider } from "@/lib/auth";
import { GateProvider } from "@/lib/gate";
import { ConsentBanner, SessionNotice } from "../consent/Consent";
import { AuthWall } from "../auth/AuthWall";
import { OnboardingOverlay } from "../auth/Onboarding";

/* Routes that get the page and nothing else — no rail, no header, no trays.
 *
 * /account is the sign-in screen, and with the portal behind a gate it is the
 * first thing a new student sees. Rendering it inside the shell framed the one
 * thing they had to do with navigation to a portal they could not enter yet,
 * a theme switch, a notification bell with nothing in it, and an avatar with
 * no account behind it — every one of which is either a dead end or a way to
 * leave the only screen that was any use.
 *
 * It is a prefix list because /account is one route today and the shape is the
 * same for any other screen whose whole job is to get you a session. */
const BARE = ["/account"];

export function AppShell({ children }: { children: ReactNode }) {
  /* ⌘K / Ctrl-K lives at the shell, so the shortcut works on every screen and
   * there is exactly one palette instance regardless of which page is open. */
  const { open, setOpen } = useCommandPalette();
  const pathname = usePathname();

  /* AuthProvider and ToastProvider still wrap it: the screen reads the session
   * and announces "Signed in". Everything else is chrome it must not have. */
  if (BARE.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return (
      <AuthProvider>
        <ToastProvider>
          <main className={s.bare} id="main">
            {children}
          </main>
        </ToastProvider>
      </AuthProvider>
    );
  }

  return (
    <AuthProvider>
    {/* Inside AuthProvider — the gate reads the session — and outside
        everything else, so one dialog serves every gated action in the app. */}
    <GateProvider>
    <ToastProvider>
      <div className={s.shell}>
        <Sidebar />
        <div className={s.main}>
          <Header />
          <MobileHeader />
          <main className={s.page} id="main">
            <AuthWall>{children}</AuthWall>
          </main>
        </div>
        <CompareTray />
        <MobileNav />
        <CommandPalette open={open} onClose={() => setOpen(false)} />
        <SessionNotice />
        <ConsentBanner />
        <OnboardingOverlay />
      </div>
    </ToastProvider>
    </GateProvider>
    </AuthProvider>
  );
}

/* §93: eyebrow / title / explanation / primary action, in that order, on
 * every major page. */
/* `compact` is for screens whose content IS the point — Explore above all.
 * There, a 32px title over a two-line description pushed the first row of
 * cards most of a screen down, so the student scrolled past the header every
 * single visit to reach what they came for. Compact keeps the same elements
 * at section weight on one row, and lets the actions slot (the search field)
 * share that row instead of claiming another. */
export function PageHead({
  eyebrow,
  title,
  description,
  actions,
  compact,
}: {
  eyebrow: string;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={[s.pageHead, compact ? s.pageHeadCompact : null].filter(Boolean).join(" ")}>
      <div className={s.pageHeadText}>
        <span className="eyebrow">{eyebrow}</span>
        <h1 className={compact ? "t-section" : "t-page-title"}>{title}</h1>
        {description ? <p className={compact ? "t-meta c-secondary" : "t-page-desc"}>{description}</p> : null}
      </div>
      {actions ? <div className={s.pageHeadActions}>{actions}</div> : null}
    </div>
  );
}

export function Section({
  title,
  aside,
  children,
}: {
  title: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className={s.section}>
      <div className={s.sectionHead}>
        <h2 className="t-section">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}
