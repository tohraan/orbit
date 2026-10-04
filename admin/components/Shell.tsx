"use client";

/* The shell every desk route renders inside.
 *
 * The rail, the controls and the theme toggle are @rof/ui — the same
 * components the portal draws, not a second set that happens to use the same
 * tokens. What stays here is the part that is the desk's own: three states
 * before the application, and a header that names who is at it.
 *
 * §67, one navigation at a time: the rail is the navigation. The header is two
 * clusters and nothing in between — identity left, controls right.
 */

import Image from "next/image";
import { usePathname } from "next/navigation";
import { Rail, BottomNav, ThemeToggle, Spinner, Button, initialsOf } from "@rof/ui";
import rail from "@rof/ui/rail.module.css";
import s from "./shell.module.css";
import { useSession } from "@/lib/session";
import { SignIn } from "./SignIn";
import { DESK_NAV, TITLES, WIDE } from "./nav";

export function Shell({ children }: { children: React.ReactNode }) {
  const { status, isStaff, user, configured, name } = useSession();
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
        <Spinner label="Checking your session" />
        <p className="t-body-sm c-secondary">Checking your session…</p>
      </main>
    );
  }

  if (status === "out") return <SignIn />;

  /* Signed in, but a student. A real state with its own screen: saying "access
     denied" to someone whose account simply has not been granted the desk is
     both unhelpful and, to them, indistinguishable from a broken password. */
  if (isStaff === false) return <NotStaff />;

  const title = TITLES[pathname] ?? "Desk";
  const wide = WIDE.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  return (
    <div className={s.shell}>
      <Rail
        items={DESK_NAV}
        pathname={pathname}
        foot={{
          href: "/account",
          initials: initialsOf(name, user?.email),
          label: name || user?.email || "Your account",
        }}
      />

      {/* §19/§67: below 1024px the rail hides and this takes over. Without it
          the desk had no navigation at all on a phone — the top tab bar it
          replaced used to wrap and stay usable, so the rail was a regression
          until this landed. */}
      <BottomNav items={DESK_NAV} pathname={pathname} />

      <div className={rail.main}>
        <header className={s.bar}>
          <div className={s.brand}>
            <Image className={s.mark} src="/bits-logo-64.png" alt="" width={30} height={30} priority />
            <span className={s.brandText}>
              <span className={s.brandName}>Orbit Desk</span>
              <span className={s.brandSub}>BITS Pilani Dubai</span>
            </span>
            <span className={s.where}>{title}</span>
          </div>

          <div className={s.controls}>
            <span className={s.whoEmail} title={user?.email ?? ""}>
              {user?.email}
            </span>
            <ThemeToggle />
          </div>
        </header>

        <main className={wide ? `${s.page} ${s.wide}` : s.page} id="main">
          {children}
        </main>
      </div>
    </div>
  );
}

function NotStaff() {
  const { user, signOut } = useSession();
  return (
    <main className={s.centre}>
      <div className={s.notice}>
        <h1 className="t-section">This account is not on the desk</h1>
        <p className="t-body-sm c-secondary">
          {user?.email} is signed in, but does not have department access. Ask whoever runs the portal to
          grant it — nothing about your student account has changed.
        </p>
        <div className={s.noticeRow}>
          <a className={s.linkOut} href="https://orbit-bits.vercel.app">
            Go to the student portal
          </a>
          {/* A button, not a link with href="#": signing out is an action, and
              a link that goes nowhere is a trap for anyone on a keyboard. */}
          <Button tone="ghost" size="sm" onClick={() => void signOut()}>
            Sign out
          </Button>
        </div>
      </div>
    </main>
  );
}
