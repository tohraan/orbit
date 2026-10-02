import type { ReactNode } from "react";
import s from "./ui.module.css";
import { Icon, type IconName } from "./Icon";

/* §7 and §108: a chip's tone is semantic, and the meaning is always in the
 * text too. Nothing is communicated by colour alone. */
export type ChipTone = "neutral" | "quiet" | "funding" | "saved" | "compare" | "info" | "urgent" | "soon" | "solid" | "college";

const TONE: Record<ChipTone, string | undefined> = {
  neutral: undefined,
  quiet: s.chipQuiet,
  funding: s.chipFunding,
  saved: s.chipSaved,
  compare: s.chipCompare,
  info: s.chipInfo,
  urgent: s.chipUrgent,
  soon: s.chipSoon,
  solid: s.chipSolid,
  college: s.chipCollege,
};

export function Chip({
  tone = "neutral",
  icon,
  children,
  title,
  className,
}: {
  tone?: ChipTone;
  icon?: IconName;
  children: ReactNode;
  title?: string;
  className?: string;
}) {
  return (
    <span className={[s.chip, TONE[tone], className].filter(Boolean).join(" ")} title={title}>
      {icon ? <Icon name={icon} size={14} strokeWidth={1.8} /> : null}
      {children}
    </span>
  );
}

export { s as uiStyles };
