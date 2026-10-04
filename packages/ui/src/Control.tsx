/* Typed wrappers over control.module.css.
 *
 * They exist so a call site names a variant — `<Button tone="danger">` — and
 * cannot reach for a class that does not exist or hand-roll a fifth button
 * shape. Everything forwards its native props, so anything not modelled here
 * (form, name, autoComplete, aria-*) still works without this file growing a
 * prop for it.
 */

import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import c from "./control.module.css";

const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(" ");

/* ------------------------------------------------------------ buttons --- */

export type ButtonTone = "primary" | "secondary" | "ghost" | "danger";

const TONE: Record<ButtonTone, string> = {
  primary: c.primary,
  secondary: c.secondary,
  ghost: c.ghost,
  danger: c.danger,
};

export function Button({
  tone = "secondary",
  size,
  className,
  type = "button",
  ...rest
}: { tone?: ButtonTone; size?: "sm" } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type={type} className={cx(c.btn, TONE[tone], size === "sm" && c.sm, className)} {...rest} />;
}

/* For something that navigates and therefore has to be an <a> — a next/link —
 * but should look like a button. Returning the classes rather than wrapping
 * Link keeps this package from depending on a router: the same string works
 * for next/link, a plain anchor, or a <label>. */
export function buttonClass(tone: ButtonTone = "secondary", size?: "sm"): string {
  return cx(c.btn, TONE[tone], size === "sm" && c.sm);
}

/* -------------------------------------------------------------- field --- */

/** A label, a control and — when something is wrong — the reason, in order. */
export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  children: ReactNode;
}) {
  return (
    <label className={c.field}>
      <span className={c.label}>{label}</span>
      {children}
      {error ? <span className={c.fieldError}>{error}</span> : hint ? <span className={c.hint}>{hint}</span> : null}
    </label>
  );
}

export function Input({
  invalid,
  className,
  ...rest
}: { invalid?: boolean } & InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cx(c.input, invalid && c.invalid, className)} aria-invalid={invalid || undefined} {...rest} />;
}

export function Textarea({
  invalid,
  className,
  ...rest
}: { invalid?: boolean } & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea className={cx(c.textarea, invalid && c.invalid, className)} aria-invalid={invalid || undefined} {...rest} />
  );
}

export function Select({
  invalid,
  className,
  ...rest
}: { invalid?: boolean } & SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cx(c.select, invalid && c.invalid, className)} aria-invalid={invalid || undefined} {...rest} />;
}

/* --------------------------------------------------------------- pill --- */

export type PillTone = "accent" | "error" | "warning" | "success" | "neutral";

const PILL: Record<PillTone, string> = {
  accent: c.pillAccent,
  error: c.pillError,
  warning: c.pillWarning,
  success: c.pillSuccess,
  neutral: c.pillNeutral,
};

export function Pill({ tone = "neutral", children }: { tone?: PillTone; children: ReactNode }) {
  return <span className={cx(c.pill, PILL[tone])}>{children}</span>;
}

/* ------------------------------------------------------------- banner --- */

export type BannerTone = "error" | "success" | "warning" | "info";

const BANNER: Record<BannerTone, string> = {
  error: c.bannerError,
  success: c.bannerSuccess,
  warning: c.bannerWarning,
  info: c.bannerInfo,
};

export function Banner({ tone, children }: { tone: BannerTone; children: ReactNode }) {
  return (
    /* An error is announced; a success or a note is not, because interrupting
       a screen reader to say a thing worked is worse than letting it be read
       in place. */
    <p className={cx(c.banner, BANNER[tone])} role={tone === "error" ? "alert" : undefined}>
      {children}
    </p>
  );
}

/* ------------------------------------------------------------ spinner --- */

export function Spinner({ label = "Loading" }: { label?: string }) {
  return <span className={c.spinner} role="status" aria-label={label} />;
}
