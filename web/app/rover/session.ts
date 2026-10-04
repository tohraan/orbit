/* The conversation, for as long as the page is loaded. And no longer.
 *
 * THE LIFETIME IS THE WHOLE POINT, so it is worth being exact about it:
 *
 *   navigate Rover -> Explore -> Rover   keeps the conversation
 *   re-render, re-mount, route change     keeps the conversation
 *   reload / F5 / reopen the tab          starts a new one
 *   a different account in this runtime   starts a new one
 *
 * A module-level variable gives precisely that. It lives in the JavaScript
 * heap of one page runtime: React unmounting the screen does not touch it, and
 * a reload throws the whole heap away, which is the "refresh means a fresh
 * chat" rule enforced by construction rather than by remembering to clear
 * something.
 *
 * WHY NOT sessionStorage, DESPITE THE NAME. sessionStorage SURVIVES a refresh
 * — that is its purpose — so it would restore the conversation across exactly
 * the boundary that is supposed to clear it. localStorage, IndexedDB and
 * cookies are worse again: they outlive the tab. Nothing here is written to
 * any of them, and nothing should be. A student's conversation mentions their
 * course, their year and what they can afford; keeping that in the heap means
 * it is gone when they close the tab, with nothing to clear up afterwards and
 * nothing left on a shared library machine.
 *
 * WHY AN OWNER, GIVEN THE IDENTITY IS NOT THE SESSION KEY. The session is the
 * page runtime, not the account — signing in does not resume an old chat, and
 * signing out does not save one. But two people CAN use one runtime: a shared
 * machine where somebody signs out and somebody else signs in without ever
 * reloading. `owner` exists only to make that case discard the transcript. It
 * is a guard against leaking a conversation sideways, not a way of addressing
 * stored chats, and nothing here is ever looked up BY it.
 */

import type { OpportunitySummary } from "@rof/core";

export type Picks = { items: OpportunitySummary[]; why: Record<string, string> };

export type Message = {
  id: number;
  role: "student" | "rover";
  text: string;
  /* Activity lines — "Searched fully funded masters — 6 found". Kept with the
   * message rather than thrown away, so the answer still shows its working
   * after it has finished arriving. */
  activity: string[];
  picks: Picks[];
  error?: string;
  streaming?: boolean;
  /* The text that produced this answer, kept on the failed turn so the error
   * state can offer to run it again. Only set when something went wrong. */
  retry?: string;
};

let owner: string | null = null;
let messages: Message[] = [];
let seq = 1;

/** Monotonic within the runtime, so React keys stay stable across re-mounts. */
export const nextId = () => seq++;

/**
 * The conversation so far for `who`, starting a new one if the runtime last
 * belonged to somebody else. `who` is any stable per-account string — the
 * caller passes the signed-in user's id, or a constant for a signed-out
 * visitor. It is compared, never stored as a key.
 */
export function openSession(who: string): Message[] {
  if (owner !== who) {
    owner = who;
    messages = [];
  }
  return messages;
}

/** Replace the transcript. Called on every write so the store and the screen
 *  cannot drift; there is no partial update. */
export function saveSession(next: Message[]): Message[] {
  messages = next;
  return messages;
}

/** Throw the conversation away — "New conversation", and signing out. */
export function clearSession(): void {
  messages = [];
}
