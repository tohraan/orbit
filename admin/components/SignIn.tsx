"use client";

/* The desk's door. A full screen, like the portal's — there is nothing else to
 * show someone who is not signed in.
 *
 * The card used to render with no padding at all: it asked for
 * `var(--space-7)`, which the scale does not define (it steps 24 → 32), so the
 * whole padding shorthand was invalid and reset to zero. The first screen
 * anyone sees here was the broken one, which is the argument for the controls
 * living in @rof/ui rather than being re-typed per app.
 */

import Image from "next/image";
import { useRef, useState } from "react";
import { Button, Field, Input, Banner } from "@rof/ui";
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
          <Image className={s.markLarge} src="/bits-logo-256.png" alt="" width={44} height={44} priority />
          <h1 className={s.doorTitle}>Orbit Desk</h1>
          <p className="t-body-sm c-secondary">
            Department access to the opportunity portal. Sign in with your BITS Pilani Dubai account.
          </p>
        </div>

        <Field label="Campus email">
          <Input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="username"
            inputMode="email"
            placeholder={`you@${CAMPUS_DOMAIN}`}
          />
        </Field>

        <Field label="Password">
          <Input
            type="password"
            value={password}
            autoComplete="current-password"
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void submit();
            }}
          />
        </Field>

        {error ? <Banner tone="error">{error}</Banner> : null}

        <Button tone="primary" disabled={!can || busy} onClick={() => void submit()}>
          {busy ? "Signing in…" : "Sign in"}
        </Button>

        <p className={s.doorNote}>
          Desk access is granted per account. Signing in with a student account will say so rather than
          failing silently.
        </p>
      </div>
    </main>
  );
}
