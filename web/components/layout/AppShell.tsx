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
import s from "./layout.module.css";
import { Sidebar } from "./Sidebar";
import { MobileNav } from "./MobileNav";
import { Header, MobileHeader } from "./Header";
import { CompareTray } from "../comparison/CompareTray";
import { ToastProvider } from "../feedback/Toast";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <div className={s.shell}>
        <Sidebar />
        <div className={s.main}>
          <Header />
          <MobileHeader />
          <main className={s.page} id="main">
            {children}
          </main>
        </div>
        <CompareTray />
        <MobileNav />
      </div>
    </ToastProvider>
  );
}

/* §93: eyebrow / title / explanation / primary action, in that order, on
 * every major page. */
export function PageHead({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className={s.pageHead}>
      <div className={s.pageHeadText}>
        <span className="eyebrow">{eyebrow}</span>
        <h1 className="t-page-title">{title}</h1>
        {description ? <p className="t-body c-secondary">{description}</p> : null}
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
