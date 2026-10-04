"use client";

/* Judge mode — a way into the portal for someone who cannot be given a campus
 * account.
 *
 * WHY THIS EXISTS. Orbit is gated to `@dubai.bits-pilani.ac.in` (db/019, a
 * BEFORE INSERT trigger on auth.users). That is the right rule for students and
 * the wrong rule for a hackathon judging panel: they have no campus address, so
 * the sign-in screen is a locked door with no key on their side of it. A judge
 * who cannot get in scores what they can see, which is the sign-in screen.
 *
 * WHAT IT IS NOT. This does NOT mint a Supabase session, forge a JWT, or relax
 * a row-level security policy. There is no bypass of the database's access
 * control anywhere in this file, and there could not be: RLS is enforced in
 * Postgres against `auth.uid()` (db/015), and a demo visitor has no `auth.uid()`
 * to present. Every student's saved list, tracker, profile and documents stay
 * exactly as unreachable to a demo visitor as to any other stranger.
 *
 * WHAT IT ACTUALLY DOES. It flips the two client-side walls — AuthWall (route
 * access) and GateProvider (per-action interception) — from "enforced" to
 * "open", which is the same state a build with no Supabase credentials already
 * runs in. Personal state then lands in `lib/store.ts`'s per-browser path,
 * which is where it lived before accounts existed. So a judge gets the whole
 * product, with their own saved list and tracker, held in their own browser.
 *
 * CONSEQUENCES, STATED. Anything that genuinely needs a server-side owner is
 * unavailable in demo mode and says so rather than failing: the Dossier's
 * stored files and cross-device sync both need a real account. The desk is NOT
 * opened by this flag — it is a separate deployment behind a campus sign-in and a
 * demo visitor must not reach the staff desk.
 *
 * TWO SWITCHES, BOTH DELIBERATE.
 *   NEXT_PUBLIC_DEMO_MODE  build-level. Unset or "0" and nothing here can be
 *                          turned on at all, so the production student build
 *                          ships without a door. The judging deployment sets
 *                          it to "1".
 *   sessionStorage         visitor-level, and session- rather than local- on
 *                          purpose: closing the tab ends it. A judge on a
 *                          shared machine does not leave demo mode behind for
 *                          whoever sits down next.
 */

import { useEffect, useState } from "react";

const KEY = "orbit.demo";

/* Build-level switch: unset, and nothing in this file can be turned on.
 *
 * It gates RENDERING AND ACTIVATION, not bundling — measured, not assumed. A
 * clean `next build` with the flag unset still contains the judging copy:
 * Turbopack compiles `process.env.NEXT_PUBLIC_DEMO_MODE` to a runtime lookup
 * rather than inlining a literal, so there is no constant for the minifier to
 * fold and the dead branch survives. Writing it as a bare `===` instead of
 * `(… ?? "").trim() === "1"` does not change that; both were built and
 * grepped for the button's label, and both ship it.
 *
 * That is acceptable because the flag is checked on every path INTO demo mode,
 * not just on the button: `isDemo()` and `enterDemo()` both return early
 * without it, and `useDemo()` never leaves its false initial state. So in a
 * student build the door is inert even to someone who finds the dead code and
 * sets the sessionStorage key by hand — there is no sequence of client-side
 * actions that enables it. What you must not do is claim the copy is absent
 * from the bundle; it is not. */
export const DEMO_ENABLED = process.env.NEXT_PUBLIC_DEMO_MODE === "1";

/* Subscribers, so the two walls re-render the moment the flag flips rather
 * than on the next navigation. */
const listeners = new Set<() => void>();
const announce = () => listeners.forEach((fn) => fn());

/** True when this tab is in judge mode. Always false during SSR. */
export function isDemo(): boolean {
  if (!DEMO_ENABLED) return false;
  if (typeof window === "undefined") return false;
  try {
    return window.sessionStorage.getItem(KEY) === "1";
  } catch {
    /* Storage blocked (private window, site data denied). Demo mode is a
     * convenience, not a requirement — report it off rather than throw. */
    return false;
  }
}

export function enterDemo(): void {
  if (!DEMO_ENABLED || typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(KEY, "1");
  } catch {
    /* Nothing to persist to. The flag stays off and the sign-in screen is
     * still there — a judge in a locked-down browser gets the honest outcome
     * rather than a half-entered state. */
  }
  announce();
}

export function exitDemo(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    /* fall through */
  }
  announce();
}

/* A direct link for the submission form, so the panel does not have to find
 * the button: /?judge=1 enters demo mode and strips the parameter so the URL
 * they then share or bookmark is the plain one.
 *
 * Called once from the shell. `replaceState` rather than a router navigation
 * because this must not add a history entry — a judge pressing Back should
 * leave the site, not re-enter demo mode in a loop. */
export function adoptDemoFromUrl(): void {
  if (!DEMO_ENABLED || typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (url.searchParams.get("judge") !== "1") return;
  enterDemo();
  url.searchParams.delete("judge");
  window.history.replaceState(null, "", url.pathname + url.search + url.hash);
}

/** Subscribe to flag changes. Returns the unsubscribe. */
export function onDemoChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/* The hook the walls read.
 *
 * Starts false and loads on mount, never during render — the same trade
 * lib/store.ts makes and for the same reason: reading sessionStorage in the
 * initial state makes the server HTML and the first client render disagree,
 * and React answers that by discarding the tree. One frame of "not in demo
 * mode" is correct, because AuthWall renders its quiet placeholder for that
 * frame anyway rather than a flash of the wall.
 *
 * `ready` is reported separately so a caller can tell "not in demo mode" from
 * "do not know yet" — gating on the second as if it were the first is what
 * shows the wall to someone who is, in fact, let in. */
export function useDemo(): { demo: boolean; ready: boolean } {
  const [demo, setDemo] = useState(false);
  const [ready, setReady] = useState(!DEMO_ENABLED);

  useEffect(() => {
    if (!DEMO_ENABLED) return;
    adoptDemoFromUrl();
    setDemo(isDemo());
    setReady(true);
    /* Covers the button on /account, Leave in the banner, and another tab
     * doing either. */
    return onDemoChange(() => setDemo(isDemo()));
  }, []);

  return { demo, ready };
}
