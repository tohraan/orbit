"use client";

/* Student onboarding.
 *
 * WHAT CHANGED AND WHY. This used to ask eleven fields across four steps, and
 * the first seven of them — name, email, phone, degree, branch, year,
 * graduation — were read by nothing that ranks anything. A student who gave up
 * partway had handed over a contact card and no basis for a recommendation.
 *
 * The questions are now the matcher's inputs, asked heaviest first
 * (packages/core/src/match.ts: level 34, field 26, funding 18, country 12),
 * with at most three fields on a screen and at most one IDEA on a screen. Name
 * and email are not asked at all, because sign-up already took both.
 *
 * ONE QUESTION, ONE SCREEN. The opening step is a choice of cards rather than
 * a dropdown: degree level is the single heaviest factor, it has four answers,
 * and a card carries the thing a <select> cannot — what the answer MEANS for
 * what you will be shown. It is also the cheapest possible first interaction:
 * one tap, no typing, no keyboard on a phone.
 *
 * MOTION. The product's standing rule forbids transform animation, because a
 * layout that moves under the cursor is harder to use (design §77). That rule
 * is lifted here and only here, on instruction, because in a setup flow the
 * motion IS the content: one card arriving at a time is what makes a form feel
 * like a conversation. It stays bounded — entry and hover only, nothing that
 * loops, nothing that moves after it has settled — and `prefers-reduced-motion`
 * removes all of it. Hover lift is 2px and 150ms, which is the same budget the
 * rest of the product spends on colour.
 *
 * Single-choice groups behave like radios: tapping the chosen option again
 * does not clear it, because clearing by accident on a one-of-four question is
 * worse than switching. Where "no preference" is a real answer it is its own
 * option, explicit rather than reachable by double-tap.
 */

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import s from "./onboarding.module.css";
import { Button } from "@/components/ui/Button";
import { Icon, type IconName } from "@/components/ui/Icon";
import { PhoneField, Select, TagPicker } from "@/components/ui/Field";
import { useToast } from "@/components/feedback/Toast";
import { EMPTY_PROFILE, useProfile, type Profile } from "@/lib/data";
import { PHASES, completeness, phaseStates } from "@/lib/completeness";

/* The degrees BITS Pilani Dubai actually awards. */
const DEGREES = [
  { value: "be", label: "B.E." },
  { value: "bba", label: "BBA" },
  { value: "mba", label: "MBA" },
  { value: "me", label: "M.E. / M.Sc." },
  { value: "phd", label: "PhD" },
];

const YEARS = ["1st year", "2nd year", "3rd year", "4th year", "Final year", "Graduated"];

/* The opening question, as cards.
 *
 * `blurb` says what choosing it changes about what you are shown, not what the
 * word means — a student knows what a Master's is. Naming the consequence is
 * what makes this a decision rather than a data-entry field. */
const LEVELS: { value: string; label: string; icon: IconName; blurb: string }[] = [
  {
    value: "bachelors",
    label: "Bachelor's",
    icon: "school",
    blurb: "Undergraduate research internships, summer schools and scholarships that take you before you graduate.",
  },
  {
    value: "masters",
    label: "Master's",
    icon: "explore",
    blurb: "Funded Master's places, exchange programmes and the scholarships that pay for them.",
  },
  {
    value: "phd",
    label: "PhD",
    icon: "sparkle",
    blurb: "Doctoral positions, studentships and the fellowships attached to a supervisor and a project.",
  },
  {
    value: "postdoc",
    label: "Postdoc",
    icon: "globe",
    blurb: "Postdoctoral fellowships and early-career research grants.",
  },
];

/* "No preference" is an option, not something you reach by tapping twice.
 *
 * It stores the empty string, which match.ts reads as "not set" — so choosing
 * it genuinely forfeits those 18 points of judgeable weight and leaves this
 * phase showing as unfinished. That is the truth about what the answer buys,
 * so the hint says it rather than letting the student discover it as a profile
 * that will not reach 100% no matter what they do. */
const FUNDING = [
  { value: "fully_funded", label: "Fully funded only", hint: "Tuition and living costs covered" },
  { value: "partially_funded", label: "Partial is fine", hint: "I can cover some of it" },
  { value: "stipend", label: "A stipend matters most", hint: "Paid work over paid fees" },
  { value: "", label: "No preference", hint: "Show me everything — costs 18% of ranking confidence" },
];

/* Tap-to-add suggestions. Not a closed list — the field accepts anything
 * typed, because a student whose subject is missing should not be stuck. */
const FIELD_SUGGESTIONS = [
  "Computer Science", "Artificial Intelligence", "Robotics", "Materials",
  "Renewable Energy", "Biotechnology", "Mechanical Design", "Electronics",
  "Data Science", "Civil Engineering", "Chemical Engineering", "Public Health",
  "Economics", "Management",
];

const COUNTRY_SUGGESTIONS = [
  "Germany", "United States", "United Kingdom", "Canada", "Australia",
  "Singapore", "Japan", "South Korea", "Switzerland", "Netherlands",
  "Sweden", "France", "Italy", "United Arab Emirates",
];

/* The step list comes from lib/completeness.ts, so the flow and the profile
 * hub can never disagree about what counts as done — the usual way a setup
 * flow ends up claiming complete on a profile with empty fields. */
const STEPS = PHASES;

export default function WelcomePage() {
  return (
    <Suspense fallback={<div className={s.shell}><div className={s.card} /></div>}>
      <WelcomeFlow />
    </Suspense>
  );
}

/* Exported so the first-run overlay presents this flow rather than a second
 * copy of these questions — two onboarding flows is how the questions drift
 * apart. `embedded` changes only the chrome and where "done" goes. */
export function WelcomeFlow({ embedded, onDone }: { embedded?: boolean; onDone?: () => void } = {}) {
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const { profile, ready, save } = useProfile();
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Profile>(EMPTY_PROFILE);

  useEffect(() => {
    if (ready) setDraft(profile);
  }, [ready, profile]);

  /* ?from=<phase> lets the profile hub drop someone straight into the group it
   * is nagging them about, instead of making them click through the ones they
   * have already done. Applied once, after the profile loads. */
  const [jumped, setJumped] = useState(false);
  useEffect(() => {
    if (!ready || jumped) return;
    const from = params.get("from");
    const i = STEPS.findIndex((p) => p.id === from);
    if (i >= 0) setStep(i);
    setJumped(true);
  }, [ready, jumped, params]);

  const set = (k: keyof Profile, v: string) => setDraft((d) => ({ ...d, [k]: v }));

  /* Progress counts fields actually filled, not the step number — skipping a
   * step must not claim progress that was not made. */
  const pct = useMemo(() => completeness(draft), [draft]);
  const states = useMemo(() => phaseStates(draft), [draft]);
  const phase = STEPS[step];
  const last = step === STEPS.length - 1;

  async function finish() {
    await save(draft);
    if (onDone) {
      onDone();
      return;
    }
    toast("Saved to your profile");
    router.push("/");
  }

  return (
    <div className={embedded ? s.embedded : s.shell}>
      <div className={s.card}>
        {/* Rail of steps. Dots rather than named tabs: four words across the
            top competed with the question for the eye, and the names are
            already in the heading of whichever step you are on. */}
        <div className={s.rail}>
          <div className={s.dots}>
            {STEPS.map((p, i) => (
              <button
                key={p.id}
                type="button"
                className={[
                  s.dot,
                  i === step ? s.dotOn : null,
                  i !== step && states[i]?.complete && states[i].total > 0 ? s.dotDone : null,
                ].filter(Boolean).join(" ")}
                aria-label={`Step ${i + 1} of ${STEPS.length}: ${p.title}`}
                aria-current={i === step ? "step" : undefined}
                onClick={() => setStep(i)}
              />
            ))}
          </div>
          <span className={s.count}>
            {pct}% <span className={s.countLabel}>of what we rank on</span>
          </span>
        </div>

        <div className={s.head} key={phase.id}>
          <span className={s.eyebrow}>
            <Icon name={phase.icon} size={14} />
            Step {step + 1} of {STEPS.length}
            {phase.weight > 0 ? <em className={s.weight}>{phase.weight}% of your match</em> : null}
          </span>
          <h2 className={s.title}>{QUESTION[phase.id].title}</h2>
          <p className={s.sub}>{QUESTION[phase.id].sub}</p>
        </div>

        {/* Each step is keyed by its id so React remounts on change, which is
            what lets the entry animation replay per step rather than once. */}
        <div className={s.body} key={`body-${phase.id}`}>
          {phase.id === "level" ? (
            <div className={s.cards} role="radiogroup" aria-label="The level you are applying at">
              {LEVELS.map((l, i) => (
                <button
                  key={l.value}
                  type="button"
                  role="radio"
                  aria-checked={draft.level === l.value}
                  className={[s.choice, draft.level === l.value ? s.choiceOn : null].filter(Boolean).join(" ")}
                  style={{ "--i": i } as React.CSSProperties}
                  onClick={() => set("level", l.value)}
                >
                  <span className={s.choiceMark} aria-hidden="true">
                    <Icon name={l.icon} size={22} />
                  </span>
                  <span className={s.choiceText}>
                    <span className={s.choiceLabel}>{l.label}</span>
                    <span className={s.choiceBlurb}>{l.blurb}</span>
                  </span>
                  <span className={s.choiceTick} aria-hidden="true">
                    <Icon name="check" size={14} />
                  </span>
                </button>
              ))}
            </div>
          ) : phase.id === "subjects" ? (
            <Field
              label="Subjects you want to work in"
              hint="Tap a suggestion or type your own. Add two or three — one is enough to rank with, more is better."
            >
              <TagPicker
                value={draft.fields}
                onChange={(v) => set("fields", v)}
                suggestions={FIELD_SUGGESTIONS}
                placeholder="e.g. robotics"
                ariaLabel="Subjects you want to work in"
              />
            </Field>
          ) : phase.id === "funding" ? (
            <>
              <Field label="Funding you need">
                <div className={s.options} role="radiogroup" aria-label="Funding you need">
                  {FUNDING.map((f, i) => (
                    <button
                      key={f.value || "none"}
                      type="button"
                      role="radio"
                      aria-checked={draft.funding === f.value}
                      className={[s.option, draft.funding === f.value ? s.optionOn : null].filter(Boolean).join(" ")}
                      style={{ "--i": i } as React.CSSProperties}
                      onClick={() => set("funding", f.value)}
                    >
                      <span className={s.optionLabel}>{f.label}</span>
                      <span className={s.optionHint}>{f.hint}</span>
                    </button>
                  ))}
                </div>
              </Field>

              <Field
                label="Countries you would go to"
                hint="Only ever used to promote a match — nothing is ruled out for missing one, and over half of all listings name no country at all."
              >
                <TagPicker
                  value={draft.countries}
                  onChange={(v) => set("countries", v)}
                  suggestions={COUNTRY_SUGGESTIONS}
                  placeholder="e.g. Germany"
                  ariaLabel="Countries you would go to"
                />
              </Field>
            </>
          ) : (
            <>
              <div className={s.row}>
                <Field label="Degree">
                  <Select
                    value={draft.degree}
                    options={DEGREES}
                    onChange={(v) => set("degree", v)}
                    placeholder="Choose your degree"
                    ariaLabel="Degree"
                  />
                </Field>
                <Field label="Year of study">
                  <Select
                    value={draft.year}
                    options={YEARS.map((y) => ({ value: y, label: y }))}
                    onChange={(v) => set("year", v)}
                    placeholder="Choose your year"
                    ariaLabel="Year of study"
                  />
                </Field>
              </div>

              <Field label="Phone" hint="Optional. Nothing sends to it today — it is here for when deadline reminders are switched on.">
                <PhoneField value={draft.phone} onChange={(v) => set("phone", v)} />
              </Field>

              <p className={s.privacy}>
                Your answers are stored against your account, so they follow you to any device you sign in
                on and nobody else can read them. You can change or erase all of it from your profile at
                any time.
              </p>
            </>
          )}
        </div>

        <div className={s.foot}>
          {/* On the first step of the OVERLAY there is nowhere back to go: the
              portal behind it is what this is gating. Render nothing at all
              rather than a disabled button with an empty label — that was a
              grey rounded blob in the corner with no name, no purpose and no
              way to find out what it did. `.footRight` carries `margin-left:
              auto`, so the footer stays right-aligned without a placeholder. */}
          {step === 0 && embedded ? null : (
            <Button
              variant="ghost"
              icon="chevron-left"
              onClick={() => (step === 0 ? router.push("/") : setStep(step - 1))}
            >
              {step === 0 ? "Not now" : "Back"}
            </Button>
          )}

          <div className={s.footRight}>
            {/* Skip is quiet and always available. A setup flow with no exit is
                a setup flow people abandon at the browser's back button, which
                loses the answers they HAD given. */}
            {!last ? (
              <>
                <button type="button" className={s.skip} onClick={() => setStep(step + 1)}>
                  Skip
                </button>
                <Button variant="primary" iconAfter="arrow-right" onClick={() => setStep(step + 1)}>
                  Continue
                </Button>
              </>
            ) : (
              <Button variant="primary" iconAfter="arrow-right" onClick={finish}>
                Save and start
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* The question each step actually asks, in the student's words.
 *
 * Kept out of PHASES because that list is shared with /profile, where these
 * strings would be wrong: the hub labels a GROUP OF FIELDS ("Funding and
 * places"), while the flow asks a PERSON something ("What would it take for
 * this to be affordable?"). One list serving both is how a settings page ends
 * up talking to you like a wizard. */
const QUESTION: Record<string, { title: string; sub: string }> = {
  level: {
    title: "What are you looking for?",
    sub: "Pick the level you would be applying at. It decides more of your ranking than anything else you can tell us.",
  },
  subjects: {
    title: "What do you want to work on?",
    sub: "We read these against the title and description of every listing, so two or three real subjects beat a long list.",
  },
  funding: {
    title: "What would make this affordable?",
    sub: "And anywhere you would move for. Both only ever promote a listing — neither rules anything out.",
  },
  course: {
    title: "A little about your course",
    sub: "None of this changes your ranking. Skip it freely; it is here so dates and reminders can make sense later.",
  },
};

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className={s.field}>
      <span className={s.label}>{label}</span>
      {children}
      {hint ? <span className={s.hint}>{hint}</span> : null}
    </div>
  );
}
