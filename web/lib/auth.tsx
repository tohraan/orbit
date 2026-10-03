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

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
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
  /* True between following a reset link and choosing a new password. The
   * recovery link signs you in, so without this flag a password reset looks
   * exactly like a normal sign-in and the student never gets asked for the
   * new password — the reset silently does nothing. */
  recovery: boolean;
  updatePassword: (password: string) => Promise<string | null>;
  /** The session ended without anyone pressing Sign out. */
  expired: boolean;
  dismissExpired: () => void;
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
  recovery: false,
  updatePassword: async () => "Accounts are not configured.",
  expired: false,
  dismissExpired: () => {},
});

export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<Status>(AUTH_CONFIGURED ? "loading" : "signed-out");
  const [recovery, setRecovery] = useState(false);
  /* True when the session ended on its own rather than because anyone pressed
   * Sign out. Read by the UI to explain itself. */
  const [expired, setExpired] = useState(false);
  const deliberate = useRef(false);

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
    const { data: sub } = sb.auth.onAuthStateChange((event, next) => {
      setSession(next);
      setStatus(next ? "signed-in" : "signed-out");
      if (event === "PASSWORD_RECOVERY") setRecovery(true);
      if (event === "SIGNED_OUT") setRecovery(false);

      /* A sign-out nobody asked for is the interesting one. `signOut()` sets
       * this flag first, so anything reaching here without it is the library
       * dropping the session on its own — an expired refresh token, a failed
       * refresh, or another tab rotating the token out from under this one.
       * Saying so is the difference between "it logged me out again" and a
       * message that explains itself. */
      if (event === "SIGNED_OUT" && !deliberate.current) setExpired(true);
      if (next) setExpired(false);
      deliberate.current = false;
    });

    /* Recover when the tab comes back.
     *
     * autoRefreshToken only runs while the page is awake. A laptop closed over
     * lunch, or a tab left in the background past the hour, wakes with an
     * access token that expired while nothing was running — and the first
     * request made with it fails. getSession() refreshes from the stored
     * refresh token, so the tab reconnects instead of appearing signed out. */
    const wake = () => {
      if (document.visibilityState !== "visible") return;
      void sb.auth.getSession().then(({ data }) => {
        if (!alive) return;
        setSession(data.session);
        setStatus(data.session ? "signed-in" : "signed-out");
      });
    };
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("online", wake);

    return () => {
      alive = false;
      sub.subscription.unsubscribe();
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("online", wake);
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
    /* A request that never left the browser — offline, or blocked before it
     * was sent. This used to fall through to the generic message, so a CSP
     * that omitted the Supabase origin looked exactly like a server problem
     * and sent us looking in the wrong place. Naming it points at the network,
     * which is where the cause actually is. */
    if (m.includes("fetch") || m.includes("network") || m.includes("load failed"))
      return "Could not reach the sign-in service. Check your connection and try again.";
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
    deliberate.current = true;
    setExpired(false);
    await supabase()?.auth.signOut();
  }, []);

  const updatePassword = useCallback(async (password: string) => {
    const sb = supabase();
    if (!sb) return "Accounts are not configured.";
    if (password.length < 8) return "Passwords need at least 8 characters.";
    const { error } = await sb.auth.updateUser({ password });
    if (error) return friendly(error.message);
    setRecovery(false);
    return null;
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
      recovery,
      updatePassword,
      expired,
      dismissExpired: () => setExpired(false),
    }),
    [status, session, signIn, signUp, signOut, resetPassword, recovery, updatePassword, expired],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
