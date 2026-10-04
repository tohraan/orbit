"use client";

/* "Did that work out?" — asked once, when a student is leaving a listing.
 *
 * WHAT IT IS FOR. The tracker only knows what someone remembers to tell it,
 * and nobody comes back to a portal to update a status. The one moment they
 * reliably know the answer is the moment they have just been to the
 * application page and come back. Asking then costs one tap and keeps the
 * tracker true; asking later gets no answer at all.
 *
 * WHEN IT FIRES — two signals, in order of how much they mean:
 *
 *   1. They opened the apply link and came back to this tab. This is the
 *      strong one: they went to apply, and now they know whether they did.
 *      Fires on the tab becoming visible again, after a real absence.
 *
 *   2. Desktop exit intent — the pointer leaves through the TOP of the
 *      viewport, which is the tab bar and the address bar and nothing else.
 *      A weaker signal, so it is only used when the first has not happened.
 *
 * There is no mobile exit intent, deliberately. The events that could stand in
 * for it (`visibilitychange` on any app switch, `pagehide`) fire constantly
 * during normal use, and a dialog that appears every time someone checks a
 * message is not a prompt, it is an ambush.
 *
 * WHAT STOPS IT BEING ANNOYING. Once per opportunity, ever — answered or
 * dismissed, it is recorded and never asked again for that listing. It never
 * blocks leaving: `beforeunload` is not used, nothing is prevented, and Escape
 * or the backdrop closes it. It also never appears for a listing already
 * marked `applied`, because then the question is already answered.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import s from "./exitprompt.module.css";
import { Icon } from "../ui/Icon";
import { useTracker } from "@/lib/data";
import { inDays, useReminders } from "@/lib/reminders";

/** Opportunities already asked about, so nobody is asked twice. */
const ASKED_KEY = () => "rof.v1.exitAsked";

function alreadyAsked(id: number): boolean {
  try {
    const raw = window.sessionStorage.getItem(ASKED_KEY());
    return raw ? (JSON.parse(raw) as number[]).includes(id) : false;
  } catch {
    /* Storage blocked: treat as asked, so a browser that cannot remember the
       answer is never nagged repeatedly. Failing quiet is the right default
       for something that interrupts. */
    return true;
  }
}

function markAsked(id: number) {
  try {
    const raw = window.sessionStorage.getItem(ASKED_KEY());
    const list = raw ? (JSON.parse(raw) as number[]) : [];
    if (!list.includes(id)) list.push(id);
    window.sessionStorage.setItem(ASKED_KEY(), JSON.stringify(list));
  } catch {
    /* fall through */
  }
}

export function ExitPrompt({ id, title, applyHref }: { id: number; title: string; applyHref?: string }) {
  const [open, setOpen] = useState(false);
  const [remindOpen, setRemindOpen] = useState(false);
  const [date, setDate] = useState(inDays(7));
  const { statusOf, set } = useTracker();
  const { set: setReminder } = useReminders();
  /* Set when the apply link is opened from this page, which upgrades the
   * trigger from "might be leaving" to "has been to apply". */
  const wentToApply = useRef(false);

  const status = statusOf(id);

  const ask = useCallback(() => {
    if (alreadyAsked(id)) return;
    /* Nothing to ask: they have already told us they applied. */
    if (status === "applied" || status === "accepted" || status === "rejected") return;
    markAsked(id);
    setOpen(true);
  }, [id, status]);

  /* Signal 1 — they opened the apply link and came back. */
  useEffect(() => {
    if (!applyHref) return;
    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a) return;
      /* Only an outbound link counts. An internal one is navigation within the
         portal and says nothing about applying. */
      if (a.target === "_blank" || (a.hostname && a.hostname !== window.location.hostname)) {
        wentToApply.current = true;
      }
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [applyHref]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (!wentToApply.current) return;
      wentToApply.current = false;
      ask();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [ask]);

  /* Signal 2 — desktop exit intent. Pointer leaves through the top edge. */
  useEffect(() => {
    /* A coarse pointer has no meaningful mouseleave, and firing this on touch
       would mean a dialog on every scroll gesture that overshoots. */
    if (window.matchMedia?.("(pointer: coarse)").matches) return;
    const onLeave = (e: MouseEvent) => {
      if (e.clientY > 8) return;
      if (e.relatedTarget) return;
      ask();
    };
    document.addEventListener("mouseout", onLeave);
    return () => document.removeEventListener("mouseout", onLeave);
  }, [ask]);

  /* Escape closes, and the page behind must not scroll under the dialog. */
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", esc);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", esc);
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  const answer = (next: "applied" | "planning" | null) => {
    if (next) set(id, next);
    setOpen(false);
  };

  return (
    <div className={s.scrim} onMouseDown={() => setOpen(false)}>
      <div
        className={s.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="exit-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 id="exit-title" className={s.title}>
          Before you go
        </h2>
        <p className={`${s.sub} clamp-2`}>{title}</p>

        {!remindOpen ? (
          <>
            <p className={s.question}>Did you apply?</p>
            <div className={s.actions}>
              <button type="button" className={s.primary} onClick={() => answer("applied")}>
                <Icon name="check" size={16} />
                Yes, I applied
              </button>
              <button type="button" className={s.secondary} onClick={() => answer("planning")}>
                Not yet — still planning
              </button>
              <button type="button" className={s.secondary} onClick={() => answer(null)}>
                Not a fit for me
              </button>
            </div>

            {/* The third thing a student actually wants here: not an answer
                yet, but a nudge later. */}
            <button type="button" className={s.remindLink} onClick={() => setRemindOpen(true)}>
              <Icon name="clock" size={14} />
              Remind me about this
            </button>
          </>
        ) : (
          <>
            <p className={s.question}>When should this come back?</p>
            <div className={s.quick}>
              {[
                { label: "In 3 days", days: 3 },
                { label: "In a week", days: 7 },
                { label: "In 2 weeks", days: 14 },
                { label: "In a month", days: 30 },
              ].map((q) => (
                <button
                  key={q.days}
                  type="button"
                  className={[s.chip, date === inDays(q.days) ? s.chipOn : null].filter(Boolean).join(" ")}
                  onClick={() => setDate(inDays(q.days))}
                >
                  {q.label}
                </button>
              ))}
            </div>

            <label className={s.dateRow}>
              <span className={s.dateLabel}>Or pick a date</span>
              <input
                type="date"
                className={s.date}
                value={date}
                min={new Date().toISOString().slice(0, 10)}
                onChange={(e) => setDate(e.target.value)}
              />
            </label>

            {/* Said plainly, because nothing in this project sends anything.
                A reminder that claimed to email would be a promise no code
                keeps. */}
            <p className={s.note}>
              It will be waiting for you in the portal that day. We do not send email or notifications yet.
            </p>

            <div className={s.actions}>
              <button
                type="button"
                className={s.primary}
                onClick={() => {
                  setReminder(id, date);
                  set(id, "interested");
                  setOpen(false);
                }}
              >
                Remind me
              </button>
              <button type="button" className={s.secondary} onClick={() => setRemindOpen(false)}>
                Back
              </button>
            </div>
          </>
        )}

        <button type="button" className={s.dismiss} onClick={() => setOpen(false)}>
          Not now
        </button>
      </div>
    </div>
  );
}
