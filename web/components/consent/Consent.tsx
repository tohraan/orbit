"use client";

/* The storage and counting notice.
 *
 * Written to be ACCURATE rather than conventional, which changes what it says.
 * This app sets no advertising cookies, runs no third-party analytics, and
 * ships no tracking pixels — so a banner claiming "we use cookies to improve
 * your experience" would be boilerplate describing a different product. What
 * it actually does is two things, and the banner names both:
 *
 *   1  it keeps your profile, saved list and tracker — in this browser when
 *      signed out, in your account when signed in. Without this there is no
 *      product, so it is stated, not asked about.
 *
 *   2  it counts how many students saved each opportunity, and shows that
 *      number on the card. That one is a genuine choice, because it is the
 *      only thing here that uses one student's behaviour to inform another's,
 *      so it gets a real yes/no with a real default.
 *
 * Declining is one click, not a settings maze, and it is honoured by the
 * database rather than by the browser: `students.share_interest` gates the
 * trigger (db/017), so the count never includes a student who said no.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import c from "./consent.module.css";
import { Icon } from "../ui/Icon";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

/* Exported so SignInNudge can wait for this to be answered instead of
 * stacking a second banner in the same slot. One definition, one key. */
export const CONSENT_KEY = "rof.v1.consent";
const KEY = CONSENT_KEY;
type Choice = "all" | "essential";

function read(): Choice | null {
  try {
    const v = window.localStorage.getItem(KEY);
    return v === "all" || v === "essential" ? v : null;
  } catch {
    /* Storage blocked. The banner will ask again next load, which is the
     * correct behaviour: we genuinely do not know what they chose. */
    return null;
  }
}

async function push(next: Choice, userId: string | undefined) {
  const sb = supabase();
  if (!sb || !userId) return;
  /* Failure is silent and acceptable: the column may not exist yet (db/017),
   * and a consent choice that did not reach the database still holds locally
   * until it can. It is never allowed to break the page. */
  try {
    await sb.from("students").update({ share_interest: next === "all" }).eq("id", userId);
  } catch {
    /* see above */
  }
}

/* Says why the session ended, instead of the page quietly reverting to its
 * signed-out state and leaving the student to conclude the site logged them
 * out for no reason. */
export function SessionNotice() {
  const { expired, dismissExpired } = useAuth();
  const pathname = usePathname();
  if (!expired) return null;
  return (
    <div className={c.wrap} role="status">
      <div className={c.panel}>
        <span className={c.mark} aria-hidden="true">
          <Icon name="alert" size={18} />
        </span>
        <div className={c.body}>
          <p className={c.title}>Your session ended</p>
          <p className={c.text}>
            Signing in again picks up exactly where you were — your saved list, applications and documents are on your
            account, not in this browser.
          </p>
        </div>
        <div className={c.actions}>
          <Link
            href={`/account?next=${encodeURIComponent(pathname)}`}
            className={c.primary}
            onClick={dismissExpired}
          >
            Sign in
          </Link>
          <button type="button" className={c.secondary} onClick={dismissExpired}>
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}

export function ConsentBanner() {
  const { user, status } = useAuth();
  const [choice, setChoice] = useState<Choice | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setChoice(read());
    setReady(true);
  }, []);

  const apply = useCallback(
    async (next: Choice) => {
      try {
        window.localStorage.setItem(KEY, next);
      } catch {
        /* Nothing to persist to; the choice still holds for this page view. */
      }
      setChoice(next);
      await push(next, user?.id);
    },
    [user],
  );

  /* The choice is made before sign-in at least as often as after, so it is
   * applied to the account whenever one appears rather than only at the moment
   * of clicking. Otherwise a student who declines and then signs up is
   * silently counted. */
  useEffect(() => {
    if (status !== "signed-in" || !user) return;
    const stored = read();
    if (stored) void push(stored, user.id);
  }, [status, user]);

  /* Not rendered until the stored choice has been read: a banner that flashes
   * on every load for someone who already answered is worse than no banner. */
  if (!ready || choice) return null;

  return (
    <div className={c.wrap} role="region" aria-label="Storage and counting">
      <div className={c.panel}>
        <span className={c.mark} aria-hidden="true">
          <Icon name="shield" size={18} />
        </span>

        <div className={c.body}>
          <p className={c.title}>What Orbit keeps</p>
          {/* One sentence, not three paragraphs. The original said the same
              thing twice and pushed the buttons into a narrow column beside a
              wall of text — nobody reads a privacy notice twice as carefully
              for being longer. The detail that was cut is still true and still
              on the profile page, where someone who wants it will look. */}
          <p className={c.text}>
            Your saved list and profile are kept so they are here next time. We also count how many students saved
            each opportunity — a number only, never who.{" "}
            <Link href="/profile" className={c.inline}>
              Change later
            </Link>
          </p>
        </div>

        <div className={c.actions}>
          <button type="button" className={c.primary} onClick={() => apply("all")}>
            That&rsquo;s fine
          </button>
          <button type="button" className={c.secondary} onClick={() => apply("essential")}>
            Don&rsquo;t count me
          </button>
        </div>
      </div>
    </div>
  );
}

/** The current choice, for the profile screen to show and change. */
export function useConsent() {
  const { user } = useAuth();
  const [choice, setChoice] = useState<Choice | null>(null);

  useEffect(() => {
    setChoice(read());
  }, []);

  const set = useCallback(
    async (next: Choice) => {
      try {
        window.localStorage.setItem(KEY, next);
      } catch {
        /* nothing to persist to */
      }
      setChoice(next);
      await push(next, user?.id);
    },
    [user],
  );

  return { choice, counted: choice !== "essential", set };
}
