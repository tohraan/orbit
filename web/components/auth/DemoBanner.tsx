"use client";

/* Says, on every screen, that this visit is in judge mode.
 *
 * WHY IT IS NOT DISMISSIBLE. Demo mode changes where a visitor's work goes —
 * saved listings and tracked applications land in this browser rather than
 * against an account, so closing the tab loses them. A banner that can be
 * dismissed is a banner that is dismissed in the first ten seconds and then
 * absent for the rest of the visit, which is precisely when the consequence
 * arrives. It stays, and it stays small.
 *
 * It also carries the way out, because entering demo mode must not be a
 * one-way door: a judge who wants to see the real sign-in flow, or a student
 * who followed a judging link by mistake, needs one obvious control.
 */

import { useRouter } from "next/navigation";
import { exitDemo, useDemo } from "@/lib/demo";
import s from "./demobanner.module.css";

export function DemoBanner() {
  const { demo } = useDemo();
  const router = useRouter();
  if (!demo) return null;

  return (
    <div className={s.bar} role="status">
      <span className={s.dot} aria-hidden="true" />
      <p className={s.text}>
        <strong>Reviewer access.</strong> No account, so anything you save stays in this browser.
      </p>
      <button
        type="button"
        className={s.leave}
        onClick={() => {
          exitDemo();
          router.push("/account");
        }}
      >
        Leave
      </button>
    </div>
  );
}
