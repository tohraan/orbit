"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import s from "./layout.module.css";
import { Icon } from "../ui/Icon";
import { MOBILE_NAV } from "./nav";
import { useCompare, useSaved, useTracker } from "@/lib/data";

/* §19: the desktop sidebar becomes this. §67: never both at once — the CSS in
 * layout.module.css makes them mutually exclusive at 1024px. */

export function MobileNav() {
  const pathname = usePathname();
  const { saved } = useSaved();
  const { compare } = useCompare();
  const { entries } = useTracker();
  const counts: Record<string, number> = {
    saved: saved.length,
    compare: compare.length,
    tracker: entries.length,
  };

  return (
    <nav className={s.bottomNav} aria-label="Main">
      {MOBILE_NAV.map((item) => {
        const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        const count = item.count ? counts[item.count] : 0;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={[s.bottomItem, active ? s.bottomItemActive : null].filter(Boolean).join(" ")}
            aria-current={active ? "page" : undefined}
          >
            <Icon name={active && item.icon === "bookmark" ? "bookmark-filled" : item.icon} size={20} />
            <span>{item.label}</span>
            {count ? <span className={s.bottomBadge}>{count > 99 ? "99+" : count}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}
