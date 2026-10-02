"use client";

/* Session state for the whole app.
 *
 * One provider at the shell, so every screen reads the same session and there
 * is exactly one auth listener rather than one per component.
 *
 * `status` is three-valued on purpose. "loading" is not the same as "signed
 * out": treating them the same makes every protected screen flash its
 * signed-out state on first paint, which looks like being logged out and is
 * the single most common bug in apps that do this.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { AUTH_CONFIGURED, isCampusEmail, supabase } from "./supabase";

type Status = "loading" | "signed-in" | "signed-out";

type AuthValue = {
  status: Status;
  user: User | null;
  session: Session | null;
  configured: boolean;
  signIn: (email: string, password: string) => Promise<string | null>;
  signUp: (email: string, password: string, fullName: string) => Promise<string | null>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<string | null>;
};

const Ctx = createContext<AuthValue>({
  status: "loading",
  user: null,
  session: null,
  configured: false,
  signIn: async () => "Accounts are not configured.",
  signUp: async () => "Accounts are not configured.",
  signOut: async () => {},
  resetPassword: async () => "Accounts are not configured.",
});

export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<Status>(AUTH_CONFIGURED ? "loading" : "signed-out");

  useEffect(() => {
    const sb = supabase();
    if (!sb) return;
    let alive = true;

    sb.auth.getSession().then(({ data }) => {
      if (!alive) return;
      setSession(data.session);
      setStatus(data.session ? "signed-in" : "signed-out");
    });

    /* Covers sign-in, sign-out, token refresh and another tab doing any of
     * them — the listener is what keeps two open tabs in agreement. */
    const { data: sub } = sb.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setStatus(next ? "signed-in" : "signed-out");
    });

    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  /* Supabase returns prose aimed at developers ("Invalid login credentials",
   * "AuthApiError"). These are the student-facing versions; the original goes
   * nowhere near the screen. */
  const friendly = (message: string): string => {
    const m = message.toLowerCase();
    if (m.includes("invalid login")) return "That email and password do not match an account.";
    if (m.includes("already registered")) return "An account already exists for that email. Try signing in.";
    if (m.includes("confirm")) return "Check your inbox and confirm your email first.";
    if (m.includes("password")) return "Passwords need at least 8 characters.";
    if (m.includes("rate") || m.includes("too many")) return "Too many attempts. Wait a minute and try again.";
    return "Something went wrong. Try again in a moment.";
  };

  const signIn = useCallback(async (email: string, password: string) => {
    const sb = supabase();
    if (!sb) return "Accounts are not configured.";
    const { error } = await sb.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    return error ? friendly(error.message) : null;
  }, []);

  const signUp = useCallback(async (email: string, password: string, fullName: string) => {
    const sb = supabase();
    if (!sb) return "Accounts are not configured.";
    const clean = email.trim().toLowerCase();
    if (!isCampusEmail(clean)) return "Use your BITS Pilani Dubai email to sign up.";
    if (password.length < 8) return "Passwords need at least 8 characters.";
    const { error } = await sb.auth.signUp({
      email: clean,
      password,
      /* Read by the handle_new_student trigger (db/015) so the students row
       * carries a name from the moment it exists. */
      options: { data: { full_name: fullName.trim() } },
    });
    return error ? friendly(error.message) : null;
  }, []);

  const signOut = useCallback(async () => {
    await supabase()?.auth.signOut();
  }, []);

  const resetPassword = useCallback(async (email: string) => {
    const sb = supabase();
    if (!sb) return "Accounts are not configured.";
    const { error } = await sb.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: typeof window !== "undefined" ? `${window.location.origin}/account` : undefined,
    });
    return error ? friendly(error.message) : null;
  }, []);

  const value = useMemo<AuthValue>(
    () => ({
      status,
      user: session?.user ?? null,
      session,
      configured: AUTH_CONFIGURED,
      signIn,
      signUp,
      signOut,
      resetPassword,
    }),
    [status, session, signIn, signUp, signOut, resetPassword],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
