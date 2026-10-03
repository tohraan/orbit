"use client";

/* Who is at the desk.
 *
 * Smaller than the portal's auth provider on purpose: there is no password
 * reset, no recovery flow and no per-browser fallback here, because a desk with
 * no session has nothing to show. It resolves to one of three states and every
 * screen reads the same one.
 *
 * `staff` is NOT decided here. The browser is told whether it is staff so it
 * can render the right thing, but every route re-checks server-side against the
 * database (packages/server/src/staff.ts) — what the client believes about its
 * own privileges is never the thing that grants them.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { AUTH_CONFIGURED, supabase } from "./desk";

type Status = "loading" | "in" | "out";

type Value = {
  status: Status;
  user: User | null;
  /** null until known. false means signed in but not staff, which is a real
   *  state with its own screen — not an error and not a sign-out. */
  isStaff: boolean | null;
  name: string | null;
  configured: boolean;
  signIn: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
};

const Ctx = createContext<Value>({
  status: "loading", user: null, isStaff: null, name: null, configured: false,
  signIn: async () => "The desk is not configured.",
  signOut: async () => {},
});

export const useSession = () => useContext(Ctx);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<Status>(AUTH_CONFIGURED ? "loading" : "out");
  const [isStaff, setIsStaff] = useState<boolean | null>(null);
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    const sb = supabase();
    if (!sb) return;
    let alive = true;
    sb.auth.getSession().then(({ data }) => {
      if (!alive) return;
      setSession(data.session);
      setStatus(data.session ? "in" : "out");
    });
    const { data: sub } = sb.auth.onAuthStateChange((_e, s) => {
      if (!alive) return;
      setSession(s);
      setStatus(s ? "in" : "out");
      if (!s) {
        setIsStaff(null);
        setName(null);
      }
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  /* Ask the server, do not read the flag from the browser. The students row is
   * readable by its owner, so the client COULD read is_staff itself — but then
   * the thing deciding what the desk shows would be a value the client fetched,
   * and the habit of trusting it is how the server-side check eventually gets
   * dropped as redundant. This asks a staff-only route instead: if it answers,
   * the server has already agreed. */
  useEffect(() => {
    if (status !== "in") return;
    let alive = true;
    (async () => {
      const { desk } = await import("./desk");
      const r = await desk<{ students: unknown[] }>("sources");
      if (!alive) return;
      setIsStaff(r.ok);
      setName(session?.user.email?.split("@")[0] ?? null);
    })();
    return () => {
      alive = false;
    };
  }, [status, session]);

  const signIn = useCallback(async (email: string, password: string) => {
    const sb = supabase();
    if (!sb) return "The desk is not configured.";
    const { error } = await sb.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    if (!error) return null;
    const m = error.message.toLowerCase();
    if (m.includes("invalid login")) return "That email and password do not match an account.";
    if (m.includes("rate") || m.includes("too many")) return "Too many attempts. Wait a minute and try again.";
    if (m.includes("fetch") || m.includes("network") || m.includes("load failed"))
      return "Could not reach the sign-in service. Check your connection.";
    return "Something went wrong. Try again in a moment.";
  }, []);

  const signOut = useCallback(async () => {
    await supabase()?.auth.signOut();
  }, []);

  const value = useMemo<Value>(
    () => ({ status, user: session?.user ?? null, isStaff, name, configured: AUTH_CONFIGURED, signIn, signOut }),
    [status, session, isStaff, name, signIn, signOut],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
