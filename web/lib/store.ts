"use client";

/* Per-browser state: saved opportunities, the compare selection, application
 * tracker status, and the student's own preferences.
 *
 * Why localStorage and not the database: this app has no accounts. Adding one
 * would mean holding a student's name, email and academic record, and the
 * honest version of that is a real auth system with a real privacy notice, not
 * a column on a public table. So this state never leaves the device. The
 * consequences are stated in the UI rather than hidden: it does not follow the
 * student to a second browser, and clearing site data clears it.
 *
 * Everything read back is treated as untrusted: a hand-edited localStorage key
 * is the one input to this app that a person can author freely, so every
 * loader validates shape and drops anything it does not recognise instead of
 * letting a bad value reach a render. */

import { useCallback, useEffect, useState } from "react";

/* ---------------------------------------------------------------- identity ---
 * Every student's data is stored against a user id, so two people sharing a
 * machine do not see each other's saved list, tracker or profile.
 *
 * The id is generated locally, because this app has no accounts yet. It is a
 * real identity in the only sense available here — it is stable, it scopes
 * every key, and nothing is stored outside its namespace — but it is per
 * BROWSER, not per person: it does not follow a student to another device, and
 * clearing site data mints a new one. That is said plainly on /profile rather
 * than implied away.
 *
 * It is also the migration seam. When Supabase Auth arrives, `currentUserId()`
 * returns the authenticated id instead and every key moves with it; the
 * captured campus email is already recorded against the local id so the two
 * can be reconciled.
 */

const ROOT = "rof.v1.";
const UID_KEY = `${ROOT}uid`;
const UID_EMAIL_KEY = `${ROOT}uidEmail`;

/* Keys that belong to the device rather than to a person. The theme and the
 * ordering seed are not worth partitioning: both are preferences of whoever is
 * sitting there, not records about a student. */
const DEVICE_KEYS = new Set(["uid", "uidEmail", "theme", "seed", "adminToken"]);

function newId(): string {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID().replace(/-/g, "");
  } catch {
    /* fall through */
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

export function currentUserId(): string {
  if (typeof window === "undefined") return "anon";
  try {
    let id = window.localStorage.getItem(UID_KEY);
    if (!id) {
      id = newId();
      window.localStorage.setItem(UID_KEY, id);
      /* First run on this browser: adopt anything written before namespacing
       * existed, so an early tester does not lose their saved list. */
      migrateLegacy(id);
    }
    return id;
  } catch {
    /* Storage blocked. Everything still works for this page view under a
     * throwaway id; nothing is persisted, which is the correct outcome. */
    return "anon";
  }
}

/** Record which campus account this local id belongs to, for a later migration. */
export function linkUserEmail(email: string): void {
  if (typeof window === "undefined" || !email.trim()) return;
  try {
    const map = JSON.parse(window.localStorage.getItem(UID_EMAIL_KEY) ?? "{}") as Record<string, string>;
    map[currentUserId()] = email.trim().toLowerCase();
    window.localStorage.setItem(UID_EMAIL_KEY, JSON.stringify(map));
  } catch {
    /* Not load-bearing: the profile still holds the address. */
  }
}

function migrateLegacy(id: string): void {
  try {
    for (const key of ["saved", "compare", "tracker", "profile", "currency"]) {
      const legacy = window.localStorage.getItem(ROOT + key);
      if (legacy == null) continue;
      window.localStorage.setItem(`${ROOT}u.${id}.${key}`, legacy);
      window.localStorage.removeItem(ROOT + key);
    }
  } catch {
    /* Nothing to recover from; the app starts empty. */
  }
}

/** Full storage key for a logical key, scoped to the current student. */
function storageKey(key: string): string {
  return DEVICE_KEYS.has(key) ? ROOT + key : `${ROOT}u.${currentUserId()}.${key}`;
}

const PREFIX = ROOT;

/* §53: the status model, in order. The tracker's columns are these, and the
 * order is the order an application actually moves through. */
export const STATUSES = ["interested", "planning", "applied", "next_step", "accepted", "rejected"] as const;
export type Status = (typeof STATUSES)[number];

export const STATUS_LABELS: Record<Status, string> = {
  interested: "Interested",
  planning: "Planning",
  applied: "Applied",
  next_step: "Next step",
  accepted: "Accepted",
  rejected: "Rejected",
};

/* §55: colour sparingly, and never on every row. Neutral is a real choice here. */
export const STATUS_TONE: Record<Status, "neutral" | "info" | "compare" | "soon" | "funding" | "urgent"> = {
  interested: "neutral",
  planning: "info",
  applied: "compare",
  next_step: "soon",
  accepted: "funding",
  rejected: "urgent",
};

export type TrackerEntry = { id: number; status: Status; updatedAt: string; note?: string };

/* The student profile. The first five fields feed the matcher
 * (packages/core/src/match.ts); the rest identify and address the student and
 * are collected at onboarding.
 *
 * All of it stays in this browser. There are no accounts, so there is no
 * server-side record to leak — and equally no sync to another device. That
 * trade is stated on /profile rather than hidden, and it is why a phone number
 * is optional: asking for one we cannot protect any better than localStorage
 * would be worse than not asking. */
export type Profile = {
  level: string;
  fields: string;
  countries: string;
  funding: string;
  graduation: string;
  name: string;
  degree: string;
  course: string;
  phone: string;
  email: string;
  year: string;
  /** ISO timestamp of the last time the student reviewed their details. */
  reviewedAt: string;
};

export const EMPTY_PROFILE: Profile = {
  level: "", fields: "", countries: "", funding: "", graduation: "",
  name: "", degree: "", course: "", phone: "", email: "", year: "", reviewedAt: "",
};

/* How long before we ask the student to look over their details again. A
 * profile goes stale in a predictable way here — a student changes year every
 * twelve months and their interests drift — so the prompt is a nudge on
 * /profile, never a blocking modal. */
export const PROFILE_REVIEW_DAYS = 120;

export const MAX_COMPARE = 2; // §37: the comparison view is built for two.

/* ------------------------------------------------------------ raw access --- */

function read<T>(key: string, parse: (raw: unknown) => T | null, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(storageKey(key));
    if (!raw) return fallback;
    const value = parse(JSON.parse(raw));
    return value ?? fallback;
  } catch {
    /* A private window, blocked site data, or a hand-edited value. None of
     * them is an error the student should see — the page just starts empty. */
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(key), JSON.stringify(value));
    /* Same-tab listeners: the storage event only fires in OTHER tabs, so the
     * sidebar counts in this one would never update without this. */
    window.dispatchEvent(new CustomEvent("rof:store", { detail: key }));
  } catch {
    /* Out of quota or storage denied. The in-memory state still updated, so
     * the interaction completed; it simply will not survive a reload. */
  }
}

const ids = (raw: unknown): number[] | null =>
  Array.isArray(raw) ? raw.filter((n): n is number => Number.isInteger(n) && n > 0).slice(0, 500) : null;

const tracker = (raw: unknown): TrackerEntry[] | null => {
  if (!Array.isArray(raw)) return null;
  return raw
    .filter(
      (e): e is TrackerEntry =>
        !!e &&
        typeof e === "object" &&
        Number.isInteger((e as TrackerEntry).id) &&
        (STATUSES as readonly string[]).includes((e as TrackerEntry).status),
    )
    .slice(0, 300)
    .map((e) => ({
      id: e.id,
      status: e.status,
      updatedAt: typeof e.updatedAt === "string" ? e.updatedAt : new Date().toISOString(),
      note: typeof e.note === "string" ? e.note.slice(0, 400) : undefined,
    }));
};

const profile = (raw: unknown): Profile | null => {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const str = (v: unknown, n = 200) => (typeof v === "string" ? v.slice(0, n) : "");
  return {
    level: str(o.level),
    fields: str(o.fields),
    countries: str(o.countries),
    funding: str(o.funding),
    graduation: str(o.graduation),
    name: str(o.name, 120),
    degree: str(o.degree, 120),
    course: str(o.course, 120),
    phone: str(o.phone, 40),
    email: str(o.email, 160),
    year: str(o.year, 40),
    reviewedAt: str(o.reviewedAt, 40),
  };
};

/* ---------------------------------------------------------------- hooks ---
 * Each hook starts from the fallback and loads on mount, never during render.
 * Reading localStorage in the initial state would make the server HTML and the
 * first client render disagree, which React resolves by throwing the whole
 * tree away. The one-frame empty state is the correct trade. */

function usePersisted<T>(key: string, parse: (raw: unknown) => T | null, fallback: T) {
  const [value, setValue] = useState<T>(fallback);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setValue(read(key, parse, fallback));
    setReady(true);

    const sync = () => setValue(read(key, parse, fallback));
    const onStore = (e: Event) => {
      if ((e as CustomEvent<string>).detail === key) sync();
    };
    window.addEventListener("storage", sync);
    window.addEventListener("rof:store", onStore);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("rof:store", onStore);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const commit = useCallback(
    (next: T) => {
      setValue(next);
      write(key, next);
    },
    [key],
  );

  return { value, ready, commit };
}

export function useSaved() {
  const { value, ready, commit } = usePersisted<number[]>("saved", ids, []);
  return {
    saved: value,
    ready,
    isSaved: (id: number) => value.includes(id),
    toggle: (id: number) => {
      const next = value.includes(id) ? value.filter((x) => x !== id) : [id, ...value];
      commit(next);
      return !value.includes(id);
    },
    remove: (id: number) => commit(value.filter((x) => x !== id)),
    clear: () => commit([]),
  };
}

export function useCompare() {
  const { value, ready, commit } = usePersisted<number[]>("compare", ids, []);
  return {
    compare: value.slice(0, MAX_COMPARE),
    ready,
    isCompared: (id: number) => value.includes(id),
    /* §37: the UI must not allow a third selection. Rather than silently
     * refusing the click, the oldest choice makes way — which is what a
     * student who has already picked two and clicks a third actually means. */
    toggle: (id: number) => {
      if (value.includes(id)) {
        commit(value.filter((x) => x !== id));
        return { added: false, displaced: null as number | null };
      }
      const next = [...value, id];
      const displaced = next.length > MAX_COMPARE ? next.shift()! : null;
      commit(next);
      return { added: true, displaced };
    },
    remove: (id: number) => commit(value.filter((x) => x !== id)),
    clear: () => commit([]),
  };
}

export function useTracker() {
  const { value, ready, commit } = usePersisted<TrackerEntry[]>("tracker", tracker, []);
  return {
    entries: value,
    ready,
    statusOf: (id: number) => value.find((e) => e.id === id)?.status ?? null,
    set: (id: number, status: Status) => {
      const now = new Date().toISOString();
      const existing = value.find((e) => e.id === id);
      commit(
        existing
          ? value.map((e) => (e.id === id ? { ...e, status, updatedAt: now } : e))
          : [{ id, status, updatedAt: now }, ...value],
      );
    },
    remove: (id: number) => commit(value.filter((e) => e.id !== id)),
    clear: () => commit([]),
  };
}

/** The current student's id, available to render. */
export function useUserId(): string {
  const [id, setId] = useState("");
  useEffect(() => setId(currentUserId()), []);
  return id;
}

export function useProfile() {
  const { value, ready, commit } = usePersisted<Profile>("profile", profile, EMPTY_PROFILE);

  const started = Boolean(value.name || value.level || value.fields.trim());
  const reviewedDays = value.reviewedAt
    ? Math.floor((Date.now() - Date.parse(value.reviewedAt)) / 86_400_000)
    : null;

  return {
    profile: value,
    ready,
    /** Has the student filled in anything at all? Drives the onboarding prompt. */
    started,
    /** Stale enough to ask them to look it over again. */
    needsReview: ready && started && (reviewedDays == null || reviewedDays > PROFILE_REVIEW_DAYS),
    reviewedDays,
    save: (next: Profile) => {
      /* Tie this browser's id to the campus account, so a future sign-in can
       * reconcile locally-held data with a server profile. */
      if (next.email) linkUserEmail(next.email);
      commit({ ...next, reviewedAt: new Date().toISOString() });
    },
  };
}

/** The currency switch. One key, so every screen agrees. */
export function useCurrency() {
  const { value, ready, commit } = usePersisted<"source" | "aed">(
    "currency",
    (raw) => (raw === "aed" || raw === "source" ? raw : null),
    "source",
  );
  return { currency: value, ready, setCurrency: commit, toggle: () => commit(value === "aed" ? "source" : "aed") };
}

/* ---------------------------------------------------------------- session ---
 * The seed that stabilises the "mixed" ordering (lib/shuffle.ts).
 *
 * sessionStorage, not localStorage, and deliberately: it lasts as long as the
 * tab, so paging through chunks never reshuffles under the student, and a
 * visit tomorrow surfaces a different dozen listings instead of the same ones
 * forever. It is a random string with nothing derived from the device, carries
 * no identity, and the server hashes and discards it.
 */
export function useSessionSeed(): string {
  const [seed, setSeed] = useState("");

  useEffect(() => {
    let value = "";
    try {
      value = window.sessionStorage.getItem(storageKey("seed")) ?? "";
      if (!value) {
        value =
          typeof crypto !== "undefined" && crypto.randomUUID
            ? crypto.randomUUID().replace(/-/g, "")
            : Math.random().toString(36).slice(2) + Date.now().toString(36);
        window.sessionStorage.setItem(storageKey("seed"), value);
      }
    } catch {
      /* Private window or blocked storage: fall back to a per-mount seed. The
       * ordering is then stable for this page view, which is enough. */
      value = Math.random().toString(36).slice(2);
    }
    setSeed(value);
  }, []);

  return seed;
}
