"use client";

/* §14: the rail stays quiet and does not compete with the opportunity content.
 * One dark active row (§16) is the only strong colour in it.
 *
 * The account slab is pinned to the bottom, below the navigation, by
 * `margin-top: auto` on the footer — before this it was sized by the nav
 * groups above it and floated wherever they happened to end. */

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import s from "./layout.module.css";
import { Icon } from "../ui/Icon";
import { PRIMARY_NAV, SECONDARY_NAV, type NavItem } from "./nav";
import { APP_NAME, APP_TAGLINE } from "./brand";
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
    name
      .split(/\s+/)
      .slice(0, 2)
      .map((part: string) => part[0]?.toUpperCase())
      .join("") || "·";

  return (
    <aside className={s.sidebar}>
      <Link href="/" className={s.brand}>
        <Image className={s.mark} src="/bits-logo-128.png" alt="" width={34} height={34} priority />
        <span className={s.brandText}>
          <span className={s.brandName}>{APP_NAME}</span>
          <span className={s.brandSub}>{APP_TAGLINE}</span>
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
        {/* The account slab: who is signed in on this device, and the way into
            their details. Last element in the rail, by design. */}
        <Link href={signedIn ? "/account" : configured ? "/account" : started ? "/profile" : "/welcome"} className={s.account}>
          <span className={s.avatar} aria-hidden="true">
            {initials}
          </span>
          <span className={s.accountBody}>
            <span className={s.accountName}>{name || (signedIn ? user?.email : "Sign in to sync") || "Set up your profile"}</span>
            <span className={s.accountSub}>
              {signedIn
                ? user?.email || "Signed in"
                : configured
                  ? "Keep your work across devices"
                  : started
                    ? profile.course || "View your details"
                    : "Takes about a minute"}
            </span>
          </span>
          <Icon name="chevron-right" size={15} />
        </Link>

        {/* §72: freshness and provenance, stated once, where it affects whether
            a student trusts a deadline. */}
        <p className={s.sourceNote}>Aggregated from seven sources, including the college desk.</p>
      </div>
    </aside>
  );
}
