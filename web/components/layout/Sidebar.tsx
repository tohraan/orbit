"use client";

/* The portal's rail.
 *
 * The rail itself is @rof/ui now — the desk draws the same one, and two copies
 * of a 64px pill with a 48px target and a badge that has to invert on the
 * active tile is how the two deployments stop agreeing what navigation is.
 *
 * What stays here is the part that is the portal's: where the counts come from
 * (saved, compare and tracker live in browser storage) and where the foot goes
 * for a student who has not signed in yet. @rof/ui reads no store of its own,
 * which is the line that lets one component serve both apps.
 */

import { usePathname } from "next/navigation";
import { Rail, initialsOf, type RailItem } from "@rof/ui";
import { PRIMARY_NAV, SECONDARY_NAV } from "./nav";
import { useCompare, useProfile, useSaved, useTracker } from "@/lib/data";
import { useAuth } from "@/lib/auth";

export function Sidebar() {
  const pathname = usePathname();
  const { saved } = useSaved();
  const { compare } = useCompare();
  const { entries } = useTracker();
  const { profile, started } = useProfile();
  const { status, user, configured } = useAuth();
  const signedIn = status === "signed-in";

  const counts: Record<string, number> = {
    saved: saved.length,
    compare: compare.length,
    tracker: entries.length,
  };

  const decorate = (items: typeof PRIMARY_NAV): RailItem[] =>
    items.map((item) => ({
      href: item.href,
      label: item.label,
      icon: item.icon,
      count: item.count ? counts[item.count] : undefined,
      /* §78 makes a filled bookmark the saved state — a state change rather
         than a second icon style. */
      activeIcon: item.icon === "bookmark" ? "bookmark-filled" : undefined,
    }));

  const name = profile.name.trim();

  return (
    <Rail
      items={decorate(PRIMARY_NAV)}
      tools={decorate(SECONDARY_NAV)}
      pathname={pathname}
      foot={{
        href: signedIn || configured ? "/account" : started ? "/profile" : "/welcome",
        initials: initialsOf(name, user?.email),
        label: name || (signedIn ? user?.email : "Sign in to sync") || "Set up your profile",
      }}
    />
  );
}
