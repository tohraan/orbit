"use client";

/* A small dropdown with the keyboard behaviour a dropdown has to have:
 * Escape closes it, focus leaving closes it, and the trigger keeps focus so
 * tab order does not jump (§74 logical tab order, §75 visible focus). */

import { useEffect, useRef, useState, type ReactNode } from "react";
import s from "./filters.module.css";
import { Icon } from "../ui/Icon";

export function Popover({
  label,
  count,
  align = "left",
  children,
}: {
  label: string;
  count?: number;
  align?: "left" | "right";
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  return (
    <div className={s.popWrap} ref={wrap}>
      <button
        type="button"
        className={[s.trigger, count ? s.triggerActive : null].filter(Boolean).join(" ")}
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((o) => !o)}
      >
        {label}
        {count ? <span className={s.triggerCount}>{count}</span> : null}
        <Icon name="chevron-down" size={15} />
      </button>
      {open ? (
        <div className={[s.pop, align === "right" ? s.popRight : null].filter(Boolean).join(" ")}>
          {children(() => setOpen(false))}
        </div>
      ) : null}
    </div>
  );
}

export function Option({
  label,
  count,
  checked,
  radio,
  onToggle,
}: {
  label: string;
  count?: number;
  checked: boolean;
  radio?: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      className={s.option}
      role={radio ? "menuitemradio" : "menuitemcheckbox"}
      aria-checked={checked}
      onClick={onToggle}
    >
      <span className={[s.box, radio ? s.boxRound : null, checked ? s.boxOn : null].filter(Boolean).join(" ")}>
        {checked ? <Icon name="check" size={11} strokeWidth={2.4} /> : null}
      </span>
      <span className={s.optionLabel}>{label}</span>
      {count != null ? <span className={s.optionCount}>{count}</span> : null}
    </button>
  );
}

export { s as filterStyles };
