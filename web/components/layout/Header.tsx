"use client";

/* §17: 64px, a breadcrumb, global search, and the account control. Nothing
 * else — §17 explicitly forbids a second heavy navigation bar, and §3.4 says
 * one hierarchy per screen. */

import Link from "next/link";
import { usePathname } from "next/navigation";
import s from "./layout.module.css";
import { GlobalSearch } from "./GlobalSearch";
import { CurrencySwitch } from "../ui/CurrencySwitch";
import { ThemeToggle } from "../ui/ThemeToggle";
import { IconButton } from "../ui/Button";
import { TITLES } from "./nav";

function crumbsFor(pathname: string): { label: string; href?: string }[] {
  if (pathname.startsWith("/opportunity/")) {
    return [{ label: "Explore", href: "/explore" }, { label: "Opportunity" }];
  }
  return [{ label: TITLES[pathname] ?? "Opportunities" }];
}

export function Header() {
  const pathname = usePathname();
  const crumbs = crumbsFor(pathname);

  return (
    <header className={s.header}>
      <nav className={s.crumbs} aria-label="Breadcrumb">
        {crumbs.map((c, i) => (
          <span key={c.label} className={s.crumbs}>
            {i > 0 ? (
              <span className={s.crumb} aria-hidden="true">
                /
              </span>
            ) : null}
            {c.href ? (
              <Link href={c.href} className={s.crumb}>
                {c.label}
              </Link>
            ) : (
              <span className={`${s.crumb} ${s.crumbHere}`}>{c.label}</span>
            )}
          </span>
        ))}
      </nav>

      <span className={s.headerSpacer} />

      <div className={s.headerRight}>
        <GlobalSearch />
        <CurrencySwitch />
        <ThemeToggle />
        <IconButton label="Profile and preferences" name="user" variant="secondary" onClick={() => undefined} />
      </div>
    </header>
  );
}

/* §20: a different header on mobile, not the desktop one shrunk. Search is a
 * route rather than an inline panel, because an overlay dropdown over a 390px
 * viewport is the dropdown covering the thing you are searching. */
export function MobileHeader() {
  const pathname = usePathname();
  const title = pathname.startsWith("/opportunity/") ? "Opportunity" : TITLES[pathname] ?? "Opportunities";
  return (
    <div className={s.mobileHeader}>
      <ThemeToggle compact />
      <span className={s.mobileTitle}>{title}</span>
      <Link href="/explore" aria-label="Search opportunities" className={s.crumb}>
        <IconButton label="Search opportunities" name="search" variant="ghost" />
      </Link>
    </div>
  );
}
