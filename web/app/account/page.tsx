"use client";

/* Sign in, sign up, and the signed-in account summary — one route, because
 * the three are the same conversation and splitting them across /login,
 * /signup and /account means three screens to keep consistent.
 *
 * Sign-up is restricted to the campus domain. That is a product rule, enforced
 * here for a clear message and again by Supabase's confirmation email, which a
 * non-campus address never receives. It is NOT the security boundary — row
 * level security is (db/015), and it does not care which domain anyone signed
 * up from.
 */

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import s from "./account.module.css";
import { PageHead } from "@/components/layout/AppShell";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Chip } from "@/components/ui/Chip";
import { BentoSkeleton } from "@/components/feedback/Skeletons";
import { useToast } from "@/components/feedback/Toast";
import { useAuth } from "@/lib/auth";
import { CAMPUS_DOMAIN } from "@/lib/supabase";
import { useProfile, useSaved, useTracker } from "@/lib/data";
import { APP_NAME } from "@/components/layout/brand";

type Mode = "in" | "up" | "reset";

export default function AccountPage() {
  const { status, user, configured, signIn, signUp, signOut, resetPassword } = useAuth();
  const router = useRouter();
  const toast = useToast();

  const [mode, setMode] = useState<Mode>("in");
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

  if (status === "signed-in" && user) return <SignedIn email={user.email ?? ""} onSignOut={signOut} />;

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
      router.push("/");
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

function SignedIn({ email, onSignOut }: { email: string; onSignOut: () => Promise<void> }) {
  const { profile, isStaff, ready } = useProfile();
  const { saved } = useSaved();
  const { entries } = useTracker();
  const router = useRouter();
  const toast = useToast();

  return (
    <>
      <PageHead
        eyebrow="Account"
        title={profile.name.trim() || "Your account"}
        description="Signed in. Your saved opportunities and applications are stored against this account and follow you to any device."
        actions={
          <Button
            variant="secondary"
            icon="close"
            onClick={async () => {
              await onSignOut();
              toast("Signed out");
              router.push("/");
            }}
          >
            Sign out
          </Button>
        }
      />

      <div className={s.shell} style={{ maxWidth: 560 }}>
        <div className={s.panel}>
          <div className={s.head}>
            <h2 className="t-section">Account</h2>
            {isStaff ? (
              <span>
                <Chip tone="college" icon="shield">
                  Staff
                </Chip>
              </span>
            ) : null}
          </div>

          {!ready ? (
            <BentoSkeleton lines={4} />
          ) : (
            <div className={s.rows}>
              <div className={s.row}>
                <span className={s.rowKey}>Email</span>
                <span className={s.rowVal}>{email}</span>
              </div>
              <div className={s.row}>
                <span className={s.rowKey}>Degree</span>
                <span className={s.rowVal}>{profile.degree || profile.course || "Not set"}</span>
              </div>
              <div className={s.row}>
                <span className={s.rowKey}>Saved</span>
                <span className={s.rowVal}>{saved.length}</span>
              </div>
              <div className={s.row}>
                <span className={s.rowKey}>Applications tracked</span>
                <span className={s.rowVal}>{entries.length}</span>
              </div>
            </div>
          )}

          <div className={s.foot}>
            <ButtonLink href="/profile" variant="primary" block>
              Edit your profile
            </ButtonLink>
            <p className={s.note}>
              Deleting your account removes your profile, saved list and tracked applications.{" "}
              <Link href="/profile" style={{ textDecoration: "underline", textUnderlineOffset: 2 }}>
                Manage your data
              </Link>
              .
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
