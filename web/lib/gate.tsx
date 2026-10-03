"use client";

/* The account gate.
 *
 * The product rule: browsing is open, keeping is not. Anyone can land on Orbit
 * and read the index — that is the point of publishing it. But saving an
 * opportunity, putting two side by side, opening the full listing, or keeping
 * documents all produce a RECORD, and a record needs an owner. Without one it
 * lives in whichever browser happened to be open, which is how students lose
 * work and then blame the site.
 *
 * So this is one interception point rather than a check scattered across every
 * button. `require()` either runs the action or explains, in the words of the
 * action the student just attempted, why it needs an account — and sends them
 * back to exactly where they were afterwards.
 *
 * It deliberately does NOT block navigation to a listing. /opportunity/[id]
 * renders what it can and gates the rest, so a shared link still shows the
 * student what is behind it instead of a wall. A gate that hides the offer
 * cannot persuade anyone to sign up.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useAuth } from "./auth";
import { useDemo } from "./demo";
import g from "./gate.module.css";
import { Icon, type IconName } from "@/components/ui/Icon";

export type GatedAction = "save" | "compare" | "detail" | "dossier" | "track";

/* What each gated action is FOR, in the student's terms. The copy names the
 * benefit of the account, never the restriction — "so they are still here on
 * your phone" rather than "you are not allowed". */
const COPY: Record<GatedAction, { icon: IconName; title: string; body: string }> = {
  save: {
    icon: "bookmark",
    title: "Sign in to save this",
    body: "Saved opportunities are kept against your account, so the list is still there on your phone, in the library, and the week the deadline lands.",
  },
  compare: {
    icon: "compare",
    title: "Sign in to compare",
    body: "Comparisons are kept against your account, so the two you picked are still side by side when you come back to decide.",
  },
  detail: {
    icon: "explore",
    title: "Sign in to read the full listing",
    body: "Eligibility, benefits, the documents required and how to apply — the parts you need before spending an evening on an application.",
  },
  dossier: {
    icon: "upload",
    title: "Sign in to use your Dossier",
    body: "Your documents are stored privately against your account. Nobody else can read them, and that is only possible once we know whose they are.",
  },
  track: {
    icon: "applications",
    title: "Sign in to track applications",
    body: "An application you are part-way through is worth keeping. Tracked status is stored against your account rather than in this browser.",
  },
};

type Ctx = {
  /** Runs `run` when signed in; otherwise explains and offers sign-in. */
  require: (action: GatedAction, run: () => void) => void;
  /** For rendering a gated SURFACE rather than intercepting a click. */
  open: (action: GatedAction) => void;
  signedIn: boolean;
  /** True while the session is still resolving — do not gate on this. */
  pending: boolean;
};

const GateCtx = createContext<Ctx>({
  require: (_a, run) => run(),
  open: () => {},
  signedIn: false,
  pending: true,
});

export const useGate = () => useContext(GateCtx);

export function GateProvider({ children }: { children: React.ReactNode }) {
  const { status, configured } = useAuth();
  const { demo, ready: demoReady } = useDemo();
  const pathname = usePathname();
  const [action, setAction] = useState<GatedAction | null>(null);

  const signedIn = status === "signed-in";
  const pending = status === "loading" || !demoReady;

  /* With no Supabase credentials there is no sign-in to send anyone to, so the
   * gate would be a dead end. A build without accounts stays fully open.
   *
   * Judge mode (lib/demo.ts) is the same shape of exemption for the same
   * reason: a reviewer who cannot hold a campus account cannot be sent to the
   * campus sign-in, so offering it would be the dead end again. Their saved
   * list and tracker land in the per-browser path in lib/store.ts. */
  const enforced = configured && !demo;

  const open = useCallback((a: GatedAction) => setAction(a), []);

  const require = useCallback(
    (a: GatedAction, run: () => void) => {
      if (!enforced || signedIn) {
        run();
        return;
      }
      /* Still resolving: do nothing rather than guess. Gating here would show
       * the prompt to someone who IS signed in, one frame before we know it. */
      if (pending) return;
      setAction(a);
    },
    [enforced, signedIn, pending],
  );

  useEffect(() => {
    if (signedIn) setAction(null);
  }, [signedIn]);

  const value = useMemo<Ctx>(
    () => ({ require, open, signedIn: !enforced || signedIn, pending }),
    [require, open, enforced, signedIn, pending],
  );

  return (
    <GateCtx.Provider value={value}>
      {children}
      {action ? <GateDialog action={action} back={pathname} onClose={() => setAction(null)} /> : null}
    </GateCtx.Provider>
  );
}

function GateDialog({ action, back, onClose }: { action: GatedAction; back: string; onClose: () => void }) {
  const copy = COPY[action];
  const next = `?next=${encodeURIComponent(back)}`;

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", esc);
    /* The page behind must not scroll under the dialog. */
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", esc);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div className={g.scrim} onMouseDown={onClose}>
      <div
        className={g.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="gate-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <span className={g.mark} aria-hidden="true">
          <Icon name={copy.icon} size={20} />
        </span>

        <h2 id="gate-title" className={g.title}>
          {copy.title}
        </h2>
        <p className={g.body}>{copy.body}</p>

        <div className={g.actions}>
          <Link href={`/account${next}`} className={g.primary} onClick={onClose}>
            Sign in
          </Link>
          <Link href={`/account${next}&mode=up`} className={g.secondary} onClick={onClose}>
            Create an account
          </Link>
        </div>

        {/* Never a dead end: browsing was open a second ago and still is. */}
        <button type="button" className={g.dismiss} onClick={onClose}>
          Keep browsing
        </button>
      </div>
    </div>
  );
}
