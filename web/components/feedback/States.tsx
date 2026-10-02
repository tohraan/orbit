import type { ReactNode } from "react";
import s from "./feedback.module.css";
import { Icon, type IconName } from "../ui/Icon";

/* Copy comes from design-ieee.md §45, §46 and §71 where it specifies it, and
 * follows the same shape where it does not: what happened, then what the
 * student can do about it. */

export function EmptyState({
  icon = "inbox",
  title,
  body,
  actions,
  compact,
}: {
  icon?: IconName;
  title: string;
  body: string;
  actions?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={[s.state, compact ? s.stateCompact : null].filter(Boolean).join(" ")} role="status">
      <span className={s.stateIcon}>
        <Icon name={icon} size={20} />
      </span>
      <p className={s.stateTitle}>{title}</p>
      <p className={s.stateBody}>{body}</p>
      {actions ? <div className={s.stateActions}>{actions}</div> : null}
    </div>
  );
}

/* §71: explain what happened and what to do. Never show a raw API error — the
 * route handlers already replace them with a fixed sentence, and this is the
 * second half of that contract. */
export function ErrorState({
  title = "Couldn't load opportunities",
  body = "The opportunity list couldn't be loaded right now.",
  actions,
  compact,
}: {
  title?: string;
  body?: string;
  actions?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={[s.state, compact ? s.stateCompact : null].filter(Boolean).join(" ")} role="alert">
      <span className={[s.stateIcon, s.stateIconDanger].join(" ")}>
        <Icon name="alert" size={20} />
      </span>
      <p className={s.stateTitle}>{title}</p>
      <p className={s.stateBody}>{body}</p>
      {actions ? <div className={s.stateActions}>{actions}</div> : null}
    </div>
  );
}
