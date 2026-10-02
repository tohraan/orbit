"use client";

/* Student onboarding: who you are, what you study, what you are looking for.
 *
 * Three steps, each skippable. The matcher degrades honestly rather than
 * failing when a field is blank (it reports confidence, see
 * packages/core/src/match.ts), so a student who skips everything still gets a
 * working portal — which is why nothing here is a gate.
 *
 * Only the last step feeds matching. The first two identify the student and
 * are kept so the product can address them and so a future reminder has
 * somewhere to send to. All of it is localStorage; the privacy note at the end
 * says so in the student's own terms rather than burying it.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import s from "./onboarding.module.css";
import { PageHead } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/feedback/Toast";
import { EMPTY_PROFILE, useProfile, type Profile } from "@/lib/store";

const LEVELS = [
  { value: "bachelors", label: "Bachelor's" },
  { value: "masters", label: "Master's" },
  { value: "phd", label: "PhD" },
  { value: "postdoc", label: "Postdoc" },
];
const YEARS = ["1st year", "2nd year", "3rd year", "4th year", "Final year", "Graduated"];
const FUNDING = [
  { value: "fully_funded", label: "Fully funded only" },
  { value: "partially_funded", label: "Partial is fine" },
  { value: "stipend", label: "A stipend matters most" },
];

const STEPS = ["You", "Your course", "What you want"] as const;

export default function WelcomePage() {
  const router = useRouter();
  const toast = useToast();
  const { profile, ready, save } = useProfile();
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Profile>(EMPTY_PROFILE);

  useEffect(() => {
    if (ready) setDraft(profile);
  }, [ready, profile]);

  const set = (k: keyof Profile, v: string) => setDraft((d) => ({ ...d, [k]: v }));

  /* Progress counts the fields that are actually filled, not the step number —
   * so skipping a step does not claim progress that was not made. */
  const TRACKED: (keyof Profile)[] = ["name", "email", "degree", "course", "year", "level", "fields", "countries", "funding"];
  const filled = TRACKED.filter((k) => String(draft[k] ?? "").trim()).length;
  const pct = Math.round((filled / TRACKED.length) * 100);

  function finish() {
    save(draft);
    toast("Profile saved on this device");
    router.push("/");
  }

  return (
    <div className={s.shell}>
      <PageHead
        eyebrow="Welcome"
        title="Let's set you up"
        description="Three short steps. You can skip any of them and fill them in later from your profile."
      />

      <div className={s.progress}>
        <span className={s.track}>
          <span className={s.fill} style={{ width: `${Math.max(3, pct)}%` }} />
        </span>
        <span className={s.pct}>{pct}%</span>
      </div>

      <div className={s.card}>
        <span className={s.step}>
          Step {step + 1} of {STEPS.length} · {STEPS[step]}
        </span>

        {step === 0 ? (
          <>
            <Field label="Your name" hint="So the portal can address you.">
              <input className={s.input} value={draft.name} onChange={(e) => set("name", e.target.value)} maxLength={120} />
            </Field>
            <div className={s.row}>
              <Field label="Campus email" hint="Used for deadline reminders once email is switched on.">
                <input className={s.input} type="email" inputMode="email" value={draft.email} onChange={(e) => set("email", e.target.value)} maxLength={160} placeholder="f2024xxxx@dubai.bits-pilani.ac.in" />
              </Field>
              <Field label="Phone" hint="Optional. Nothing sends to it today.">
                <input className={s.input} type="tel" inputMode="tel" value={draft.phone} onChange={(e) => set("phone", e.target.value)} maxLength={40} />
              </Field>
            </div>
          </>
        ) : step === 1 ? (
          <>
            <div className={s.row}>
              <Field label="Degree" hint="For example B.E. (Hons.)">
                <input className={s.input} value={draft.degree} onChange={(e) => set("degree", e.target.value)} maxLength={120} placeholder="B.E. (Hons.)" />
              </Field>
              <Field label="Branch or course">
                <input className={s.input} value={draft.course} onChange={(e) => set("course", e.target.value)} maxLength={120} placeholder="Computer Science" />
              </Field>
            </div>
            <Field label="Year of study">
              <div className={s.chips}>
                {YEARS.map((y) => (
                  <button key={y} type="button" className={[s.chip, draft.year === y ? s.chipOn : ""].join(" ")} onClick={() => set("year", draft.year === y ? "" : y)}>
                    {y}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Expected graduation" hint="So you can tell whether a programme's dates work.">
              <input className={s.input} value={draft.graduation} onChange={(e) => set("graduation", e.target.value)} maxLength={60} placeholder="June 2028" />
            </Field>
          </>
        ) : (
          <>
            <Field label="Degree level you are applying at" hint="The single biggest factor in matching.">
              <div className={s.chips}>
                {LEVELS.map((l) => (
                  <button key={l.value} type="button" className={[s.chip, draft.level === l.value ? s.chipOn : ""].join(" ")} onClick={() => set("level", draft.level === l.value ? "" : l.value)}>
                    {l.label}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Fields you work in" hint="Comma separated. Matched against each listing's title and description.">
              <input className={s.input} value={draft.fields} onChange={(e) => set("fields", e.target.value)} maxLength={200} placeholder="computer science, robotics, materials" />
            </Field>
            <Field label="Countries you would go to" hint="Only ever used to promote a match, never to rule one out.">
              <input className={s.input} value={draft.countries} onChange={(e) => set("countries", e.target.value)} maxLength={200} placeholder="Germany, Canada, United Kingdom" />
            </Field>
            <Field label="Funding you need">
              <div className={s.chips}>
                {FUNDING.map((f) => (
                  <button key={f.value} type="button" className={[s.chip, draft.funding === f.value ? s.chipOn : ""].join(" ")} onClick={() => set("funding", draft.funding === f.value ? "" : f.value)}>
                    {f.label}
                  </button>
                ))}
              </div>
            </Field>
            <p className={s.privacy}>
              Everything here is stored in this browser and sent nowhere. There are no accounts, so there is
              no record of you on a server to be lost — and equally none of this follows you to another
              device, and clearing site data clears it. You can change or delete all of it from your profile.
            </p>
          </>
        )}

        <div className={s.foot}>
          <Button variant="ghost" onClick={() => (step === 0 ? router.push("/") : setStep(step - 1))}>
            {step === 0 ? "Skip for now" : "Back"}
          </Button>
          <div style={{ display: "flex", gap: "var(--s-2)" }}>
            {step < STEPS.length - 1 ? (
              <>
                <Button variant="secondary" onClick={() => setStep(step + 1)}>
                  Skip this step
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
    <label className={s.field}>
      <span className={s.label}>{label}</span>
      {children}
      {hint ? <span className={s.hint}>{hint}</span> : null}
    </label>
  );
}
