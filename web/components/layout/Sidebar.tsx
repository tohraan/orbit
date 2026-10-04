"use client";

/* The rail: a floating vertical pill of icon targets, centred against the
 * viewport.
 *
 * It replaced a 232px full-height panel. The names now arrive on hover, which
 * costs nothing and gives the content the whole width back — and because the
 * label is a real element rather than a `title` attribute, it is styled, it
 * appears instantly, and it shows on keyboard focus too, which a native
 * tooltip never does.
 *
 * The brand moved out of here and into the top-left of the header, where it
 * belongs once the rail is icon-only.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import s from "./layout.module.css";
import { Icon } from "../ui/Icon";
import { PRIMARY_NAV, SECONDARY_NAV, type NavItem } from "./nav";
import { useCompare, useProfile, useSaved, useTracker } from "@/lib/data";
import { useAuth } from "@/lib/auth";

function Row({ item, counts }: { item: NavItem; counts: Record<string, number> }) {
  const pathname = usePathname();
  const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
  const count = item.count ? counts[item.count] : 0;
  return (
    <Link
      href={item.href}
      className={[s.navItem, active ? s.navItemActive : null].filter(Boolean).join(" ")}
      aria-current={active ? "page" : undefined}
      aria-label={item.label}
    >
      <Icon name={active && item.icon === "bookmark" ? "bookmark-filled" : item.icon} size={22} />
      {count ? (
        <span className={s.navCount} aria-hidden="true">
          {count > 9 ? "9+" : count}
        </span>
      ) : null}
      {/* aria-hidden: the link already carries its name, and announcing it
          twice is worse than not styling it at all. */}
      <span className={s.navLabel} aria-hidden="true">
        {item.label}
        {count ? ` (${count})` : ""}
      </span>
    </Link>
  );
}

export function Sidebar() {
  const { saved } = useSaved();
  const { compare } = useCompare();
  const { entries } = useTracker();
  const { profile, started } = useProfile();
  const { status, user, configured } = useAuth();
  const signedIn = status === "signed-in";
  const counts = { saved: saved.length, compare: compare.length, tracker: entries.length };

  const name = profile.name.trim();
  const initials =
    (name || user?.email || "")
      .split(/[\s@.]+/)
      .slice(0, 2)
      .map((part: string) => part[0]?.toUpperCase())
      .join("") || "·";

  return (
    <aside className={s.sidebar} aria-label="Main">
      <nav className={s.navGroup} aria-label="Sections">
        {PRIMARY_NAV.map((item) => (
          <Row key={item.href} item={item} counts={counts} />
        ))}
      </nav>

      {/* Rendered only when there is something in it. An empty group still
          drew its rules, which left two dividers stacked against each other
          with nothing between them. */}
      {SECONDARY_NAV.length ? (
        <>
          <div className={s.navRule} />
          <nav className={s.navGroup} aria-label="Tools">
            {SECONDARY_NAV.map((item) => (
              <Row key={item.href} item={item} counts={counts} />
            ))}
          </nav>
        </>
      ) : null}

      <div className={s.navRule} />

      <div className={s.sidebarFoot}>
        <Link
          href={signedIn || configured ? "/account" : started ? "/profile" : "/welcome"}
          className={s.account}
          aria-label={name || (signedIn ? "Your account" : "Sign in")}
        >
          <span className={s.avatar} aria-hidden="true">
            {initials}
          </span>
          <span className={s.navLabel} aria-hidden="true">
            {name || (signedIn ? user?.email : "Sign in to sync") || "Set up your profile"}
          </span>
        </Link>
      </div>
    </aside>
  );
}
