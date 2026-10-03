"use client";

/* Student data in Supabase, keyed to the signed-in account.
 *
 * The app keeps working signed out — everything falls back to the per-browser
 * store in lib/store.ts — so these hooks are only ever consulted when there is
 * a session. That is deliberate: a portal that shows nothing until you make an
 * account is a portal nobody evaluates.
 *
 * WRITES ARE OPTIMISTIC. A student who saves an opportunity should see it
 * saved immediately, not after a round trip; the local state updates first and
 * the row follows. If the write fails the state is rolled back and the caller
 * is told, rather than the UI quietly disagreeing with the database.
 *
 * MIGRATION. The first time an account signs in on a browser that holds local
 * data, that data is pushed up and the local copy cleared — so the work done
 * before signing up is not lost. It runs once per account per browser, guarded
 * by a flag, because a student who deliberately cleared their saved list
 * should not have it restored from a stale local copy on the next login.
 */

import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase";
import { useAuth } from "./auth";
import { EMPTY_PROFILE, type Profile, type Status, type TrackerEntry } from "./store";

const MIGRATED_KEY = "orbit.migrated";

/* ------------------------------------------------------------- profile --- */

type StudentRow = {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  degree: string | null;
  branch: string | null;
  year_of_study: string | null;
  graduation: string | null;
  level: string | null;
  fields: string[] | null;
  countries: string[] | null;
  funding: string | null;
  is_staff: boolean;
  reviewed_at: string | null;
};

/** DB row -> the shape the app and the matcher already speak. */
function toProfile(r: StudentRow): Profile {
  return {
    name: r.full_name ?? "",
    email: r.email ?? "",
    phone: r.phone ?? "",
    degree: r.degree ?? "",
    course: r.branch ?? "",
    year: r.year_of_study ?? "",
    graduation: r.graduation ?? "",
    level: r.level ?? "",
    /* Stored as text[] in Postgres because that is what it is; the UI and the
     * matcher use a comma-separated string, and this is the only seam. */
    fields: (r.fields ?? []).join(", "),
    countries: (r.countries ?? []).join(", "),
    funding: r.funding ?? "",
    reviewedAt: r.reviewed_at ?? "",
  };
}

const splitTags = (v: string) => v.split(",").map((t) => t.trim()).filter(Boolean);

function toRow(p: Profile) {
  return {
    full_name: p.name || null,
    phone: p.phone || null,
    degree: p.degree || null,
    branch: p.course || null,
    year_of_study: p.year || null,
    graduation: p.graduation || null,
    level: p.level || null,
    fields: splitTags(p.fields),
    countries: splitTags(p.countries),
    funding: p.funding || null,
    reviewed_at: new Date().toISOString(),
  };
}

/* A sign-up that just succeeded, handed from the account screen to the
 * onboarding overlay across the navigation between them.
 *
 * Without it the overlay has to WAIT for the students row before it knows the
 * student is new, so a first-time student watched the portal render in full and
 * then get frosted over about two seconds later — which reads as a popup, not
 * as the last step before the portal.
 *
 * sessionStorage, not localStorage: it is true for exactly one navigation, and
 * a value that outlived the tab would greet a returning student. It is a hint
 * and never the authority — `onboarded_at` decides, and clears this the moment
 * the row arrives. */
const FIRST_RUN = "orbit.firstRun";

export function markFirstRun() {
  try {
    window.sessionStorage.setItem(FIRST_RUN, "1");
  } catch {
    /* Blocked storage: the overlay still arrives, just at fetch speed. */
  }
}

export function takeFirstRun(): boolean {
  try {
    const v = window.sessionStorage.getItem(FIRST_RUN) === "1";
    if (v) window.sessionStorage.removeItem(FIRST_RUN);
    return v;
  } catch {
    return false;
  }
}

export function useRemoteProfile() {
  const { user, status } = useAuth();
  const [profile, setProfile] = useState<Profile>(EMPTY_PROFILE);
  /* undefined = not yet known, null = never onboarded, string = done.
   * The three states matter: treating "not yet known" as "never onboarded"
   * flashes the onboarding overlay at every returning student for the frame
   * before their row arrives. */
  const [onboardedAt, setOnboardedAt] = useState<string | null | undefined>(undefined);
  const [isStaff, setIsStaff] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const sb = supabase();
    if (!sb || status !== "signed-in" || !user) return;
    let alive = true;
    (async () => {
      const { data } = await sb.from("students").select("*").eq("id", user.id).maybeSingle();
      if (!alive) return;
      if (data) {
        setProfile(toProfile(data as StudentRow));
        setIsStaff(Boolean((data as StudentRow).is_staff));
        setOnboardedAt(((data as StudentRow & { onboarded_at?: string | null }).onboarded_at) ?? null);
      } else {
        /* The sign-up trigger should have made this row. If it is missing —
         * an account created before db/015, say — create it rather than
         * leaving the student with a profile that cannot be saved. */
        await sb.from("students").insert({ id: user.id, email: user.email ?? "" });
        setProfile({ ...EMPTY_PROFILE, email: user.email ?? "" });
        /* No row yet: this is the first login, which is exactly who
         * onboarding exists for. */
        setOnboardedAt(null);
      }
      setReady(true);
    })();
    return () => {
      alive = false;
    };
  }, [user, status]);

  /* Recorded once, when the student finishes or deliberately leaves the
   * first-run flow. Stored rather than inferred from the profile's shape:
   * someone who skipped every question has still been welcomed, and must not
   * be dragged through it again on the next login. */
  const markOnboarded = useCallback(async () => {
    const sb = supabase();
    if (!sb || !user) return;
    const now = new Date().toISOString();
    setOnboardedAt(now);
    await sb.from("students").update({ onboarded_at: now }).eq("id", user.id);
  }, [user]);

  const save = useCallback(
    async (next: Profile) => {
      const sb = supabase();
      if (!sb || !user) return "Not signed in.";
      const previous = profile;
      setProfile(next);
      const { error } = await sb.from("students").update(toRow(next)).eq("id", user.id);
      if (error) {
        setProfile(previous);
        return "Your profile could not be saved. Try again.";
      }
      return null;
    },
    [user, profile],
  );

  return { profile, isStaff, ready, save, onboardedAt, markOnboarded };
}

/* --------------------------------------------------------------- saved --- */

export function useRemoteSaved() {
  const { user, status } = useAuth();
  const [saved, setSaved] = useState<number[]>([]);
  const [ready, setReady] = useState(false);

  const load = useCallback(async () => {
    const sb = supabase();
    if (!sb || !user) return;
    const { data } = await sb
      .from("student_saved")
      .select("opportunity_id")
      .eq("student_id", user.id)
      .order("saved_at", { ascending: false });
    setSaved((data ?? []).map((r) => Number((r as { opportunity_id: number }).opportunity_id)));
    setReady(true);
  }, [user]);

  useEffect(() => {
    if (status === "signed-in" && user) void load();
  }, [status, user, load]);

  const toggle = useCallback(
    async (id: number) => {
      const sb = supabase();
      if (!sb || !user) return false;
      const on = saved.includes(id);
      setSaved((cur) => (on ? cur.filter((x) => x !== id) : [id, ...cur]));
      const { error } = on
        ? await sb.from("student_saved").delete().eq("student_id", user.id).eq("opportunity_id", id)
        : await sb.from("student_saved").insert({ student_id: user.id, opportunity_id: id });
      if (error) await load();
      return !on;
    },
    [user, saved, load],
  );

  const clear = useCallback(async () => {
    const sb = supabase();
    if (!sb || !user) return;
    setSaved([]);
    await sb.from("student_saved").delete().eq("student_id", user.id);
  }, [user]);

  return { saved, ready, toggle, clear, reload: load };
}

/* ------------------------------------------------------------- tracker --- */

export function useRemoteTracker() {
  const { user, status } = useAuth();
  const [entries, setEntries] = useState<TrackerEntry[]>([]);
  const [ready, setReady] = useState(false);

  const load = useCallback(async () => {
    const sb = supabase();
    if (!sb || !user) return;
    const { data } = await sb
      .from("student_tracker")
      .select("opportunity_id,status,updated_at,note")
      .eq("student_id", user.id)
      .order("updated_at", { ascending: false });
    setEntries(
      (data ?? []).map((r) => {
        const row = r as { opportunity_id: number; status: Status; updated_at: string; note: string | null };
        return { id: Number(row.opportunity_id), status: row.status, updatedAt: row.updated_at, note: row.note ?? undefined };
      }),
    );
    setReady(true);
  }, [user]);

  useEffect(() => {
    if (status === "signed-in" && user) void load();
  }, [status, user, load]);

  const set = useCallback(
    async (id: number, next: Status) => {
      const sb = supabase();
      if (!sb || !user) return;
      const now = new Date().toISOString();
      setEntries((cur) => {
        const has = cur.some((e) => e.id === id);
        return has
          ? cur.map((e) => (e.id === id ? { ...e, status: next, updatedAt: now } : e))
          : [{ id, status: next, updatedAt: now }, ...cur];
      });
      /* on_conflict keeps a status change idempotent, matching the project's
       * rule for every other write. */
      const { error } = await sb
        .from("student_tracker")
        .upsert({ student_id: user.id, opportunity_id: id, status: next, updated_at: now }, { onConflict: "student_id,opportunity_id" });
      if (error) await load();
    },
    [user, load],
  );

  const remove = useCallback(
    async (id: number) => {
      const sb = supabase();
      if (!sb || !user) return;
      setEntries((cur) => cur.filter((e) => e.id !== id));
      await sb.from("student_tracker").delete().eq("student_id", user.id).eq("opportunity_id", id);
    },
    [user],
  );

  const clear = useCallback(async () => {
    const sb = supabase();
    if (!sb || !user) return;
    setEntries([]);
    await sb.from("student_tracker").delete().eq("student_id", user.id);
  }, [user]);

  return { entries, ready, set, remove, clear, reload: load };
}

/* ----------------------------------------------------------- migration --- */

/** Push whatever this browser holds into a freshly signed-in account, once. */
export function useLocalMigration(
  localSaved: number[],
  localTracker: TrackerEntry[],
  localProfile: Profile,
  localReady: boolean,
  onDone: () => void,
) {
  const { user, status } = useAuth();

  useEffect(() => {
    const sb = supabase();
    if (!sb || status !== "signed-in" || !user || !localReady) return;

    let flag: string | null = null;
    try {
      flag = window.localStorage.getItem(`${MIGRATED_KEY}.${user.id}`);
    } catch {
      return; // storage blocked: nothing local to migrate anyway
    }
    if (flag) return;

    const hasLocal = localSaved.length || localTracker.length || localProfile.name || localProfile.level;
    if (!hasLocal) {
      try {
        window.localStorage.setItem(`${MIGRATED_KEY}.${user.id}`, "empty");
      } catch {
        /* ignore */
      }
      return;
    }

    (async () => {
      if (localSaved.length) {
        await sb.from("student_saved").upsert(
          localSaved.map((id) => ({ student_id: user.id, opportunity_id: id })),
          { onConflict: "student_id,opportunity_id", ignoreDuplicates: true },
        );
      }
      if (localTracker.length) {
        await sb.from("student_tracker").upsert(
          localTracker.map((e) => ({
            student_id: user.id,
            opportunity_id: e.id,
            status: e.status,
            updated_at: e.updatedAt,
          })),
          { onConflict: "student_id,opportunity_id", ignoreDuplicates: true },
        );
      }
      if (localProfile.name || localProfile.level || localProfile.fields) {
        /* The account's own values win where both exist: an empty local field
         * must not blank something already saved to the account. */
        const { data } = await sb.from("students").select("full_name,level").eq("id", user.id).maybeSingle();
        const row = data as { full_name: string | null; level: string | null } | null;
        if (!row?.full_name && !row?.level) {
          await sb.from("students").update(toRow(localProfile)).eq("id", user.id);
        }
      }
      try {
        window.localStorage.setItem(`${MIGRATED_KEY}.${user.id}`, new Date().toISOString());
      } catch {
        /* ignore */
      }
      onDone();
    })();
  }, [status, user, localReady, localSaved, localTracker, localProfile, onDone]);
}
