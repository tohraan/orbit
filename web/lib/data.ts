"use client";

/* One set of hooks for student data, whichever store is behind it.
 *
 * Signed in  -> Supabase, keyed to the account (lib/account.ts, db/015).
 * Signed out -> this browser only (lib/store.ts).
 *
 * The app above this line does not branch on auth at all: a screen asks for
 * `useSaved()` and gets a saved list. That matters because the signed-out path
 * is not a degraded mode to be tolerated — it is how anyone evaluates the
 * product before making an account, and it has to stay first-class.
 *
 * Both halves obey the same contract, including `ready`, so the existing
 * loading states keep working unchanged.
 */

import { useCallback, useState } from "react";
import { useAuth } from "./auth";
import { useLocalMigration, useRemoteProfile, useRemoteSaved, useRemoteTracker } from "./account";
import {
  useSaved as useLocalSaved,
  useTracker as useLocalTracker,
  useProfile as useLocalProfile,
  type Profile,
  type Status,
} from "./store";

export { MAX_COMPARE, STATUSES, STATUS_LABELS, STATUS_TONE, EMPTY_PROFILE, useCompare, useCurrency, useSessionSeed } from "./store";
export type { Profile, Status, TrackerEntry } from "./store";

/** True once the account's data has been pulled, or immediately when signed out. */
export function useSaved() {
  const { status } = useAuth();
  const local = useLocalSaved();
  const remote = useRemoteSaved();
  const signedIn = status === "signed-in";

  return {
    saved: signedIn ? remote.saved : local.saved,
    /* While auth is still resolving, report NOT ready — otherwise a screen
     * renders its empty state for a frame and then fills in, which reads as
     * data appearing out of nowhere. */
    ready: status === "loading" ? false : signedIn ? remote.ready : local.ready,
    isSaved: (id: number) => (signedIn ? remote.saved.includes(id) : local.isSaved(id)),
    toggle: (id: number) => {
      if (!signedIn) return local.toggle(id);
      void remote.toggle(id);
      return !remote.saved.includes(id);
    },
    remove: (id: number) => (signedIn ? void remote.toggle(id) : local.remove(id)),
    clear: () => (signedIn ? void remote.clear() : local.clear()),
  };
}

export function useTracker() {
  const { status } = useAuth();
  const local = useLocalTracker();
  const remote = useRemoteTracker();
  const signedIn = status === "signed-in";
  const entries = signedIn ? remote.entries : local.entries;

  return {
    entries,
    ready: status === "loading" ? false : signedIn ? remote.ready : local.ready,
    statusOf: (id: number) => entries.find((e) => e.id === id)?.status ?? null,
    set: (id: number, next: Status) => (signedIn ? void remote.set(id, next) : local.set(id, next)),
    remove: (id: number) => (signedIn ? void remote.remove(id) : local.remove(id)),
    clear: () => (signedIn ? void remote.clear() : local.clear()),
  };
}

export function useProfile() {
  const { status } = useAuth();
  const local = useLocalProfile();
  const remote = useRemoteProfile();
  const signedIn = status === "signed-in";
  const [, bump] = useState(0);

  /* Carry anything done before signing up into the new account, once. */
  useLocalMigration(
    local.saved ?? [],
    local.entries ?? [],
    local.profile,
    local.ready,
    useCallback(() => bump((n) => n + 1), []),
  );

  const profile = signedIn ? remote.profile : local.profile;
  const started = Boolean(profile.name || profile.level || profile.fields.trim());

  return {
    profile,
    isStaff: signedIn ? remote.isStaff : false,
    ready: status === "loading" ? false : signedIn ? remote.ready : local.ready,
    started,
    needsReview: !signedIn && local.needsReview,
    save: (next: Profile) => {
      if (signedIn) return remote.save(next);
      local.save(next);
      return Promise.resolve(null);
    },
  };
}
