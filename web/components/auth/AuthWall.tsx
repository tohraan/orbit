"use client";

/* The portal is now behind a campus sign-in.
 *
 * This reverses the earlier model, deliberately and on instruction. Browsing
 * used to be open and only KEEPING things needed an account, which produced
 * the bug that prompted the change: a signed-out visitor could fill a profile
 * in browser storage and see "Your profile is complete · Tohraan Khan" while
 * the same screen offered them a Sign in button. Two sources of truth for who
 * you are is not a thing you can design your way out of — there can only be
 * one, and it is the session.
 *
 * What stays reachable without a session:
 *   /account  — the sign-in screen itself, and the password-recovery screen
 *               it turns into. Gating the way in behind the way in is a lock
 *               with the key inside.
 *
 * Three states this must not get wrong:
 *   LOADING    render nothing but a quiet placeholder. Showing the wall for
 *              one frame to someone who IS signed in is the single most common
 *              bug in apps that do this.
 *   UNCONFIGURED  a build with no Supabase credentials has nowhere to sign in
 *              to, so the wall would be a dead end. It stays open.
 *   RECOVERY   the recovery link signs you in; /account handles it.
 */

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";

/** Routes that must work without a session. */
const OPEN = ["/account"];

export function AuthWall({ children }: { children: React.ReactNode }) {
  const { status, configured } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  const open = OPEN.some((p) => pathname.startsWith(p));
  const blocked = configured && status === "signed-out" && !open;

  useEffect(() => {
    if (!blocked) return;
    /* Carry where they were trying to go, so signing in lands them there
     * rather than dumping everyone on the home page. */
    const next = pathname && pathname !== "/" ? `?next=${encodeURIComponent(pathname)}` : "";
    router.replace(`/account${next}`);
  }, [blocked, pathname, router]);

  /* Still resolving, or mid-redirect: render nothing rather than a flash of
   * either the app or the wall. */
  if (configured && status === "loading") return <Pending />;
  if (blocked) return <Pending />;

  return <>{children}</>;
}

function Pending() {
  return (
    <div
      style={{
        minHeight: "60vh",
        display: "grid",
        placeItems: "center",
        color: "var(--text-tertiary)",
        fontSize: 13,
      }}
      aria-live="polite"
    >
      <span className="sr-only">Checking your session</span>
    </div>
  );
}
