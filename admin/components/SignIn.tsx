"use client";

/* The desk's door. A full screen, like the portal's — there is nothing else to
 * show someone who is not signed in. */

import { useRef, useState } from "react";
import s from "./shell.module.css";
import { useSession } from "@/lib/session";
import { CAMPUS_DOMAIN } from "@/lib/desk";

export function SignIn() {
  const { signIn } = useSession();
  const [typed, setTyped] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const email = typed.includes("@") ? typed.trim().toLowerCase() : `${typed.trim().toLowerCase()}@${CAMPUS_DOMAIN}`;
  const can = typed.trim().length > 0 && password.length >= 8;

  async function submit() {
    if (inFlight.current || !can) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    const err = await signIn(email, password);
    inFlight.current = false;
    setBusy(false);
    if (err) setError(err);
  }

  return (
    <main className={s.centre}>
      <div className={s.door}>
        <div className={s.doorHead}>
          <span className={s.markLarge} aria-hidden="true">◎</span>
          <h1 className={s.doorTitle}>Orbit Desk</h1>
          <p className="t-body-sm c-secondary">
            Department access to the opportunity portal. Sign in with your BITS Pilani Dubai account.
          </p>
        </div>

        <label className={s.field}>
          <span className={s.label}>Campus email</span>
          <input className={s.input} value={typed} onChange={(e) => setTyped(e.target.value)}
                 autoComplete="username" inputMode="email" placeholder={`you@${CAMPUS_DOMAIN}`} />
        </label>

        <label className={s.field}>
          <span className={s.label}>Password</span>
          <input className={s.input} type="password" value={password} autoComplete="current-password"
                 onChange={(e) => setPassword(e.target.value)}
                 onKeyDown={(e) => { if (e.key === "Enter") void submit(); }} />
        </label>

        {error ? <p className={s.error} role="alert">{error}</p> : null}

        <button type="button" className={s.primary} disabled={!can || busy} onClick={() => void submit()}>
          {busy ? "Signing in…" : "Sign in"}
        </button>

        <p className={s.doorNote}>
          Desk access is granted per account. Signing in with a student account will say so rather than
          failing silently.
        </p>
      </div>
    </main>
  );
}
