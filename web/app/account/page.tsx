"use client";

/* One job: getting you a session. Sign in, sign up, ask for a reset link, and
 * choose a new password after following one.
 *
 * It used to ALSO be the signed-in account summary, which duplicated /profile's
 * rail (email, degree, saved count, tracked count) and gave the product two
 * pages that both answered "my account". A signed-in student is sent to
 * /profile now, and there is exactly one place to look.
 *
 * Sign-up is restricted to the campus domain. That is a product rule, enforced
 * here for a clear message and again by Supabase's confirmation email, which a
 * non-campus address never receives. It is NOT the security boundary — row
 * level security is (db/015), and it does not care which domain anyone signed
 * up from.
 */

import Image from "next/image";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import s from "./account.module.css";
import { PageHead } from "@/components/layout/AppShell";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { BentoSkeleton } from "@/components/feedback/Skeletons";
import { useToast } from "@/components/feedback/Toast";
import { useAuth } from "@/lib/auth";
import { CAMPUS_DOMAIN } from "@/lib/supabase";
import { APP_NAME } from "@/components/layout/brand";

type Mode = "in" | "up" | "reset";

export default function AccountPage() {
  const { status, configured, signIn, signUp, resetPassword, recovery, updatePassword } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();

  /* Where the student was when the gate stopped them. Same-origin paths only:
   * `next` arrives from the address bar, so an absolute URL in it would make
   * this an open redirect — somebody else's login page wearing our domain. */
  const raw = params.get("next") ?? "";
  const next = raw.startsWith("/") && !raw.startsWith("//") ? raw : "/";

  const [mode, setMode] = useState<Mode>(params.get("mode") === "up" ? "up" : "in");
  const [name, setName] = useState("");
  const [local, setLocal] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    setSent(null);
  }, [mode]);

  /* A session means there is nothing left to do here — except when it came
   * from a recovery link, where the whole point is still ahead. */
  useEffect(() => {
    if (status === "signed-in" && !recovery) router.replace(next === "/" ? "/profile" : next);
  }, [status, recovery, router, next]);

  if (!configured) {
    return (
      <div className={s.shell}>
        <div className={s.panel}>
          <h1 className="t-section">Accounts are not configured</h1>
          <p className="t-body-sm c-secondary">
            This build has no Supabase credentials, so sign-in is unavailable. Everything else works and
            your data is kept in this browser.
          </p>
          <ButtonLink href="/" variant="primary">
            Back to {APP_NAME}
          </ButtonLink>
        </div>
      </div>
    );
  }

  if (status === "loading") {
    return (
      <div className={s.shell}>
        <BentoSkeleton lines={5} />
      </div>
    );
  }

  if (recovery) return <ChoosePassword onSave={updatePassword} />;

  if (status === "signed-in") {
    return (
      <div className={s.shell}>
        <BentoSkeleton lines={5} />
      </div>
    );
  }

  const email = local.includes("@") ? local.trim() : `${local.trim()}@${CAMPUS_DOMAIN}`;

  async function submit() {
    setBusy(true);
    setError(null);
    setSent(null);
    try {
      if (mode === "reset") {
        const err = await resetPassword(email);
        if (err) setError(err);
        else setSent("Check your inbox for a link to set a new password.");
        return;
      }
      const err = mode === "in" ? await signIn(email, password) : await signUp(email, password, name);
      if (err) {
        setError(err);
        return;
      }
      if (mode === "up") {
        setSent("Account created. Check your campus inbox to confirm the address, then sign in.");
        setMode("in");
        return;
      }
      toast("Signed in");
      router.push(next);
    } finally {
      setBusy(false);
    }
  }

  const canSubmit =
    local.trim().length > 0 && (mode === "reset" || password.length >= 8) && (mode !== "up" || name.trim().length > 1);

  return (
    <div className={s.shell}>
      <div className={s.panel}>
        <Image className={s.mark} src="/bits-logo-128.png" alt="" width={44} height={44} priority />

        <div className={s.head}>
          <h1 className="t-section">
            {mode === "in" ? `Sign in to ${APP_NAME}` : mode === "up" ? "Create your account" : "Reset your password"}
          </h1>
          <p className="t-body-sm c-secondary">
            {mode === "in"
              ? "Your saved opportunities and applications follow you to any device."
              : mode === "up"
                ? "Open to BITS Pilani Dubai students. Takes under a minute."
                : "We will email you a link to choose a new one."}
          </p>
        </div>

        <div className={s.fields}>
          {mode === "up" ? (
            <label className={`${s.field} ${s.conditional}`}>
              <span className={s.label}>Your name</span>
              <input className={s.input} value={name} onChange={(e) => setName(e.target.value)} maxLength={120} autoComplete="name" />
            </label>
          ) : null}

          <label className={s.field}>
            <span className={s.label}>Campus email</span>
            <input
              className={s.input}
              value={local}
              onChange={(e) => setLocal(e.target.value)}
              placeholder={`f20240000@${CAMPUS_DOMAIN}`}
              autoComplete="username"
              inputMode="email"
            />
            <span className={s.hint}>
              {local.trim() && !local.includes("@") ? `Will sign in as ${email}` : `Ends in @${CAMPUS_DOMAIN}`}
            </span>
          </label>

          {mode !== "reset" ? (
            <label className={`${s.field} ${s.conditional}`}>
              <span className={s.label}>Password</span>
              <input
                className={s.input}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === "in" ? "current-password" : "new-password"}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && canSubmit && !busy) void submit();
                }}
              />
              {mode === "up" ? <span className={s.hint}>At least 8 characters.</span> : null}
            </label>
          ) : null}

          {error ? (
            <p className={s.error} role="alert">
              <Icon name="alert" size={16} />
              {error}
            </p>
          ) : null}
          {sent ? (
            <p className={s.ok} role="status">
              <Icon name="check" size={16} />
              {sent}
            </p>
          ) : null}
        </div>

        <div className={s.foot}>
          <Button variant="primary" block busy={busy} disabled={!canSubmit || busy} onClick={submit}>
            {mode === "in" ? "Sign in" : mode === "up" ? "Create account" : "Send the link"}
          </Button>

          <p className={s.switch}>
            {mode === "in" ? (
              <>
                New here?{" "}
                <button type="button" className={s.switchBtn} onClick={() => setMode("up")}>
                  Create an account
                </button>{" "}
                ·{" "}
                <button type="button" className={s.switchBtn} onClick={() => setMode("reset")}>
                  Forgot password
                </button>
              </>
            ) : (
              <>
                Already have an account?{" "}
                <button type="button" className={s.switchBtn} onClick={() => setMode("in")}>
                  Sign in
                </button>
              </>
            )}
          </p>

          <p className={s.note}>
            You can use {APP_NAME} without an account — browsing, saving and tracking all work, they are just
            kept in this browser and do not follow you elsewhere.
          </p>
        </div>
      </div>
    </div>
  );
}

/* The other half of "Forgot password". Supabase's recovery link signs the
 * student in and hands control back here; if we never ask for a new password,
 * the link did nothing and they are locked out again next session. */
function ChoosePassword({ onSave }: { onSave: (password: string) => Promise<string | null> }) {
  const router = useRouter();
  const toast = useToast();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    const err = await onSave(password);
    setBusy(false);
    if (err) {
      setError(err);
      return;
    }
    toast("Password updated");
    router.push("/");
  }

  return (
    <div className={s.shell}>
      <div className={s.panel}>
        <Image className={s.mark} src="/bits-logo-128.png" alt="" width={44} height={44} priority />
        <div className={s.head}>
          <h1 className="t-section">Choose a new password</h1>
          <p className="t-body-sm c-secondary">You are signed in from the link. Pick a password and you are done.</p>
        </div>

        <div className={s.fields}>
          <label className={s.field}>
            <span className={s.label}>New password</span>
            <input
              className={s.input}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              onKeyDown={(e) => {
                if (e.key === "Enter" && password.length >= 8 && !busy) void submit();
              }}
            />
            <span className={s.hint}>At least 8 characters.</span>
          </label>
          {error ? (
            <p className={s.error} role="alert">
              <Icon name="alert" size={16} />
              {error}
            </p>
          ) : null}
        </div>

        <div className={s.foot}>
          <Button variant="primary" block busy={busy} disabled={password.length < 8 || busy} onClick={submit}>
            Save password
          </Button>
        </div>
      </div>
    </div>
  );
}
