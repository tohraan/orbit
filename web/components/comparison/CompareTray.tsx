"use client";

/* §38, exactly: one selected shows the count and Compare; two selected adds
 * Clear. It appears over every screen (§37, "a persistent compare tray") and
 * disappears when nothing is selected — §113, do not fill empty space. */

import { usePathname } from "next/navigation";
import s from "./comparison.module.css";
import { Button, ButtonLink } from "../ui/Button";
import { MAX_COMPARE, useCompare } from "@/lib/data";

export function CompareTray() {
  const { compare, clear, ready } = useCompare();
  const pathname = usePathname();

  /* On the comparison screen itself the tray would be pointing at the page you
   * are already on. */
  if (!ready || compare.length === 0 || pathname === "/compare") return null;

  return (
    <div className={s.tray} role="region" aria-label="Comparison selection">
      <div>
        <p className={s.trayCount}>
          {compare.length} selected
        </p>
        {compare.length < MAX_COMPARE ? (
          <p className={s.trayHint}>Pick one more to compare them side by side</p>
        ) : null}
      </div>
      <div className={s.trayActions}>
        {compare.length === MAX_COMPARE ? (
          <Button variant="ghost" size="sm" onClick={clear}>
            Clear
          </Button>
        ) : null}
        <ButtonLink href="/compare" variant="primary" size="sm">
          Compare
        </ButtonLink>
      </div>
    </div>
  );
}
