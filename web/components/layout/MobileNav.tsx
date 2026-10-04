"use client";

/* The portal's bottom bar.
 *
 * The bar itself is @rof/ui now, beside the rail it replaces — §67 says never
 * both at once, and that rule is only reliable if one file owns both
 * breakpoints. What stays here is the portal's own counts.
 */

import { usePathname } from "next/navigation";
import { BottomNav, type RailItem } from "@rof/ui";
import { MOBILE_NAV } from "./nav";
import { useCompare, useSaved, useTracker } from "@/lib/data";

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

  const items: RailItem[] = MOBILE_NAV.map((item) => ({
    href: item.href,
    label: item.label,
    icon: item.icon,
    count: item.count ? counts[item.count] : undefined,
    activeIcon: item.icon === "bookmark" ? "bookmark-filled" : undefined,
  }));

  return <BottomNav items={items} pathname={pathname} />;
}
