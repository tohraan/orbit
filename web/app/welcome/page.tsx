"use client";

/* Student onboarding — the journey. The LOOK lives entirely in
 * components/onboarding; this file decides only what is asked and in what
 * order, which is why a new step cannot drift from the others.
 *
 * INFORMATION ARCHITECTURE, decided before any styling.
 *
 * The flow used to ask eleven fields across four steps, and the first seven —
 * name, email, phone, degree, branch, year, graduation — were read by nothing
 * that ranks anything. A student who gave up partway had handed over a contact
 * card and no basis for a recommendation.
 *
 * What survives is what packages/core/src/match.ts actually scores, asked
 * heaviest first: level 34, field 26, funding 18, country 12. Timing is the
 * fifth factor and is never asked, because it is computed from the listing's
 * own deadline — information we already hold, so requesting it would be the
 * flow asking for what it can infer.
 *
 * Cut, and why:
 *   name, email     sign-up already takes both (signUp writes full_name, and
 *                   the address IS the login). Asking again re-collects what
 *                   we hold.
 *   branch          never scored, and `fields` covers the same ground better
 *                   because a student's subject interest is not their branch.
 *   graduation      never scored, and a free-text "June 2028" is a parsing
 *                   problem we do not need.
 *   degree, year    never scored, kept as ONE optional last step because the
 *                   portal uses them to say whether a programme's dates fit.
 *
 * Four steps, one decision each, three fields at the absolute most. Steps are
 * not added to make the flow feel substantial.
 *
 * PROGRESSIVE DISCLOSURE. Country only appears once a funding answer exists:
 * it is the lightest factor, it only ever promotes a listing, and showing both
 * at once made the one screen that asks two things look like a form. Answer
 * the first and the second arrives.
 */

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import s from "./onboarding.module.css";
import {
  OnboardingField,
  OnboardingNav,
  OnboardingQuestion,
  OnboardingShell,
  SelectionCard,
  SelectionGrid,
} from "@/components/onboarding/Onboarding";
import { type IconName } from "@/components/ui/Icon";
import { PhoneField, Select, TagPicker } from "@/components/ui/Field";
import { useToast } from "@/components/feedback/Toast";
import { EMPTY_PROFILE, useProfile, type Profile } from "@/lib/data";
import { PHASES } from "@/lib/completeness";

const DEGREES = [
  { value: "be", label: "B.E." },
  { value: "bba", label: "BBA" },
  { value: "mba", label: "MBA" },
  { value: "me", label: "M.E. / M.Sc." },
  { value: "phd", label: "PhD" },
];

const YEARS = ["1st year", "2nd year", "3rd year", "4th year", "Final year", "Graduated"];

/* Descriptions say what CHOOSING it changes about what you are shown — not
 * what the word means. A student knows what a Master's is; what they cannot
 * know is what the portal will do with the answer. */
const LEVELS: { value: string; label: string; icon: IconName; description: string }[] = [
  { value: "bachelors", label: "Bachelor's", icon: "school", description: "Research internships, summer schools and undergraduate scholarships." },
  { value: "masters", label: "Master's", icon: "explore", description: "Funded Master's places, exchanges and the scholarships behind them." },
  { value: "phd", label: "PhD", icon: "sparkle", description: "Doctoral positions, studentships and supervised fellowships." },
  { value: "postdoc", label: "Postdoc", icon: "globe", description: "Postdoctoral fellowships and early-career research grants." },
];

const FUNDING: { value: string; label: string; icon: IconName; description: string }[] = [
  { value: "fully_funded", label: "Fully funded only", icon: "shield", description: "Tuition and living costs both covered." },
  { value: "partially_funded", label: "Partial is fine", icon: "coins", description: "I can cover part of the cost myself." },
  { value: "stipend", label: "A stipend matters most", icon: "clock", description: "Being paid to do the work comes first." },
  /* Stored as the empty string, which match.ts reads as "not set" — so this
   * genuinely forfeits those points. The description says so rather than
   * letting it be discovered as a profile that never reaches 100%. */
  { value: "", label: "No preference", icon: "inbox", description: "Show me everything. Costs 18% of ranking confidence." },
];

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

/* Shared with /profile, so the hub and the flow cannot disagree about what is
 * asked or what counts as done. */
const STEPS = PHASES;

/* The question each step puts to a person. Deliberately not in PHASES: that
 * list labels a GROUP OF FIELDS for the profile hub ("Funding and places"),
 * while this asks someone something ("What would make this affordable?"). One
 * list serving both is how a settings page ends up talking like a wizard. */
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
    sub: "This only ever promotes a listing. Nothing is ruled out by your answer.",
  },
  course: {
    title: "A little about your course",
    sub: "None of this changes your ranking. Skip it freely — it is here so dates and reminders can make sense later.",
  },
};

export default function WelcomePage() {
  return (
    <Suspense fallback={<div className={s.page} />}>
      <div className={s.page}>
        <WelcomeFlow />
      </div>
    </Suspense>
  );
}

/* Exported so the first-run overlay presents this flow rather than a second
 * copy of these questions. `embedded` changes only the chrome and where "done"
 * goes. */
export function WelcomeFlow({ embedded, onDone }: { embedded?: boolean; onDone?: () => void } = {}) {
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const { profile, ready, save } = useProfile();
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Profile>(EMPTY_PROFILE);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (ready) setDraft(profile);
  }, [ready, profile]);

  /* ?from=<phase> drops someone straight into the group the profile hub is
   * nagging them about, rather than making them click past what they have
   * already answered. Applied once, after the profile loads. */
  const [jumped, setJumped] = useState(false);
  useEffect(() => {
    if (!ready || jumped) return;
    const from = params.get("from");
    const i = STEPS.findIndex((p) => p.id === from);
    if (i >= 0) setStep(i);
    setJumped(true);
  }, [ready, jumped, params]);

  const set = (k: keyof Profile, v: string) => setDraft((d) => ({ ...d, [k]: v }));

  const phase = STEPS[step];
  const last = step === STEPS.length - 1;

  /* Whether the CURRENT step has been answered. Drives the primary action, so
   * nobody is invited to press a button that cannot move them on. The last
   * step requires nothing — it is optional by design. */
  const answered = useMemo(() => {
    if (phase.id === "level") return !!draft.level;
    if (phase.id === "subjects") return draft.fields.trim().length > 0;
    /* `funding` is answerable as the empty string ("No preference"), which is
     * indistinguishable from untouched. So the step is gated on the student
     * having reached it rather than on a truthy value — otherwise choosing
     * "No preference" leaves Continue disabled forever. */
    if (phase.id === "funding") return draft.funding !== undefined;
    return true;
  }, [phase.id, draft]);

  async function finish() {
    setBusy(true);
    try {
      await save(draft);
    } finally {
      setBusy(false);
    }
    if (onDone) {
      onDone();
      return;
    }
    toast("Saved to your profile");
    router.push("/");
  }

  return (
    <OnboardingShell step={step} total={STEPS.length} embedded={embedded}>
      <OnboardingQuestion
        key={phase.id}
        title={QUESTION[phase.id].title}
        sub={QUESTION[phase.id].sub}
        note={phase.weight > 0 ? `${phase.weight}% of how we rank things for you.` : undefined}
      />

      {phase.id === "level" ? (
        <SelectionGrid>
          {LEVELS.map((l, i) => (
            <SelectionCard
              key={l.value}
              index={i}
              icon={l.icon}
              title={l.label}
              description={l.description}
              selected={draft.level === l.value}
              onSelect={() => set("level", l.value)}
            />
          ))}
        </SelectionGrid>
      ) : phase.id === "subjects" ? (
        <OnboardingField
          label="Subjects you want to work in"
          hint="Tap a suggestion or type your own. Two or three is enough — the matcher weights overlap, not length."
        >
          <TagPicker
            value={draft.fields}
            onChange={(v) => set("fields", v)}
            suggestions={FIELD_SUGGESTIONS}
            placeholder="e.g. robotics"
            ariaLabel="Subjects you want to work in"
          />
        </OnboardingField>
      ) : phase.id === "funding" ? (
        <>
          <SelectionGrid>
            {FUNDING.map((f, i) => (
              <SelectionCard
                key={f.value || "none"}
                index={i}
                icon={f.icon}
                title={f.label}
                description={f.description}
                selected={draft.funding === f.value}
                onSelect={() => set("funding", f.value)}
              />
            ))}
          </SelectionGrid>

          {/* Progressive disclosure: the lightest factor in the flow appears
              only once the heavier one on the same screen is answered, so the
              step is one decision at a time even though it carries two. */}
          {draft.funding !== undefined && draft.funding !== null ? (
            <OnboardingField
              label="Countries you would go to"
              hint="Optional. Over half of all listings name no country, so this can only ever promote a match — never rule one out."
            >
              <TagPicker
                value={draft.countries}
                onChange={(v) => set("countries", v)}
                suggestions={COUNTRY_SUGGESTIONS}
                placeholder="e.g. Germany"
                ariaLabel="Countries you would go to"
              />
            </OnboardingField>
          ) : null}
        </>
      ) : (
        <>
          <div className={s.row}>
            <OnboardingField label="Degree">
              <Select
                value={draft.degree}
                options={DEGREES}
                onChange={(v) => set("degree", v)}
                placeholder="Choose your degree"
                ariaLabel="Degree"
              />
            </OnboardingField>
            <OnboardingField label="Year of study">
              <Select
                value={draft.year}
                options={YEARS.map((y) => ({ value: y, label: y }))}
                onChange={(v) => set("year", v)}
                placeholder="Choose your year"
                ariaLabel="Year of study"
              />
            </OnboardingField>
          </div>

          <OnboardingField label="Phone" hint="Optional. Nothing sends to it today — it is here for when deadline reminders are switched on.">
            <PhoneField value={draft.phone} onChange={(v) => set("phone", v)} />
          </OnboardingField>

          <p className={s.privacy}>
            Your answers are stored against your account, so they follow you to any device you sign in on
            and nobody else can read them. You can change or erase all of it from your profile at any time.
          </p>
        </>
      )}

      <OnboardingNav
        onBack={step > 0 ? () => setStep(step - 1) : embedded ? undefined : () => router.push("/")}
        backLabel={step > 0 ? "Back" : "Not now"}
        onSkip={last ? undefined : () => setStep(step + 1)}
        onNext={last ? finish : () => setStep(step + 1)}
        nextLabel={last ? "Save and start" : "Continue"}
        nextDisabled={!answered}
        busy={busy}
      />
    </OnboardingShell>
  );
}
