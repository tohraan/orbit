"use client";

/* The desk's frame, and its gate.
 *
 * THREE STATES, NOT TWO. Signed out, signed in but not staff, and staff. The
 * middle one is the one that is usually got wrong: a student who follows a link
 * here has a perfectly valid session, so treating "not staff" as "not signed
 * in" would show them a sign-in form they are already past, and they would try
 * their password again and again. It says what is actually true instead.
 *
 * This is presentation. Every route re-checks server-side against the database;
 * hiding a button has never stopped anyone from calling an endpoint.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import s from "./shell.module.css";
import { useSession } from "@/lib/session";
import { SignIn } from "./SignIn";

const NAV = [
  { href: "/", label: "Overview" },
  { href: "/listings", label: "Listings" },
  { href: "/add", label: "Add opportunity" },
  { href: "/students", label: "Students" },
  { href: "/activity", label: "Activity" },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const { status, isStaff, user, configured, signOut } = useSession();
  const pathname = usePathname();

  if (!configured) {
    return (
      <main className={s.centre}>
        <div className={s.notice}>
          <h1 className="t-section">The desk is not configured</h1>
          <p className="t-body-sm c-secondary">
            This deployment has no Supabase credentials, so there is nothing to sign in to.
          </p>
        </div>
      </main>
    );
  }

  if (status === "loading") {
    return (
      <main className={s.centre}>
        <span className={s.spinner} aria-hidden="true" />
        <p className="t-body-sm c-secondary" role="status">Checking your session…</p>
      </main>
    );
  }

  if (status === "out") return <SignIn />;

  /* Signed in; waiting on the server's verdict. Deliberately not optimistic:
   * flashing the desk and then removing it would be worse than a short wait. */
  if (isStaff === null) {
    return (
      <main className={s.centre}>
        <span className={s.spinner} aria-hidden="true" />
        <p className="t-body-sm c-secondary" role="status">Checking your access…</p>
      </main>
    );
  }

  if (isStaff === false) {
    return (
      <main className={s.centre}>
        <div className={s.notice}>
          <h1 className="t-section">This area is for department staff</h1>
          <p className="t-body-sm c-secondary">
            You are signed in as {user?.email}. That account does not have desk access. If it should, ask
            whoever administers the portal to grant it.
          </p>
          <div className={s.noticeRow}>
            <a className={s.linkOut} href="https://orbit-bits.vercel.app">Go to the student portal</a>
            <button type="button" className={s.ghost} onClick={() => void signOut()}>Sign out</button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <div className={s.shell}>
      <header className={s.bar}>
        <div className={s.brand}>
          <span className={s.mark} aria-hidden="true">◎</span>
          <span className={s.brandText}>
            <span className={s.brandName}>Orbit Desk</span>
            <span className={s.brandSub}>BITS Pilani Dubai</span>
          </span>
        </div>
        <nav className={s.nav} aria-label="Sections">
          {NAV.map((n) => {
            const active = n.href === "/" ? pathname === "/" : pathname.startsWith(n.href);
            return (
              <Link key={n.href} href={n.href} className={active ? `${s.tab} ${s.tabActive}` : s.tab}
                    aria-current={active ? "page" : undefined}>
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className={s.who}>
          <span className={s.whoEmail} title={user?.email ?? ""}>{user?.email}</span>
          <button type="button" className={s.ghost} onClick={() => void signOut()}>Sign out</button>
        </div>
      </header>
      <main className={s.page} id="main">{children}</main>
    </div>
  );
}
