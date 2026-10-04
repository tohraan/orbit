"use client";

/* The onboarding component system.
 *
 * WHY THIS EXISTS AS A SYSTEM. Every screen used to be styled where it was
 * written, so each one drifted: one step's options were chips, the next's were
 * a grid, a third's were a dropdown, and no two had the same padding, radius
 * or selected state. The result read as a stack of unrelated screens rather
 * than one setup journey — which is a structural problem, not a styling one,
 * and it comes back the moment a fifth step is written by hand.
 *
 * So the screens no longer own their appearance. A step declares WHAT it is
 * asking and WHICH shape of answer it takes; these components decide how that
 * looks. A new step cannot be inconsistent, because there is nothing left for
 * it to be inconsistent about.
 *
 * SURFACE LAYERS (three, deliberately):
 *
 *     app background   — the page or the frosted scrim behind the overlay
 *          ↓
 *     Shell            — the setup surface. Raised, bordered, opaque.
 *          ↓
 *     Card / Option    — the things you can actually choose
 *
 * Each layer is one step up in tone, so depth is read from contrast and border
 * rather than from shadow. Light mode is not white-on-white and dark mode is
 * not black-on-black: both use the token layer's surface levels, which is what
 * the tokens are for.
 *
 * MOTION. 150–220ms on selection, hover and step change. Hover is a 2px lift,
 * the same budget the rest of the product spends on colour. Nothing bounces,
 * nothing glows, nothing scales beyond 1.0, and nothing loops. All of it is
 * removed — not softened — under prefers-reduced-motion.
 */

import type { ReactNode } from "react";
import s from "./onboarding.module.css";
import { Icon, type IconName } from "../ui/Icon";

/* ------------------------------------------------------------------ shell ---
 * One frame for every step, so the chrome never moves between questions. The
 * body has a floor rather than a fixed height: a step with four cards and a
 * step with one field would otherwise resize the frame under the cursor and
 * move the Continue button the student is already reaching for.
 */
export function OnboardingShell({
  step,
  total,
  children,
  embedded,
}: {
  step: number;
  total: number;
  children: ReactNode;
  embedded?: boolean;
}) {
  return (
    <div className={[s.shell, embedded ? s.shellEmbedded : null].filter(Boolean).join(" ")}>
      <OnboardingProgress step={step} total={total} />
      <div className={s.body}>{children}</div>
    </div>
  );
}

/* --------------------------------------------------------------- progress ---
 * Segments, not a percentage bar. "Step 2 of 4" is a countable promise; a bar
 * at 43% is a number nobody can act on. The segments are small and quiet
 * because progress should reassure, not compete with the question.
 */
export function OnboardingProgress({ step, total }: { step: number; total: number }) {
  return (
    <div className={s.progress}>
      <div className={s.segments} role="presentation">
        {Array.from({ length: total }, (_, i) => (
          <span
            key={i}
            className={[s.segment, i < step ? s.segmentDone : null, i === step ? s.segmentOn : null]
              .filter(Boolean)
              .join(" ")}
          />
        ))}
      </div>
      <span className={s.stepCount}>
        Step {step + 1} of {total}
      </span>
    </div>
  );
}

/* --------------------------------------------------------------- question ---
 * Centred, and the only thing competing for attention at the top of a step.
 * One dominant question per screen is the rule the old flow broke by stacking
 * a title, a payoff line, three labels and three hints before the first
 * control.
 */
export function OnboardingQuestion({
  title,
  sub,
  note,
}: {
  title: string;
  sub?: string;
  /** What answering buys, in the student's terms. Small, under the question. */
  note?: string;
}) {
  return (
    <header className={s.question}>
      <h2 className={s.questionTitle}>{title}</h2>
      {sub ? <p className={s.questionSub}>{sub}</p> : null}
      {note ? <p className={s.questionNote}>{note}</p> : null}
    </header>
  );
}

/* ------------------------------------------------------------------- grid ---
 * `cols` is a hint, not a command: the grid collapses to one column on a phone
 * regardless, because a two-up grid of tappable cards at 360px gives neither
 * card enough width for its description.
 */
export function SelectionGrid({ cols = 2, children }: { cols?: 1 | 2; children: ReactNode }) {
  return <div className={cols === 1 ? s.gridOne : s.grid}>{children}</div>;
}

/* ------------------------------------------------------------------- card ---
 * One anatomy for every option, everywhere:
 *
 *     ┌──────────────────────────────┐
 *     │  [icon]                 (○)  │
 *     │  Title                       │
 *     │  Short description           │
 *     └──────────────────────────────┘
 *
 * The whole card is the hit target, not a radio dot inside it. Cards in a row
 * stretch to equal height (`align-items: stretch` on the grid) so one option
 * having a longer description cannot make its neighbour look like a different
 * component.
 *
 * Selection is carried by THREE things at once — border, surface tint and the
 * indicator — so it survives greyscale, colour blindness and a bad projector.
 * Never by hue alone.
 */
export function SelectionCard({
  icon,
  title,
  description,
  selected,
  multi,
  onSelect,
  index = 0,
}: {
  icon?: IconName;
  title: string;
  description?: string;
  selected: boolean;
  /** Checkbox semantics and a square indicator, rather than radio and a dot. */
  multi?: boolean;
  onSelect: () => void;
  /** Position in its grid, for the entry stagger. */
  index?: number;
}) {
  return (
    <button
      type="button"
      role={multi ? "checkbox" : "radio"}
      aria-checked={selected}
      className={[s.card, selected ? s.cardOn : null].filter(Boolean).join(" ")}
      style={{ "--i": index } as React.CSSProperties}
      onClick={onSelect}
    >
      <span className={s.cardTop}>
        {icon ? (
          <span className={s.cardIcon} aria-hidden="true">
            <Icon name={icon} size={20} />
          </span>
        ) : (
          <span />
        )}
        <span
          className={[s.indicator, multi ? s.indicatorSquare : null].filter(Boolean).join(" ")}
          aria-hidden="true"
        >
          <Icon name="check" size={12} />
        </span>
      </span>

      <span className={s.cardText}>
        <span className={s.cardTitle}>{title}</span>
        {description ? <span className={s.cardDesc}>{description}</span> : null}
      </span>
    </button>
  );
}

/* ------------------------------------------------------------------- nav ---
 * Always in the same place, always the same two controls, directly under the
 * decision rather than floating away from it. The primary action is disabled
 * until the step can be answered, so the student is never invited to press
 * something that will not move them forward.
 */
export function OnboardingNav({
  onBack,
  onNext,
  onSkip,
  backLabel = "Back",
  nextLabel = "Continue",
  nextDisabled,
  busy,
}: {
  onBack?: () => void;
  onNext: () => void;
  onSkip?: () => void;
  backLabel?: string;
  nextLabel?: string;
  nextDisabled?: boolean;
  busy?: boolean;
}) {
  return (
    <div className={s.nav}>
      {/* Rendered only when there is somewhere back to go. A disabled ghost
          button with an empty label is a grey blob with no name. */}
      {onBack ? (
        <button type="button" className={s.back} onClick={onBack}>
          <Icon name="chevron-left" size={16} />
          {backLabel}
        </button>
      ) : (
        <span />
      )}

      <div className={s.navRight}>
        {onSkip ? (
          <button type="button" className={s.skip} onClick={onSkip}>
            Skip
          </button>
        ) : null}
        <button type="button" className={s.next} onClick={onNext} disabled={nextDisabled || busy}>
          {busy ? "Saving…" : nextLabel}
          {!busy ? <Icon name="arrow-right" size={16} /> : null}
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ field ---
 * For the steps that genuinely need an input rather than a choice. Same label
 * and hint treatment as a card's title and description, so a typed answer and
 * a chosen one look like they belong to the same flow.
 */
export function OnboardingField({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className={s.field}>
      <span className={s.fieldLabel}>{label}</span>
      {children}
      {hint ? <span className={s.fieldHint}>{hint}</span> : null}
    </div>
  );
}
