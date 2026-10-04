"use client";

/* The navigation rail, as a component rather than a pattern.
 *
 * The portal and the desk both have a handful of top-level sections and an
 * account at the foot, and that is the whole of what the rail does. What they
 * do NOT share is where the numbers come from — the portal counts saved and
 * compared listings out of browser storage, the desk counts nothing — so this
 * takes items and counts as props and reads no store of its own. That is the
 * line that lets one component serve two apps without either of them dragging
 * the other's data layer along.
 */

import Link from "next/link";
import { Icon, type IconName } from "./Icon";
import s from "./rail.module.css";

export type RailItem = {
  href: string;
  label: string;
  icon: IconName;
  /** Rendered as a badge on the glyph. Absent or 0 shows nothing. */
  count?: number;
  /** Swapped in when this item is the active one — the filled bookmark. */
  activeIcon?: IconName;
};

export type RailFoot = {
  href: string;
  /** Up to two characters. The caller derives them; this does not guess. */
  initials: string;
  /** The accessible name, and the hover label. */
  label: string;
};

/* Exact match for a root href, prefix match for everything else. "/" would
 * otherwise be active on every screen in the app. */
export function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

function Row({ item, pathname }: { item: RailItem; pathname: string }) {
  const active = isActive(pathname, item.href);
  const count = item.count ?? 0;
  return (
    <Link
      href={item.href}
      className={[s.navItem, active ? s.navItemActive : null].filter(Boolean).join(" ")}
      aria-current={active ? "page" : undefined}
      aria-label={item.label}
    >
      <Icon name={active && item.activeIcon ? item.activeIcon : item.icon} size={22} />
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

export function Rail({
  items,
  tools = [],
  foot,
  pathname,
  label = "Main",
}: {
  items: RailItem[];
  /** A second group below a rule. Empty renders nothing, rule included. */
  tools?: RailItem[];
  foot?: RailFoot;
  pathname: string;
  label?: string;
}) {
  return (
    <aside className={s.sidebar} aria-label={label}>
      <nav className={s.navGroup} aria-label="Sections">
        {items.map((item) => (
          <Row key={item.href} item={item} pathname={pathname} />
        ))}
      </nav>

      {/* Rendered only when there is something in it. An empty group still
          drew its rules, which left two dividers stacked against each other
          with nothing between them. */}
      {tools.length ? (
        <>
          <div className={s.navRule} />
          <nav className={s.navGroup} aria-label="Tools">
            {tools.map((item) => (
              <Row key={item.href} item={item} pathname={pathname} />
            ))}
          </nav>
        </>
      ) : null}

      {foot ? (
        <>
          <div className={s.navRule} />
          <div className={s.sidebarFoot}>
            <Link href={foot.href} className={s.account} aria-label={foot.label}>
              <span className={s.avatar} aria-hidden="true">
                {foot.initials}
              </span>
              <span className={s.navLabel} aria-hidden="true">
                {foot.label}
              </span>
            </Link>
          </div>
        </>
      ) : null}
    </aside>
  );
}

/** Two characters from a name or an email, for the rail's foot. */
export function initialsOf(...candidates: (string | null | undefined)[]): string {
  const source = candidates.find((c) => c && c.trim()) ?? "";
  return (
    source
      .split(/[\s@._-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "·"
  );
}
