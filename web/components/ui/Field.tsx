"use client";

/* Themed form controls. See field.module.css for why a native <select> was not
 * good enough: it renders with the OS's own chrome and ignores the token
 * layer, which is why every dropdown in the product looked borrowed.
 *
 * The keyboard contract of a native select is kept deliberately — arrows,
 * Enter, Space, Escape, Home, End, and type-ahead — because replacing a native
 * control with something less capable is a downgrade however it looks (§74). */

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import s from "./field.module.css";
import { Icon } from "./Icon";

export type Option = { value: string; label: string; hint?: string };

export function Select({
  value,
  options,
  onChange,
  placeholder = "Select…",
  size = "md",
  ariaLabel,
}: {
  value: string;
  options: Option[];
  onChange: (value: string) => void;
  placeholder?: string;
  size?: "sm" | "md";
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [up, setUp] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const listId = useId();
  const typed = useRef({ term: "", at: 0 });

  const current = options.find((o) => o.value === value) ?? null;

  const choose = useCallback(
    (v: string) => {
      onChange(v);
      setOpen(false);
    },
    [onChange],
  );

  useEffect(() => {
    if (!open) return;
    setActive(Math.max(0, options.findIndex((o) => o.value === value)));
    /* Flip upward when the trigger sits low in the viewport, so the list is
     * never clipped by the fold on a short screen. */
    const r = wrap.current?.getBoundingClientRect();
    if (r) setUp(window.innerHeight - r.bottom < 280 && r.top > 280);

    const away = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [open, options, value]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open && (e.key === "Enter" || e.key === " " || e.key === "ArrowDown")) {
      e.preventDefault();
      setOpen(true);
      return;
    }
    if (!open) return;
    if (e.key === "Escape") { e.preventDefault(); setOpen(false); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(options.length - 1, i + 1)); return; }
    if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(0, i - 1)); return; }
    if (e.key === "Home") { e.preventDefault(); setActive(0); return; }
    if (e.key === "End") { e.preventDefault(); setActive(options.length - 1); return; }
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      const o = options[active];
      if (o) choose(o.value);
      return;
    }
    /* Type-ahead: successive letters within a second build one search term,
     * which is how a native select behaves. */
    if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
      const now = Date.now();
      typed.current.term = now - typed.current.at < 1000 ? typed.current.term + e.key : e.key;
      typed.current.at = now;
      const i = options.findIndex((o) => o.label.toLowerCase().startsWith(typed.current.term.toLowerCase()));
      if (i >= 0) setActive(i);
    }
  }

  return (
    <div className={s.wrap} ref={wrap}>
      <button
        type="button"
        className={[s.trigger, size === "sm" ? s.sm : null, open ? s.triggerOpen : null].filter(Boolean).join(" ")}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={ariaLabel}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onKeyDown}
      >
        <span className={[s.value, current ? null : s.placeholder].filter(Boolean).join(" ")}>
          {current?.label ?? placeholder}
        </span>
        <Icon name="chevron-down" size={16} className={[s.chev, open ? s.chevOpen : null].filter(Boolean).join(" ")} />
      </button>

      {open ? (
        <div className={[s.list, up ? s.listUp : null].filter(Boolean).join(" ")} id={listId} role="listbox" tabIndex={-1}>
          {options.map((o, i) => (
            <button
              key={o.value}
              type="button"
              role="option"
              aria-selected={o.value === value}
              className={[
                s.option,
                i === active ? s.optionActive : null,
                o.value === value ? s.optionOn : null,
              ].filter(Boolean).join(" ")}
              onMouseEnter={() => setActive(i)}
              onClick={() => choose(o.value)}
            >
              <span className={s.value}>{o.label}</span>
              {o.value === value ? <Icon name="check" size={15} /> : o.hint ? <span className={s.optionHint}>{o.hint}</span> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------ tag picker ---
 * Suggestions you can tap, and a free-text field for anything we did not think
 * of. The stored value stays a comma-separated string so the matcher and the
 * existing profile shape are unchanged. */

export function TagPicker({
  value,
  onChange,
  suggestions,
  placeholder = "Type and press Enter",
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  suggestions: string[];
  placeholder?: string;
  ariaLabel?: string;
}) {
  const [draft, setDraft] = useState("");
  const tags = useMemo(
    () => value.split(",").map((t) => t.trim()).filter(Boolean),
    [value],
  );
  const has = (t: string) => tags.some((x) => x.toLowerCase() === t.toLowerCase());

  const commit = (next: string[]) => onChange([...new Set(next.map((t) => t.trim()).filter(Boolean))].join(", "));
  const add = (t: string) => { if (t.trim() && !has(t)) commit([...tags, t]); setDraft(""); };
  const drop = (t: string) => commit(tags.filter((x) => x !== t));

  return (
    <div>
      <div className={s.tags}>
        {tags.map((t) => (
          <span className={s.tag} key={t}>
            <span className={s.tagText}>{t}</span>
            <button type="button" className={s.tagX} aria-label={`Remove ${t}`} onClick={() => drop(t)}>
              <Icon name="close" size={11} strokeWidth={2.4} />
            </button>
          </span>
        ))}
        <input
          className={s.tagInput}
          value={draft}
          placeholder={tags.length ? "Add another" : placeholder}
          aria-label={ariaLabel}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(draft); }
            /* Backspace on an empty field removes the last tag, which is what
             * every tag input anyone has used already does. */
            else if (e.key === "Backspace" && !draft && tags.length) drop(tags[tags.length - 1]);
          }}
          onBlur={() => add(draft)}
        />
      </div>
      <div className={s.suggest}>
        {suggestions.map((t) => (
          <button key={t} type="button" className={s.suggestChip} disabled={has(t)} onClick={() => add(t)}>
            {has(t) ? "✓ " : "+ "}
            {t}
          </button>
        ))}
      </div>
    </div>
  );
}

/* --------------------------------------------------------- email + phone --- */

export const CAMPUS_DOMAIN = "@dubai.bits-pilani.ac.in";

/** The campus domain is fixed, so it is shown rather than typed. The stored
 *  value is still the full address. */
export function CampusEmail({
  value,
  onChange,
  placeholder = "f20240000",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const local = value.endsWith(CAMPUS_DOMAIN) ? value.slice(0, -CAMPUS_DOMAIN.length) : value;
  return (
    <div className={s.affix}>
      <input
        className={s.affixInput}
        value={local}
        placeholder={placeholder}
        autoComplete="username"
        aria-label="Campus email, username part"
        /* Strip anything that cannot appear before the @, including a domain
         * pasted in by a student who typed the whole address out of habit. */
        onChange={(e) => onChange(`${e.target.value.replace(/[@\s]/g, "").slice(0, 64)}${CAMPUS_DOMAIN}`)}
      />
      <span className={s.affixTail}>{CAMPUS_DOMAIN}</span>
    </div>
  );
}

/* Dialling codes. India and the UAE first because that is where essentially
 * every student here holds a number; the rest cover the campus's actual
 * intake rather than being an exhaustive ISO list nobody scrolls. */
export const DIAL_CODES: Option[] = [
  { value: "+971", label: "+971 UAE" },
  { value: "+91", label: "+91 India" },
  { value: "+966", label: "+966 Saudi Arabia" },
  { value: "+968", label: "+968 Oman" },
  { value: "+974", label: "+974 Qatar" },
  { value: "+973", label: "+973 Bahrain" },
  { value: "+965", label: "+965 Kuwait" },
  { value: "+44", label: "+44 United Kingdom" },
  { value: "+1", label: "+1 USA / Canada" },
  { value: "+61", label: "+61 Australia" },
  { value: "+49", label: "+49 Germany" },
  { value: "+880", label: "+880 Bangladesh" },
  { value: "+94", label: "+94 Sri Lanka" },
  { value: "+977", label: "+977 Nepal" },
  { value: "+92", label: "+92 Pakistan" },
  { value: "+234", label: "+234 Nigeria" },
  { value: "+254", label: "+254 Kenya" },
  { value: "+20", label: "+20 Egypt" },
];

/** Stored as one string ("+971 501234567") so the profile shape is unchanged. */
export function PhoneField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const m = /^(\+\d{1,4})\s*(.*)$/.exec(value.trim());
  const code = m?.[1] ?? "+971";
  const rest = m?.[2] ?? value.trim();

  return (
    <div className={s.phone}>
      <span className={s.phoneCode}>
        <Select value={code} options={DIAL_CODES} onChange={(c) => onChange(`${c} ${rest}`.trim())} ariaLabel="Country dialling code" />
      </span>
      <span className={s.phoneNum}>
        <input
          className={s.affixInput}
          style={{ height: 44, border: "1px solid var(--color-border)", borderRadius: "var(--radius-control)", width: "100%" }}
          value={rest}
          inputMode="tel"
          placeholder="50 123 4567"
          aria-label="Phone number"
          onChange={(e) => onChange(`${code} ${e.target.value.replace(/[^\d\s-]/g, "").slice(0, 20)}`.trim())}
        />
      </span>
    </div>
  );
}

export { s as fieldStyles };
