/* The conversation, for as long as the tab is open.
 *
 * THE LIFETIME, exactly:
 *
 *   navigate Rover -> Explore -> Rover   keeps the conversation
 *   re-render, re-mount, route change     keeps the conversation
 *   reload / F5 / restore the tab         KEEPS the conversation
 *   close the tab, or open a new one      starts a new one
 *   a different account in this browser    starts a new one
 *
 * WHY sessionStorage, AND NOT THE OTHER THREE. This file used to be a module
 * variable, which meant a reload threw the chat away — defensible, and wrong
 * for the way the screen is actually used: a student reloads after signing in,
 * after a network blip, or by reflex, and losing six turns of narrowing down to
 * "fully funded, Canada, closes after March" is a real loss, not a clean slate.
 *
 * sessionStorage survives a reload and dies with the tab. localStorage and
 * IndexedDB would outlive it — a conversation naming a student's course, year
 * and what they can afford, left on a shared library machine for whoever sits
 * down next. A cookie would also put all of it on every request to the server.
 * So: the one store whose lifetime is the thing being asked for.
 *
 * WHAT IS NOT STORED. Nothing is written anywhere else, and nothing leaves the
 * browser. `streaming` is dropped on the way in (see `revive`): a turn that was
 * mid-answer when the tab reloaded is finished as far as anything can tell, and
 * restoring it as "still arriving" would leave a caret blinking at a stream
 * that no longer exists.
 *
 * WHY AN OWNER. The session is the tab, not the account — signing in does not
 * resume an old chat. But two people can share one tab: somebody signs out and
 * somebody else signs in without closing it. `owner` exists only to make that
 * case discard the transcript. It is a guard against leaking a conversation
 * sideways, not a key anything is looked up BY.
 *
 * EVERY read and write is wrapped. Private mode, a storage quota, a disabled
 * origin: in all of them the module cache below still works for the life of the
 * page, which is what the screen had before. Storage is an upgrade on that, not
 * a dependency of it. */

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

const KEY = "rof.v1.rover.session";
/* A ceiling, not a target. Browsers give an origin about 5MB of sessionStorage
 * and a turn carrying six card rows is a few KB, so this is reached only by a
 * very long conversation — at which point the OLDEST turns are dropped, since
 * the end of a conversation is the part still being talked about. */
const MAX_CHARS = 1_500_000;

type Stored = { owner: string | null; seq: number; messages: Message[] };

let owner: string | null = null;
let messages: Message[] = [];
let seq = 1;
/* Whether this runtime has already looked in storage. Without it, a mount
 * after `clearSession` would read the old transcript straight back out. */
let loaded = false;

const store = (): Storage | null => {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    /* Storage disabled for this origin. The module cache still works. */
    return null;
  }
};

/** Monotonic within the tab, so React keys stay stable across re-mounts and
 *  across a reload — the counter is stored with the transcript. */
export const nextId = () => seq++;

/* A stored turn is data from a previous page load, so it is checked rather
 * than trusted: a hand-edited or half-written record must not take the screen
 * down on mount. */
function revive(raw: unknown): Message[] {
  if (!Array.isArray(raw)) return [];
  const out: Message[] = [];
  for (const m of raw) {
    if (!m || typeof m !== "object") continue;
    const msg = m as Partial<Message>;
    if (typeof msg.id !== "number") continue;
    if (msg.role !== "student" && msg.role !== "rover") continue;
    out.push({
      id: msg.id,
      role: msg.role,
      text: typeof msg.text === "string" ? msg.text : "",
      activity: Array.isArray(msg.activity) ? msg.activity.filter((a) => typeof a === "string") : [],
      picks: Array.isArray(msg.picks) ? (msg.picks.filter((p) => p && Array.isArray(p.items)) as Picks[]) : [],
      ...(typeof msg.error === "string" ? { error: msg.error } : {}),
      ...(typeof msg.retry === "string" ? { retry: msg.retry } : {}),
      /* Never restored as streaming. There is no stream to restore. */
    });
  }
  return out;
}

function write(): void {
  const s = store();
  if (!s) return;
  try {
    let keep = messages;
    let body = JSON.stringify({ owner, seq, messages: keep } satisfies Stored);
    /* Drop from the front until it fits. A conversation long enough to hit
       this has already scrolled its early turns out of sight. */
    while (body.length > MAX_CHARS && keep.length > 2) {
      keep = keep.slice(2);
      body = JSON.stringify({ owner, seq, messages: keep } satisfies Stored);
    }
    s.setItem(KEY, body);
  } catch {
    /* Quota, private mode, or storage turned off mid-session. The screen keeps
       working off the module cache; only the reload-survival is lost. */
  }
}

/**
 * The conversation so far for `who`, restored from the tab's storage on the
 * first call of a page load, and started fresh if the tab last belonged to
 * somebody else. `who` is any stable per-account string — the caller passes the
 * signed-in user's id, or a constant for a signed-out visitor. It is compared,
 * never stored as a key.
 */
export function openSession(who: string): Message[] {
  if (!loaded) {
    loaded = true;
    const s = store();
    try {
      const raw = s?.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<Stored>;
        if (parsed && parsed.owner === who) {
          messages = revive(parsed.messages);
          owner = who;
          /* Past every id in hand, so a new turn cannot collide with a
             restored one and give React two children with one key. */
          const highest = messages.reduce((n, m) => Math.max(n, m.id), 0);
          seq = Math.max(typeof parsed.seq === "number" ? parsed.seq : 1, highest + 1);
        } else {
          /* Somebody else's conversation, or a record with no owner. */
          s?.removeItem(KEY);
        }
      }
    } catch {
      /* Unreadable or not JSON: treat it as no conversation at all. */
      try {
        s?.removeItem(KEY);
      } catch {
        /* nothing further to try */
      }
    }
  }

  if (owner !== who) {
    owner = who;
    messages = [];
    write();
  }
  return messages;
}

/** Replace the transcript. Called on every write so the store and the screen
 *  cannot drift; there is no partial update. */
export function saveSession(next: Message[]): Message[] {
  messages = next;
  write();
  return messages;
}

/** Throw the conversation away — "New conversation", and signing out. */
export function clearSession(): void {
  messages = [];
  seq = 1;
  try {
    store()?.removeItem(KEY);
  } catch {
    /* Already gone, or storage is unavailable; the cache above is cleared. */
  }
}
