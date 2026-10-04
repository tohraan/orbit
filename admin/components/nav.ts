import type { RailItem } from "@rof/ui";

/* The desk's sections, in one list, the way web/components/layout/nav.ts holds
 * the portal's. The rail and the header's section name both read it, so they
 * cannot drift apart.
 *
 * §112: plain labels. "Listings", not "Opportunity Inventory".
 */

export const DESK_NAV: RailItem[] = [
  { href: "/", label: "Overview", icon: "home" },
  { href: "/listings", label: "Listings", icon: "list" },
  { href: "/add", label: "Add opportunity", icon: "plus" },
  { href: "/students", label: "Students", icon: "school" },
  { href: "/activity", label: "Activity", icon: "pulse" },
];

/** The header's section name. Keyed by route, like the portal's TITLES. */
export const TITLES: Record<string, string> = {
  "/": "Overview",
  "/listings": "Listings",
  "/add": "Add opportunity",
  "/students": "Students",
  "/activity": "Activity",
  "/account": "Account",
};

/** Screens that take the full width rather than the reading container: a table
 *  is a grid, and a grid does not get harder to read when it is wider. */
export const WIDE = ["/listings", "/students", "/activity"];
