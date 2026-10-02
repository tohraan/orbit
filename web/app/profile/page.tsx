"use client";

/* The profile hub.
 *
 * It used to be eleven inputs and a Save button, which is a thing students
 * close. The same information asked as four short phases — each with a visible
 * payoff and one primary action — is a thing they finish. §56 asks for
 * progressive disclosure; this is what that looks like when the page also has
 * to show what is already done.
 *
 * The fields are still here for anyone who wants to change one thing without
 * walking the flow. They are just folded away, because offering them first is
 * what made this feel like paperwork.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import s from "./profile.module.css";
import { PageHead } from "@/components/layout/AppShell";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Icon, type IconName } from "@/components/ui/Icon";
import { CampusEmail, PhoneField, Select, TagPicker } from "@/components/ui/Field";
import { BentoSkeleton } from "@/components/feedback/Skeletons";
import { useToast } from "@/components/feedback/Toast";
import { useAuth } from "@/lib/auth";
import { EMPTY_PROFILE, useProfile, useSaved, useTracker, type Profile } from "@/lib/data";
import { completeness, nextPhase, phaseStates } from "@/lib/completeness";
import { RATES_AS_OF } from "@rof/core";

const DEGREES = [
  { value: "be", label: "B.E." },
  { value: "bba", label: "BBA" },
  { value: "mba", label: "MBA" },
  { value: "me", label: "M.E. / M.Sc." },
  { value: "phd", label: "PhD" },
];
const YEARS = ["1st year", "2nd year", "3rd year", "4th year", "Final year", "Graduated"].map((y) => ({ value: y, label: y }));
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
  { value: "", label: "No preference" },
];
const FIELD_SUGGESTIONS = ["Computer Science", "Artificial Intelligence", "Robotics", "Materials", "Renewable Energy", "Biotechnology", "Electronics", "Data Science"];
const COUNTRY_SUGGESTIONS = ["Germany", "United States", "United Kingdom", "Canada", "Australia", "Singapore", "Japan", "Switzerland"];

export default function ProfilePage() {
  const { profile, ready, save } = useProfile();
  const { saved, clear: clearSaved } = useSaved();
  const { entries, clear: clearTracker } = useTracker();
  const { status } = useAuth();
  const toast = useToast();

  const [draft, setDraft] = useState<Profile>(EMPTY_PROFILE);
  const [dirty, setDirty] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (ready) setDraft(profile);
  }, [ready, profile]);

  const pct = useMemo(() => completeness(profile), [profile]);
  const phases = useMemo(() => phaseStates(profile), [profile]);
  const next = useMemo(() => nextPhase(profile), [profile]);

  const set = (k: keyof Profile, v: string) => {
    setDraft((d) => ({ ...d, [k]: v }));
    setDirty(true);
  };

  async function commit() {
    setSaving(true);
    const err = await save(draft);
    setSaving(false);
    if (err) toast(err);
    else {
      setDirty(false);
      toast("Profile saved");
    }
  }

  if (!ready) {
    return (
      <>
        <PageHead eyebrow="You" title="Your profile" />
        <BentoSkeleton lines={6} />
      </>
    );
  }

  return (
    <>
      <PageHead
        eyebrow="You"
        title="Your profile"
        description="The more of this we have, the better we can tell which of 428 listings are worth your evening."
      />

      <div className={s.hub}>
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-5)" }}>
          {/* ---- progress, and the one thing to do next ---- */}
          <div className={s.card}>
            <div className={s.head}>
              <Ring value={pct} />
              <div className={s.headText}>
                <h2 className="t-section">
                  {pct === 100
                    ? "Your profile is complete"
                    : pct === 0
                      ? "Let's set you up"
                      : `${pct}% there — ${next?.title.toLowerCase()} is next`}
                </h2>
                <p className="t-body-sm c-secondary">
                  {pct === 100
                    ? "Everything we match on is filled in. You can change any of it below."
                    : next
                      ? next.payoff
                      : "Four short steps, about two minutes."}
                </p>
              </div>
            </div>

            {pct < 100 ? (
              <div className={s.cta}>
                <ButtonLink href={`/welcome?from=${next?.id ?? "you"}`} variant="primary" size="lg" iconAfter="arrow-right">
                  {pct === 0 ? "Start setup" : "Continue setup"}
                </ButtonLink>
                <p className={s.note}>
                  Guided, one question group at a time. You can stop anywhere and come back — nothing is lost.
                </p>
              </div>
            ) : null}
          </div>

          {/* ---- the phases ---- */}
          <div className={s.card}>
            <h2 className="t-section">What we ask for</h2>
            <div className={s.phases}>
              {phases.map((ph) => {
                const isNext = !ph.complete && next?.id === ph.id;
                return (
                  <Link
                    href={`/welcome?from=${ph.id}`}
                    key={ph.id}
                    className={[s.phase, isNext ? s.phaseNext : null].filter(Boolean).join(" ")}
                  >
                    <span
                      className={[
                        s.phaseIcon,
                        ph.complete ? s.phaseIconDone : isNext ? s.phaseIconNext : null,
                      ].filter(Boolean).join(" ")}
                    >
                      <Icon name={ph.complete ? "check" : (ph.icon as IconName)} size={16} />
                    </span>
                    <span className={s.phaseBody}>
                      <span className={s.phaseTitle}>{ph.title}</span>
                      <span className={s.phaseBlurb}>{ph.blurb}</span>
                      {!ph.complete ? <span className={s.phasePayoff}>{ph.payoff}</span> : null}
                    </span>
                    <span className={s.phaseTail}>
                      <span className={s.phaseCount}>
                        {ph.done}/{ph.total}
                      </span>
                      <Icon name="chevron-right" size={16} />
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>

          {/* ---- the fields, folded away ---- */}
          <div className={s.card}>
            <button type="button" className={s.disclose} onClick={() => setEditing((e) => !e)} aria-expanded={editing}>
              <Icon name={editing ? "minus" : "plus"} size={16} />
              {editing ? "Hide the individual fields" : "Edit a single field instead"}
            </button>

            {editing ? (
              <div className={s.editor}>
                <div className={s.editorRow}>
                  <Field label="Your name">
                    <input className={s.input} value={draft.name} onChange={(e) => set("name", e.target.value)} maxLength={120} />
                  </Field>
                  <Field label="Campus email">
                    <CampusEmail value={draft.email} onChange={(v) => set("email", v)} />
                  </Field>
                </div>
                <Field label="Phone" hint="Optional.">
                  <PhoneField value={draft.phone} onChange={(v) => set("phone", v)} />
                </Field>
                <div className={s.editorRow}>
                  <Field label="Degree">
                    <Select value={draft.degree} options={DEGREES} onChange={(v) => set("degree", v)} placeholder="Not set" ariaLabel="Degree" />
                  </Field>
                  <Field label="Year of study">
                    <Select value={draft.year} options={YEARS} onChange={(v) => set("year", v)} placeholder="Not set" ariaLabel="Year of study" />
                  </Field>
                </div>
                <Field label="Branch">
                  <input className={s.input} value={draft.course} onChange={(e) => set("course", e.target.value)} maxLength={120} />
                </Field>
                <div className={s.editorRow}>
                  <Field label="Level you are applying at">
                    <Select value={draft.level} options={LEVELS} onChange={(v) => set("level", v)} placeholder="Not set" ariaLabel="Level" />
                  </Field>
                  <Field label="Funding you need">
                    <Select value={draft.funding} options={FUNDING} onChange={(v) => set("funding", v)} placeholder="Not set" ariaLabel="Funding" />
                  </Field>
                </div>
                <Field label="Subjects" hint="Matched against each listing's title and description.">
                  <TagPicker value={draft.fields} onChange={(v) => set("fields", v)} suggestions={FIELD_SUGGESTIONS} ariaLabel="Subjects" />
                </Field>
                <Field label="Countries" hint="Only ever used to promote a match.">
                  <TagPicker value={draft.countries} onChange={(v) => set("countries", v)} suggestions={COUNTRY_SUGGESTIONS} ariaLabel="Countries" />
                </Field>
                <Field label="Expected graduation">
                  <input className={s.input} value={draft.graduation} onChange={(e) => set("graduation", e.target.value)} maxLength={60} placeholder="June 2028" />
                </Field>

                <div style={{ display: "flex", gap: "var(--s-2)", flexWrap: "wrap" }}>
                  <Button variant="primary" busy={saving} disabled={!dirty || saving} onClick={commit}>
                    Save changes
                  </Button>
                  <Button variant="ghost" disabled={!dirty} onClick={() => { setDraft(profile); setDirty(false); }}>
                    Discard
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        {/* ---- rail ---- */}
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-5)" }}>
          <div className={s.card}>
            <h2 className="t-section">Your activity</h2>
            <div>
              <span className={s.stat}>
                <span className={s.statKey}>Saved</span>
                <span className={s.statVal}>{saved.length}</span>
              </span>
              <span className={s.stat}>
                <span className={s.statKey}>Applications tracked</span>
                <span className={s.statVal}>{entries.length}</span>
              </span>
              <span className={s.stat}>
                <span className={s.statKey}>Profile complete</span>
                <span className={s.statVal}>{pct}%</span>
              </span>
            </div>
            <div style={{ display: "flex", gap: "var(--s-2)", flexWrap: "wrap" }}>
              <Button variant="danger" size="sm" icon="trash" disabled={!saved.length} onClick={() => { clearSaved(); toast("Saved list cleared"); }}>
                Clear saved
              </Button>
              <Button variant="danger" size="sm" icon="trash" disabled={!entries.length} onClick={() => { clearTracker(); toast("Applications cleared"); }}>
                Clear applications
              </Button>
            </div>
          </div>

          <div className={s.card}>
            <h2 className="t-section">Where this lives</h2>
            <p className={s.note}>
              {status === "signed-in"
                ? "You are signed in, so your profile, saved list and tracked applications are stored against your account and follow you to any device."
                : "You are not signed in, so this is kept in this browser only — it does not follow you to another device, and clearing site data clears it."}
            </p>
            {status !== "signed-in" ? (
              <ButtonLink href="/account" variant="secondary" block>
                Sign in to sync
              </ButtonLink>
            ) : null}
            <p className={s.note}>
              Dirham conversions use the US dollar peg of 3.6725, which is exact, and indicative rates from{" "}
              {RATES_AS_OF} for everything else.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}

/* The completion ring. Counts up once on mount rather than snapping — the one
 * piece of motion on this page, and the only one that carries information. */
function Ring({ value }: { value: number }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setShown(value);
      return;
    }
    const t = window.setTimeout(() => setShown(value), 60);
    return () => window.clearTimeout(t);
  }, [value]);

  const r = 40;
  const c = 2 * Math.PI * r;

  return (
    <div className={s.ring}>
      <svg className={s.ringSvg} width="92" height="92" viewBox="0 0 92 92" aria-hidden="true">
        <circle className={s.ringTrack} cx="46" cy="46" r={r} fill="none" strokeWidth="8" />
        <circle
          className={s.ringFill}
          cx="46"
          cy="46"
          r={r}
          fill="none"
          strokeWidth="8"
          strokeDasharray={`${(shown / 100) * c} ${c}`}
        />
      </svg>
      <span className={s.ringLabel}>{value}%</span>
      <span className="sr-only">Profile {value}% complete</span>
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
