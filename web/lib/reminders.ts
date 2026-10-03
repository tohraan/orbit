"use client";

/* Reminders a student sets on a specific opportunity.
 *
 * HONEST SCOPE, because the copy depends on it. Nothing in this project sends
 * anything: there is no email job, no push, no SMS — the onboarding phone
 * field says as much. A reminder here is a DATE THE PORTAL WILL SURFACE IT TO
 * YOU ON, shown when you next open the portal on or after that day. That is a
 * real feature and it is not a notification, so the UI must never imply a
 * message will arrive. Promising a push that no code sends is the one thing
 * this must not do.
 *
 * Stored per browser, like the rest of lib/store.ts's collections, and
 * namespaced by the same local user id so two people on one machine do not see
 * each other's. It survives a reload; it does not follow you to a phone. When
 * the tracker moves to the account (db/015 has the tables), this moves with it.
 */

import { useCallback, useEffect, useState } from "react";
import { currentUserId } from "./store";

export type Reminder = {
  id: number;
  /** YYYY-MM-DD. A reminder has no time of day, so it is a date, not a stamp. */
  date: string;
  createdAt: string;
};

const KEY = () => `rof.v1.u.${currentUserId()}.reminders`;

function read(): Reminder[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY());
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    /* Validated rather than trusted: localStorage is the one input to this app
     * a person can author freely, so a bad shape is dropped instead of being
     * allowed to reach a render. */
    return parsed.filter(
      (r): r is Reminder =>
        !!r &&
        typeof r.id === "number" &&
        typeof r.date === "string" &&
        /^\d{4}-\d{2}-\d{2}$/.test(r.date),
    );
  } catch {
    return [];
  }
}

function write(list: Reminder[]) {
  try {
    window.localStorage.setItem(KEY(), JSON.stringify(list));
    window.dispatchEvent(new CustomEvent("rof:reminders"));
  } catch {
    /* Storage blocked. Nothing persists, which is the correct outcome. */
  }
}

export function useReminders() {
  const [list, setList] = useState<Reminder[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setList(read());
    setReady(true);
    const sync = () => setList(read());
    window.addEventListener("rof:reminders", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("rof:reminders", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const set = useCallback((id: number, date: string) => {
    const next = [...read().filter((r) => r.id !== id), { id, date, createdAt: new Date().toISOString() }];
    setList(next);
    write(next);
  }, []);

  const remove = useCallback((id: number) => {
    const next = read().filter((r) => r.id !== id);
    setList(next);
    write(next);
  }, []);

  /* Everything whose day has arrived or passed. Read by whatever surfaces
   * them; kept here so "due" means one thing across the app. */
  const due = list.filter((r) => r.date <= new Date().toISOString().slice(0, 10));

  return { reminders: list, due, ready, set, remove, dateOf: (id: number) => list.find((r) => r.id === id)?.date ?? null };
}

/** Today + n days as YYYY-MM-DD, for the quick choices. */
export function inDays(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
