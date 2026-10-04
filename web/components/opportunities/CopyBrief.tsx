"use client";

/* "Copy AI brief" — the listing, as facts plus an instruction, on the
 * clipboard.
 *
 * Students already paste these pages into an AI. What they paste today is a
 * scraped web page: navigation, a cookie banner, and on one of our sources
 * sixteen cards for OTHER opportunities. The answer they get is confident and
 * partly about the wrong programme. The index already holds this one parsed,
 * so handing over the parsed version — with its gaps named — is strictly
 * better than letting them hand over the page.
 *
 * The text itself is built in @rof/core (brief.ts), not here: it is the part
 * worth unit-testing, and a component is a bad place to keep prose that has
 * rules about what it must not claim.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { buildBrief, type OpportunityDetail } from "@rof/core";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/feedback/Toast";
import { useProfile } from "@/lib/data";

/* Clipboard write can fail for reasons the student cannot act on: an insecure
 * origin, a browser that gates it behind a permission, an iframe. Falling back
 * to a hidden textarea + execCommand covers almost all of it; when even that
 * fails we say so rather than showing a success toast for nothing. */
async function copy(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through */
  }
  try {
    const el = document.createElement("textarea");
    el.value = text;
    el.setAttribute("readonly", "");
    el.style.position = "fixed";
    el.style.opacity = "0";
    document.body.appendChild(el);
    el.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(el);
    return ok;
  } catch {
    return false;
  }
}

export function CopyBrief({
  opportunity,
  size = "md",
}: {
  opportunity: OpportunityDetail;
  size?: "sm" | "md";
}) {
  const toast = useToast();
  const { profile } = useProfile();
  const [done, setDone] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current);
  }, []);

  const onClick = useCallback(async () => {
    const text = buildBrief(opportunity, profile, {
      /* The student's own today, not the server's. "14 days away" is read on
         their calendar, and the portal's audience is one timezone. */
      today: new Date().toLocaleDateString("en-CA"),
      permalink: typeof window !== "undefined" ? window.location.href : undefined,
    });

    const ok = await copy(text);
    if (!ok) {
      toast("Could not reach the clipboard. Your browser may be blocking it.");
      return;
    }

    setDone(true);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setDone(false), 2400);

    /* The toast says where to put it, because the button has done something
       invisible: nothing on screen changed and the value is in another app. */
    toast("Brief copied. Paste it into ChatGPT, Claude or any AI.");
  }, [opportunity, profile, toast]);

  return (
    <Button
      variant="secondary"
      size={size}
      icon={done ? "check" : "sparkle"}
      onClick={() => void onClick()}
      /* The label never becomes "Copied!" — a control whose name changes is a
         control a screen-reader user hears rename itself under them. The icon
         carries the confirmation; the live region below carries it in words. */
      title="Copy this listing and a prompt that makes an AI interview you before it advises"
    >
      Copy AI brief
      <span className="sr-only" role="status" aria-live="polite">
        {done ? "Brief copied to clipboard" : ""}
      </span>
    </Button>
  );
}
