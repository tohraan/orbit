"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import s from "./layout.module.css";
import { Icon } from "../ui/Icon";
import { FOOTER_NAV, PRIMARY_NAV, SECONDARY_NAV, type NavItem } from "./nav";
import { useCompare, useSaved, useTracker } from "@/lib/store";

/* §14: the sidebar stays visually quiet and does not compete with the
 * opportunity content. One dark active row (§16) is the only strong colour. */

function Row({ item, counts }: { item: NavItem; counts: Record<string, number> }) {
  const pathname = usePathname();
  const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
  const count = item.count ? counts[item.count] : 0;
  return (
    <Link
      href={item.href}
      className={[s.navItem, active ? s.navItemActive : null].filter(Boolean).join(" ")}
      aria-current={active ? "page" : undefined}
    >
      <Icon name={active && item.icon === "bookmark" ? "bookmark-filled" : item.icon} size={17} />
      <span className={s.navLabel}>{item.label}</span>
      {count ? (
        <span className={s.navCount} aria-label={`${count} items`}>
          {count}
        </span>
      ) : null}
    </Link>
  );
}

export function Sidebar({ freshness }: { freshness?: string | null }) {
  const { saved } = useSaved();
  const { compare } = useCompare();
  const { entries } = useTracker();
  const counts = { saved: saved.length, compare: compare.length, tracker: entries.length };

  return (
    <aside className={s.sidebar}>
      <Link href="/" className={s.brand}>
        <span className={s.mark} aria-hidden="true">
          RO
        </span>
        <span className={s.brandText}>
          <span className={s.brandName}>Opportunities</span>
          <span className={s.brandSub}>BITS Pilani Dubai</span>
        </span>
      </Link>

      <nav className={s.navGroup} aria-label="Main">
        {PRIMARY_NAV.map((item) => (
          <Row key={item.href} item={item} counts={counts} />
        ))}
      </nav>

      <div className={s.navRule} />

      <nav className={s.navGroup} aria-label="Tools">
        {SECONDARY_NAV.map((item) => (
          <Row key={item.href} item={item} counts={counts} />
        ))}
      </nav>

      <div className={s.sidebarFoot}>
        <nav className={s.navGroup} aria-label="Account">
          {FOOTER_NAV.map((item) => (
            <Row key={item.href} item={item} counts={counts} />
          ))}
        </nav>
        {/* §72: freshness, stated once, where it affects whether a student
            trusts a deadline. */}
        <p className={s.sourceNote}>
          Aggregated from six public sources.
          {freshness ? ` Index updated ${freshness}.` : null}
        </p>
      </div>
    </aside>
  );
}
