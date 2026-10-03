"use client";

/* Student onboarding.
 *
 * Deliberately NOT animated. The product's own motion budget is 150–180ms on
 * colour and border (design-ieee.md §77); a setup flow that slides and fades
 * between steps would be the one place in the app that behaves differently,
 * and it makes a four-field form feel longer than it is. Steps swap, the
 * progress bar moves, nothing travels.
 *
 * Single-choice groups behave like radios: tapping the chosen option again
 * does not clear it, because clearing by accident on a one-of-four question is
 * a worse outcome than switching. Where "none" is a real answer, it is its own
 * option — explicit rather than reachable by double-tap.
 *
 * Everything is stored against the student's id (lib/store.ts), so two people
 * on one machine do not see each other's answers.
 */

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import s from "./onboarding.module.css";
import { Button } from "@/components/ui/Button";
import { CampusEmail, PhoneField, Select, TagPicker } from "@/components/ui/Field";
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

const BRANCHES = [
  "Computer Science", "Electronics & Communication", "Electrical & Electronics",
  "Mechanical", "Chemical", "Civil", "Biotechnology", "Business Administration",
];

const YEARS = ["1st year", "2nd year", "3rd year", "4th year", "Final year", "Graduated"];

const LEVELS = [
  { value: "bachelors", label: "Bachelor's" },
  { value: "masters", label: "Master's" },
  { value: "phd", label: "PhD" },
  { value: "postdoc", label: "Postdoc" },
];

const FUNDING = [
  { value: "fully_funded", label: "Fully funded only" },
  { value: "partially_funded", label: "Partial is fine" },
  { value: "stipend", label: "A stipend matters most" },
  /* "None" is an option, not something you reach by tapping twice. */
  { value: "", label: "No preference" },
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

/* Exported so the first-run overlay can present the same flow rather than a
 * second copy of these questions — two onboarding flows is how the questions
 * drift apart. `embedded` changes only the chrome and where "done" goes. */
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
      <div className={s.intro} hidden={embedded}>
        <span className="eyebrow">Welcome</span>
        <h1 className="t-page-title">Set up your profile</h1>
        <p className="t-body c-secondary">
          Three short steps. Skip anything you would rather not answer — the portal works either way, it
          just ranks less confidently.
        </p>
      </div>

      <div className={s.progress}>
        <span className={s.track}>
          <span className={s.fill} style={{ width: `${Math.max(3, pct)}%` }} />
        </span>
        <span className={s.pct}>{pct}%</span>
      </div>

      <div className={s.card}>
        <div className={s.stepRow}>
          {STEPS.map((p, i) => (
            <button
              key={p.id}
              type="button"
              className={[s.stepPip, i === step ? s.stepPipOn : states[i]?.complete ? s.stepPipDone : null].filter(Boolean).join(" ")}
              onClick={() => setStep(i)}
            >
              {states[i]?.complete && i !== step ? "✓ " : ""}
              {p.title}
            </button>
          ))}
        </div>

        {/* What this group buys, in the student's terms. A question with a
            stated payoff gets answered; one without reads as data collection. */}
        <p className="t-meta c-muted">{STEPS[step].payoff}</p>

        {step === 0 ? (
          <>
            <Field label="Your name" hint="So the portal can address you.">
              <input className={s.input} value={draft.name} onChange={(e) => set("name", e.target.value)} maxLength={120} placeholder="Aarav Sharma" />
            </Field>
            <Field label="Campus email" hint="The domain is fixed — just your ID.">
              <CampusEmail value={draft.email} onChange={(v) => set("email", v)} />
            </Field>
            <Field label="Phone" hint="Optional. Nothing sends to it today.">
              <PhoneField value={draft.phone} onChange={(v) => set("phone", v)} />
            </Field>
          </>
        ) : step === 1 ? (
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
            <Field label="Branch">
              <Select
                value={draft.course}
                options={BRANCHES.map((b) => ({ value: b, label: b }))}
                onChange={(v) => set("course", v)}
                placeholder="Choose your branch"
                ariaLabel="Branch"
              />
            </Field>
            <Field label="Expected graduation" hint="So you can tell whether a programme's dates work.">
              <input className={s.input} value={draft.graduation} onChange={(e) => set("graduation", e.target.value)} maxLength={60} placeholder="June 2028" />
            </Field>
          </>
        ) : step === 2 ? (
          <>
            <Field label="Applying at which level" hint="The single biggest factor in how we rank things for you.">
              <div className={s.chips}>
                {LEVELS.map((l) => (
                  <button
                    key={l.value}
                    type="button"
                    role="radio"
                    aria-checked={draft.level === l.value}
                    className={[s.chip, draft.level === l.value ? s.chipOn : ""].join(" ")}
                    onClick={() => set("level", l.value)}
                  >
                    {l.label}
                  </button>
                ))}
              </div>
            </Field>

            <Field
              label="Subjects you want to work in"
              hint="Tap a suggestion or type your own. We match these against each listing's title and description."
            >
              <TagPicker
                value={draft.fields}
                onChange={(v) => set("fields", v)}
                suggestions={FIELD_SUGGESTIONS}
                placeholder="e.g. robotics"
                ariaLabel="Subjects you want to work in"
              />
            </Field>

          </>
        ) : (
          <>
            <Field label="Countries you would go to" hint="Only ever used to promote a match — nothing is ruled out for missing one.">
              <TagPicker
                value={draft.countries}
                onChange={(v) => set("countries", v)}
                suggestions={COUNTRY_SUGGESTIONS}
                placeholder="e.g. Germany"
                ariaLabel="Countries you would go to"
              />
            </Field>

            <Field label="Funding you need">
              <div className={s.chips}>
                {FUNDING.map((f) => (
                  <button
                    key={f.value || "none"}
                    type="button"
                    role="radio"
                    aria-checked={draft.funding === f.value}
                    className={[s.chip, draft.funding === f.value ? s.chipOn : ""].join(" ")}
                    onClick={() => set("funding", f.value)}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </Field>

            <p className={s.privacy}>
              Your answers are stored against your account, so they follow you to any device you sign in
              on and nobody else can read them. You can change or erase all of it from your profile at
              any time.
            </p>
          </>
        )}

        <div className={s.foot}>
          <Button
            variant="ghost"
            disabled={embedded && step === 0}
            onClick={() => (step === 0 ? (embedded ? undefined : router.push("/")) : setStep(step - 1))}
          >
            {step === 0 ? (embedded ? "" : "Skip for now") : "Back"}
          </Button>
          <div className={s.footRight}>
            {step < STEPS.length - 1 ? (
              <>
                <Button variant="secondary" onClick={() => setStep(step + 1)}>
                  Skip
                </Button>
                <Button variant="primary" iconAfter="arrow-right" onClick={() => setStep(step + 1)}>
                  Continue
                </Button>
              </>
            ) : (
              <Button variant="primary" onClick={finish}>
                Save and start
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className={s.field}>
      <span className={s.label}>{label}</span>
      {children}
      {hint ? <span className={s.hint}>{hint}</span> : null}
    </div>
  );
}
