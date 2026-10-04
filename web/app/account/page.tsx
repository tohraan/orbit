"use client";

/* The way into Orbit. A full screen, not a page inside the app.
 *
 * With the portal behind a gate (components/auth/AuthWall.tsx) this is the
 * first thing a new student sees, and it used to arrive wearing the whole
 * shell: a rail of links to a portal they could not enter, a breadcrumb for a
 * page with no parent, a bell with nothing in it, and an avatar for an account
 * that did not exist. Every one of those was either a dead end or a way to
 * leave the only screen that was any use. AppShell's BARE list now hands this
 * route the viewport and nothing else.
 *
 * Four things happen here, and only here: sign in, sign up, ask for a reset
 * link, and choose a new password after following one. It used to ALSO be the
 * signed-in account summary, which duplicated /profile's rail and gave the
 * product two pages that both answered "my account". A signed-in student is
 * sent to /profile now.
 *
 * Sign-up is restricted to the campus domain. The check here is for the
 * message; db/019 is the rule (see lib/supabase.ts). Neither is the security
 * boundary — row-level security is (db/015), and it does not care which domain
 * anyone signed up from.
 */

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import s from "./account.module.css";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { useToast } from "@/components/feedback/Toast";
import { NEEDS_CONFIRMATION, useAuth } from "@/lib/auth";
import { campusEmail, CAMPUS_DOMAIN } from "@/lib/supabase";
import { DEMO_ENABLED, enterDemo } from "@/lib/demo";
import { markFirstRun } from "@/lib/account";
import { APP_NAME, APP_TAGLINE } from "@/components/layout/brand";

type Mode = "in" | "up" | "reset";

/* The two modes that are a real choice, and so get segments. "reset" is a
 * detour off "in" rather than a third way to arrive, and giving it a segment
 * would put a dead end next to the two live ones. */
const MODES: { value: Exclude<Mode, "reset">; label: string }[] = [
  { value: "in", label: "Sign in" },
  { value: "up", label: "Create account" },
];

export default function AccountPage() {
  const { status, configured, signIn, signUp, resetPassword, recovery, updatePassword } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();

  /* Where the student was when the gate stopped them. Same-origin paths only:
   * `next` arrives from the address bar, so an absolute URL in it would make
   * this an open redirect — somebody else's login page wearing our domain.
   * A leading backslash is rejected alongside a second slash, because browsers
   * normalise "/\evil.com" to "//evil.com" and it would otherwise pass. */
  const raw = params.get("next") ?? "";
  const next = raw.startsWith("/") && !/^\/[/\\]/.test(raw) ? raw : "/";

  const [mode, setMode] = useState<Mode>(params.get("mode") === "up" ? "up" : "in");
  const [name, setName] = useState("");
  const [typed, setTyped] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);

  /* setBusy is async, so two fast Enter presses both read busy === false and
   * both submit — which is how a student ends up with "User already
   * registered" one keystroke after a sign-up that actually worked. The ref is
   * synchronous and closes that window. */
  const inFlight = useRef(false);

  useEffect(() => {
    setError(null);
    setSent(null);
  }, [mode]);

  /* A session means there is nothing left to do here — except when it came
   * from a recovery link, where the whole point is still ahead. */
  useEffect(() => {
    if (status === "signed-in" && !recovery) router.replace(next === "/" ? "/" : next);
  }, [status, recovery, router, next]);

  const email = campusEmail(typed);

  async function submit() {
    if (inFlight.current) return;
    if (!email) {
      setError("Enter your roll number or your full campus email.");
      return;
    }
    inFlight.current = true;
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
      if (mode === "in") {
        const err = await signIn(email, password);
        if (err) {
          setError(err);
          return;
        }
        toast("Signed in");
        router.push(next);
        return;
      }

      const err = await signUp(email, password, name);
      if (err === NEEDS_CONFIRMATION) {
        /* The account exists but no session came back, so sending them into
         * the portal would have the gate bounce them straight out. This build
         * has confirmations off, so it should not happen — but "should not" is
         * not a reason to show a student a blank screen if it does. */
        setSent("Account created. Confirm the address from your campus inbox, then sign in.");
        setMode("in");
        return;
      }
      if (err) {
        setError(err);
        return;
      }
      /* A session came back with the account. Straight in — the onboarding
       * overlay (components/auth/Onboarding.tsx) takes it from here, because
       * the students row the trigger just made has onboarded_at null.
       *
       * It is told so explicitly rather than left to find out: the row takes a
       * round trip to arrive, and until it does the overlay cannot tell a new
       * student from a returning one, so the portal rendered unfrosted for
       * about two seconds first. */
      markFirstRun();
      toast(`Welcome to ${APP_NAME}`);
      router.push(next);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  const canSubmit =
    Boolean(email) && (mode === "reset" || password.length >= 8) && (mode !== "up" || name.trim().length > 1);

  /* Rendered around every state below, so the frame does not change while the
   * session resolves — the brand stays put and only the panel swaps. */
  const frame = (body: React.ReactNode) => (
    <div className={s.shell}>
      <div className={s.stage}>
        <div className={s.brand}>
          <Image className={s.mark} src="/bits-logo-128.png" alt="" width={48} height={48} priority />
          <span className={s.brandName}>{APP_NAME}</span>
          <span className={s.brandSub}>{APP_TAGLINE}</span>
        </div>
        {body}
      </div>
    </div>
  );

  if (!configured) {
    return frame(
      <div className={s.panel}>
        <div className={s.head}>
          <h1 className="t-section">Accounts are not configured</h1>
          <p className="t-body-sm c-secondary">
            This build has no Supabase credentials, so sign-in is unavailable. Everything else works and your
            data is kept in this browser.
          </p>
        </div>
        <ButtonLink href="/" variant="primary" block>
          Open {APP_NAME}
        </ButtonLink>
      </div>,
    );
  }

  /* One spinner for both "still asking Supabase" and "signed in, redirecting".
   * Neither is a state with anything to read, and flashing the form in between
   * looks like being signed out. */
  if (status === "loading" || (status === "signed-in" && !recovery)) {
    return frame(
      <div className={[s.panel, s.panelWaiting].join(" ")}>
        <span className={s.spinner} aria-hidden="true" />
        <p className="t-body-sm c-secondary" role="status">
          {status === "loading" ? "Checking your session…" : "Taking you in…"}
        </p>
      </div>,
    );
  }

  if (recovery) return frame(<ChoosePassword onSave={updatePassword} />);

  return frame(
    <div className={s.panel}>
      {/* The toggle. Two segments, because there are two things a student can
          be here to do, and "which one am I on" should not depend on reading
          the heading. */}
      <div className={s.modes} role="tablist" aria-label="Sign in or create an account">
        {MODES.map((m) => (
          <button
            key={m.value}
            type="button"
            role="tab"
            aria-selected={mode === m.value}
            className={[s.mode, mode === m.value ? s.modeActive : null].filter(Boolean).join(" ")}
            onClick={() => setMode(m.value)}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div className={s.head}>
        <h1 className="t-section">
          {mode === "in" ? "Welcome back" : mode === "up" ? "Create your account" : "Reset your password"}
        </h1>
        <p className="t-body-sm c-secondary">
          {mode === "in"
            ? "Sign in with your BITS Pilani Dubai email."
            : mode === "up"
              ? "Open to BITS Pilani Dubai students. Takes under a minute."
              : "We will email you a link to choose a new one."}
        </p>
      </div>

      <div className={s.fields}>
        {mode === "up" ? (
          <label className={`${s.field} ${s.conditional}`}>
            <span className={s.label}>Your name</span>
            <input
              className={s.input}
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={120}
              autoComplete="name"
            />
          </label>
        ) : null}

        <label className={s.field}>
          <span className={s.label}>Campus email</span>
          <input
            className={s.input}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={`f20240000@${CAMPUS_DOMAIN}`}
            autoComplete="username"
            inputMode="email"
            onKeyDown={(e) => {
              if (e.key === "Enter" && canSubmit && !busy) void submit();
            }}
          />
          <span className={s.hint}>
            {/* What it will actually send, once that is a different string from
                what was typed. Saying "ends in @domain" while the field holds
                something unusable was advice about the wrong problem. */}
            {typed.trim() && !email
              ? "That is not a usable address yet."
              : email && email !== typed.trim().toLowerCase()
                ? `Will sign in as ${email}`
                : `Your roll number is enough — we add @${CAMPUS_DOMAIN}.`}
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

        {/* Only the detour needs a link now — the toggle above carries the
            sign-in / sign-up swap. */}
        {mode === "in" ? (
          <p className={s.switch}>
            <button type="button" className={s.switchBtn} onClick={() => setMode("reset")}>
              Forgot your password?
            </button>
          </p>
        ) : mode === "reset" ? (
          <p className={s.switch}>
            <button type="button" className={s.switchBtn} onClick={() => setMode("in")}>
              Back to sign in
            </button>
          </p>
        ) : null}
      </div>

      <JudgeDoor />
    </div>,
  );
}

/* The way in for a reviewer who has no campus address.
 *
 * Sign-up is restricted to @dubai.bits-pilani.ac.in by a trigger on
 * auth.users (db/019). For a judging panel that rule turns this screen into a
 * locked door with the key on the other side, and a judge who cannot get in
 * scores the sign-in screen rather than the product. So this says plainly what
 * it is and lets them through.
 *
 * It renders only when NEXT_PUBLIC_DEMO_MODE=1, so the student deployment does
 * not merely hide this button — it ships without one. See lib/demo.ts for what
 * the flag does and, more importantly, what it does not. */
function JudgeDoor() {
  const router = useRouter();
  if (!DEMO_ENABLED) return null;

  return (
    <div className={s.judge}>
      <p className={s.judgeLabel}>Reviewing this project?</p>
      <p className={s.note}>
        Accounts are limited to {CAMPUS_DOMAIN} addresses, so there is no account we can give you. Open the
        portal without one — the full index, matching, calendar and tracker, with anything you save kept in
        this browser only.
      </p>
      <Button
        variant="secondary"
        block
        onClick={() => {
          enterDemo();
          router.push("/");
        }}
      >
        I am judging — open without an account
      </Button>
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
  const inFlight = useRef(false);

  async function submit() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    const err = await onSave(password);
    inFlight.current = false;
    setBusy(false);
    if (err) {
      setError(err);
      return;
    }
    toast("Password updated");
    router.push("/");
  }

  return (
    <div className={s.panel}>
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
  );
}
