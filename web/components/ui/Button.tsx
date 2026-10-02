import type { ComponentProps, ReactNode } from "react";
import Link from "next/link";
import s from "./ui.module.css";
import { Icon, type IconName } from "./Icon";

/* §57, §81: three variants and one implementation, so every button that does
 * the same job looks and behaves the same everywhere. */
type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const classes = (variant: Variant, size: Size, block?: boolean, extra?: string) =>
  [s.btn, s[variant], size !== "md" ? s[size] : null, block ? s.block : null, extra]
    .filter(Boolean)
    .join(" ");

type Common = {
  variant?: Variant;
  size?: Size;
  block?: boolean;
  icon?: IconName;
  iconAfter?: IconName;
  busy?: boolean;
  children?: ReactNode;
};

export function Button({
  variant = "secondary",
  size = "md",
  block,
  icon,
  iconAfter,
  busy,
  children,
  className,
  ...rest
}: Common & ComponentProps<"button">) {
  return (
    <button
      type="button"
      className={classes(variant, size, block, className)}
      aria-busy={busy || undefined}
      {...rest}
    >
      {busy ? <span className="spinner" /> : icon ? <Icon name={icon} size={16} /> : null}
      {children}
      {iconAfter ? <Icon name={iconAfter} size={16} /> : null}
    </button>
  );
}

/** An internal link that looks like a button. */
export function ButtonLink({
  variant = "secondary",
  size = "md",
  block,
  icon,
  iconAfter,
  children,
  className,
  href,
  ...rest
}: Common & ComponentProps<typeof Link>) {
  return (
    <Link href={href} className={classes(variant, size, block, className)} {...rest}>
      {icon ? <Icon name={icon} size={16} /> : null}
      {children}
      {iconAfter ? <Icon name={iconAfter} size={16} /> : null}
    </Link>
  );
}

/* §73: a link that leaves the app says so, with the arrow and with
 * rel="noreferrer" — the scraped source has no business learning the path the
 * student took to reach it. */
export function ExternalButton({
  variant = "primary",
  size = "md",
  block,
  children,
  href,
  className,
  ...rest
}: Common & ComponentProps<"a">) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={classes(variant, size, block, className)}
      {...rest}
    >
      {children}
      <Icon name="external" size={16} />
    </a>
  );
}

export function IconButton({
  label,
  name,
  variant = "secondary",
  active,
  className,
  ...rest
}: {
  label: string;
  name: IconName;
  variant?: Variant;
  active?: boolean;
} & ComponentProps<"button">) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      title={label}
      className={[s.btn, s[variant], s.iconOnly, className].filter(Boolean).join(" ")}
      {...rest}
    >
      <Icon name={name} size={16} />
    </button>
  );
}
