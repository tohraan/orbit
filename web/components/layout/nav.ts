import type { IconName } from "../ui/Icon";
import { AGENT_NAME } from "./brand";

/* §112: plain labels. "Explore", not "Opportunity Intelligence". §15 and §82
 * fix the groups and the routes; this is the single list both the sidebar and
 * the bottom navigation read, so they can never drift apart. */

export type NavItem = {
  href: string;
  label: string;
  icon: IconName;
  /** Which stored collection supplies this item's count, if any. */
  count?: "saved" | "compare" | "tracker";
  /** §90: the five the mobile bottom bar keeps. */
  mobile?: boolean;
};

export const PRIMARY_NAV: NavItem[] = [
  { href: "/", label: "Home", icon: "home", mobile: true },
  { href: "/explore", label: "Explore", icon: "explore", mobile: true },
  /* Rover sits next to Explore because it is the same job approached from the
   * other end: Explore is for a student who knows which filter they want,
   * Rover for one who can only describe what they are after. It is on the
   * mobile bar as a sixth item — §90 fixes five, and this is a deliberate
   * exception: Deadlines, Dossier and Compare are reachable on a phone only
   * through the command palette, and the flagship way into the index cannot be
   * the fourth thing that is desktop-only. */
  { href: "/rover", label: AGENT_NAME, icon: "rover", mobile: true },
  { href: "/saved", label: "Saved", icon: "bookmark", count: "saved", mobile: true },
  { href: "/applications", label: "Applications", icon: "applications", count: "tracker", mobile: true },
  { href: "/deadlines", label: "Deadlines", icon: "calendar" },
  /* The Dossier is the student's own material rather than the index's, so it
   * sits at the end of the primary group — reached often, but never the thing
   * you came to the portal for. */
  { href: "/dossier", label: "Dossier", icon: "file" },
];

export const SECONDARY_NAV: NavItem[] = [
  { href: "/compare", label: "Compare", icon: "compare", count: "compare" },
];

export const FOOTER_NAV: NavItem[] = [
  { href: "/profile", label: "Profile", icon: "user", mobile: true },
];

export const MOBILE_NAV: NavItem[] = [...PRIMARY_NAV, ...SECONDARY_NAV, ...FOOTER_NAV].filter((n) => n.mobile);

/** The header breadcrumb and the mobile title both read from here. */
export const TITLES: Record<string, string> = {
  "/": "Home",
  "/explore": "Explore",
  "/rover": AGENT_NAME,
  "/saved": "Saved",
  "/applications": "Applications",
  "/deadlines": "Deadlines",
  "/compare": "Compare",
  "/dossier": "Dossier",
  "/profile": "Profile",
  "/welcome": "Set up your profile",
  "/admin": "College desk",
  "/account": "Account",
};
