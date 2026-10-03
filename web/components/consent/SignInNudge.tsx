"use client";

/* The reminder, fifteen seconds in.
 *
 * It is a reminder, not a wall: browsing stays open, and the point of showing
 * it after a delay rather than on arrival is that by then the student has seen
 * something worth keeping. An interstitial on load asks someone to commit
 * before they know what they are committing to.
 *
 * Four rules keep it from becoming nagging, and they are the whole design:
 *
 *   ONCE PER SESSION. Dismiss it and it stays gone until the tab is closed —
 *   the timer does not restart on every navigation, which is what turns a
 *   reminder into a pop-up that follows you round the site.
 *
 *   NEVER ON TOP OF THE CONSENT NOTICE. Both live in the same bottom slot. A
 *   first-time visitor gets the storage notice, answers it, and only then does
 *   the fifteen seconds begin.
 *
 *   NEVER WHERE IT IS REDUNDANT. Not on /account or /welcome, where they are
 *   already signing in, and not while the session is still resolving.
 *
 *   IT COUNTS VISIBLE TIME. A tab left open in the background has not been
 *   "on the site" for fifteen seconds, so the timer pauses when the tab is
 *   hidden and resumes when it comes back.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import c from "./consent.module.css";
import { Icon } from "../ui/Icon";
import { useAuth } from "@/lib/auth";
import { CONSENT_KEY } from "./Consent";
import { useSaved, useTracker } from "@/lib/data";

const DISMISSED = "rof.v1.nudged";
const DELAY_MS = 15_000;

export function SignInNudge() {
  const { status, configured } = useAuth();
  const pathname = usePathname();
  const { saved } = useSaved();
  const { entries } = useTracker();

  const [show, setShow] = useState(false);
  const spent = useRef(0);
  const since = useRef<number | null>(null);

  const dismiss = useCallback(() => {
    setShow(false);
    try {
      window.sessionStorage.setItem(DISMISSED, "1");
    } catch {
      /* Storage blocked: it simply asks again next load, which is honest —
         we genuinely do not know that it was dismissed. */
    }
  }, []);

  const eligible =
    configured &&
    status === "signed-out" &&
    !pathname.startsWith("/account") &&
    !pathname.startsWith("/welcome");

  useEffect(() => {
    if (!eligible) {
      setShow(false);
      return;
    }
    try {
      if (window.sessionStorage.getItem(DISMISSED)) return;
      /* The storage notice gets answered first; two banners in one slot is a
         stack, and a stack is an interruption. */
      if (!window.localStorage.getItem(CONSENT_KEY)) return;
    } catch {
      return;
    }

    let timer: number | undefined;

    const start = () => {
      if (since.current != null) return;
      since.current = Date.now();
      timer = window.setTimeout(() => setShow(true), Math.max(0, DELAY_MS - spent.current));
    };
    const stop = () => {
      if (since.current == null) return;
      spent.current += Date.now() - since.current;
      since.current = null;
      window.clearTimeout(timer);
    };

    const onVis = () => (document.visibilityState === "visible" ? start() : stop());
    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVis);

    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVis);
    };
    /* `eligible` only — it must not restart when saved/tracked change, or
       saving something would reset the clock it is meant to be counting. */
  }, [eligible]);

  if (!show) return null;

  /* What they would actually lose. A student who has already saved something
   * has a concrete stake, and saying so is more honest and more persuasive
   * than a generic invitation. */
  const kept = saved.length + entries.length;
  const body =
    kept > 0
      ? `You have ${kept} ${kept === 1 ? "listing" : "listings"} kept in this browser. An account moves ${kept === 1 ? "it" : "them"} to you, so ${kept === 1 ? "it is" : "they are"} still there on your phone and the week the deadline lands.`
      : "Saving an opportunity, comparing two, or keeping your documents all need an account — and it takes a minute with your campus email.";

  return (
    <div className={c.wrap} role="status">
      <div className={c.panel}>
        <span className={c.mark} aria-hidden="true">
          <Icon name="user" size={18} />
        </span>

        <div className={c.body}>
          <p className={c.title}>Keep what you find</p>
          <p className={c.text}>{body}</p>
        </div>

        <div className={c.actions}>
          <Link
            href={`/account?next=${encodeURIComponent(pathname)}`}
            className={c.primary}
            onClick={dismiss}
          >
            Sign in
          </Link>
          <button type="button" className={c.secondary} onClick={dismiss}>
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}
