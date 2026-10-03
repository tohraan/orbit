"use client";

/* First-run onboarding, over a frosted portal.
 *
 * It is an overlay rather than a page because of what it says about the
 * product: the portal is already there, already loaded, already yours — this
 * is the last thing between you and it, not a waiting room before it. Blurring
 * the real screen behind the questions shows what is being unlocked.
 *
 * It renders for exactly one condition: signed in, and `onboarded_at` is null.
 * Not "the profile looks empty" — someone who skipped every question has still
 * been welcomed, and inferring it from the data would greet them again on
 * every login (db/018 has the longer argument).
 *
 * MOTION. The rest of the product forbids transform animation, deliberately:
 * a layout that moves under the cursor is harder to use. This is the one place
 * that rule is lifted, on instruction, because here the motion IS the content —
 * one card at a time arriving in sequence is what makes a form feel like a
 * conversation. It is still bounded: entry only, no loops, nothing that moves
 * after it has settled, and `prefers-reduced-motion` removes all of it.
 */

import { useEffect, useState } from "react";
import s from "./onboarding-overlay.module.css";
import { WelcomeFlow } from "@/app/welcome/page";
import { takeFirstRun } from "@/lib/account";
import { useProfile } from "@/lib/data";
import { useAuth } from "@/lib/auth";

export function OnboardingOverlay() {
  const { status, configured } = useAuth();
  const { onboardedAt, markOnboarded, ready } = useProfile();
  const [done, setDone] = useState(false);

  /* Set by the account screen when a sign-up has just succeeded, which is the
   * one case where "new student" is known before the row arrives. Read once,
   * on mount, and consumed — see lib/account.ts. */
  const [firstRun, setFirstRun] = useState(false);
  useEffect(() => {
    setFirstRun(takeFirstRun());
  }, []);

  /* `undefined` means the row has not arrived yet. Treating that as "never
   * onboarded" would flash this over every returning student for a frame —
   * which is why the wait exists at all, and why `firstRun` is the only thing
   * allowed to skip it: it says this session created the account.
   *
   * Once the row lands, it decides. A firstRun hint that turns out to be wrong
   * closes the overlay rather than outvoting the database. */
  const known = ready ? onboardedAt === null : firstRun;
  const show = configured && status === "signed-in" && known && !done;

  /* The page behind must not scroll while this is up. */
  useEffect(() => {
    if (!show) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [show]);

  if (!show) return null;

  return (
    <div className={s.scrim} role="dialog" aria-modal="true" aria-label="Set up your profile">
      <div className={s.sheet}>
        {/* No header of its own. The flow's card already opens with an
            eyebrow, a title, the progress bar and the step tabs — adding a
            second heading above it said the same thing twice and pushed the
            card under the top bar. */}
        <div className={s.body}>
          <WelcomeFlow
            embedded
            onDone={() => {
              void markOnboarded();
              setDone(true);
            }}
          />
        </div>

        {/* A way past it that is honest about the cost, rather than a flow with
            no exit — but it still records that they were welcomed, so it does
            not reappear tomorrow. */}
        <button
          type="button"
          className={s.later}
          onClick={() => {
            void markOnboarded();
            setDone(true);
          }}
        >
          I&rsquo;ll do this later
        </button>
      </div>
    </div>
  );
}
