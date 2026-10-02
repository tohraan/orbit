"use client";

/* §56: preference fields that support relevance without turning the product
 * into a form-heavy onboarding system, with progressive disclosure.
 *
 * Two honest limits are stated on the page rather than buried:
 *   1. These preferences are stored in this browser and nowhere else. The app
 *      has no accounts, so there is no server-side profile to leak — and no
 *      sync to another device either.
 *   2. They do not currently re-rank the Explore grid. Writing a scoring
 *      function that *looks* personalised while the index carries no
 *      fields_of_study and no country for 243 of 431 listings would be a
 *      confidence trick. What they do today is fill the filter links below,
 *      which is real and verifiable. */

import { useEffect, useState } from "react";
import { PageHead, Section } from "@/components/layout/AppShell";
import h from "../home.module.css";
import u from "@/components/ui/ui.module.css";
import { Button, ButtonLink } from "@/components/ui/Button";
import { useToast } from "@/components/feedback/Toast";
import { EMPTY_PROFILE, useProfile, useSaved, useTracker, type Profile } from "@/lib/store";
import { RATES_AS_OF } from "@rof/core";

const LEVELS = [
  { value: "", label: "Not set" },
  { value: "bachelors", label: "Bachelor's" },
  { value: "masters", label: "Master's" },
  { value: "phd", label: "PhD" },
  { value: "postdoc", label: "Postdoc" },
];

const FUNDING = [
  { value: "", label: "Not set" },
  { value: "fully_funded", label: "Fully funded only" },
  { value: "partially_funded", label: "Partial funding is fine" },
  { value: "stipend", label: "A stipend matters most" },
];

export default function ProfilePage() {
  const { profile, ready, save } = useProfile();
  const { saved, clear: clearSaved } = useSaved();
  const { entries, clear: clearTracker } = useTracker();
  const toast = useToast();
  const [draft, setDraft] = useState<Profile>(EMPTY_PROFILE);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (ready) setDraft(profile);
  }, [ready, profile]);

  const set = (key: keyof Profile) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setDraft((d) => ({ ...d, [key]: e.target.value }));
    setDirty(true);
  };

  /* The preferences that map onto a real filter become a link. The ones that
   * do not (fields, graduation) are stored but make no claim. */
  const exploreHref = (() => {
    const sp = new URLSearchParams();
    if (draft.level) sp.set("level", draft.level);
    if (draft.funding) sp.set("funding", draft.funding);
    const q = sp.toString();
    return q ? `/explore?${q}` : "/explore";
  })();

  return (
    <>
      <PageHead
        eyebrow="You"
        title="Profile and preferences"
        description="Set these once to get a shortcut into the listings that fit. Everything here is stored in this browser."
      />

      <div className={h.bento}>
        <div className={`${h.box} ${h.wide}`}>
          <div className={h.boxHead}>
            <h2 className={h.boxTitle}>Your details</h2>
            {dirty ? <span className="t-meta c-muted">Unsaved changes</span> : null}
          </div>

          <Field label="Current degree level" hint="Used to filter listings by who may apply.">
            <select className={u.select} value={draft.level} onChange={set("level")} disabled={!ready}>
              {LEVELS.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Funding you need" hint="Fully funded listings cover tuition and living costs.">
            <select className={u.select} value={draft.funding} onChange={set("funding")} disabled={!ready}>
              {FUNDING.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Fields you work in" hint="Stored for your own reference. No source in this index publishes a field of study, so it cannot filter yet.">
            <div className={u.field}>
              <input
                className={u.fieldInput}
                value={draft.fields}
                onChange={set("fields")}
                placeholder="computer science, robotics, materials"
                maxLength={200}
                disabled={!ready}
              />
            </div>
          </Field>

          <Field label="Countries you would go to" hint="Stored for your own reference; use the Country filter in Explore to act on it.">
            <div className={u.field}>
              <input
                className={u.fieldInput}
                value={draft.countries}
                onChange={set("countries")}
                placeholder="Germany, Canada, United Kingdom"
                maxLength={200}
                disabled={!ready}
              />
            </div>
          </Field>

          <Field label="Expected graduation" hint="So you can tell at a glance whether a programme's start date works.">
            <div className={u.field}>
              <input
                className={u.fieldInput}
                value={draft.graduation}
                onChange={set("graduation")}
                placeholder="June 2028"
                maxLength={60}
                disabled={!ready}
              />
            </div>
          </Field>

          <div style={{ display: "flex", gap: "var(--s-2)", paddingTop: "var(--s-2)" }}>
            <Button
              variant="primary"
              disabled={!ready || !dirty}
              onClick={() => {
                save(draft);
                setDirty(false);
                toast("Preferences saved");
              }}
            >
              Save preferences
            </Button>
            <Button
              variant="ghost"
              disabled={!dirty}
              onClick={() => {
                setDraft(profile);
                setDirty(false);
              }}
            >
              Discard changes
            </Button>
          </div>
        </div>

        <div className={`${h.box} ${h.narrow}`}>
          <div className={h.boxHead}>
            <h2 className={h.boxTitle}>What these change</h2>
          </div>
          <p className="t-body-sm c-secondary">
            Degree level and funding map onto real filters, so they become a one-click route into the
            listings that fit. The rest is stored for your own reference.
          </p>
          <p className="t-body-sm c-secondary">
            Nothing here re-ranks the Explore grid. A relevance score built on this index would be mostly
            guesswork &mdash; no source publishes a field of study, and more than half the listings do not
            name a country &mdash; so the filters do the work instead, where you can see exactly what they
            did.
          </p>
          <div className={h.boxFoot}>
            <ButtonLink href={exploreHref} variant="secondary" iconAfter="arrow-right">
              Explore with these preferences
            </ButtonLink>
          </div>
        </div>
      </div>

      <Section title="This device">
        <div className={h.bento}>
          <div className={`${h.box} ${h.half}`}>
            <div className={h.boxHead}>
              <h2 className={h.boxTitle}>Stored here</h2>
            </div>
            <div className={h.metrics}>
              <span className={h.metric}>
                <span className={h.metricValue}>{saved.length}</span>
                <span className={h.metricLabel}>Saved</span>
              </span>
              <span className={h.metric}>
                <span className={h.metricValue}>{entries.length}</span>
                <span className={h.metricLabel}>Tracked</span>
              </span>
              <span className={h.metric}>
                <span className={h.metricValue}>{ready && profile !== EMPTY_PROFILE ? "Set" : "—"}</span>
                <span className={h.metricLabel}>Preferences</span>
              </span>
            </div>
            <p className="t-body-sm c-secondary">
              This app has no accounts and no user table. Your saved list, application statuses and the
              preferences above live in this browser&rsquo;s storage and are never sent anywhere. Clearing
              site data clears them, and they do not follow you to another device.
            </p>
            <div style={{ display: "flex", gap: "var(--s-2)", flexWrap: "wrap" }}>
              <Button
                variant="danger"
                size="sm"
                icon="trash"
                disabled={!saved.length}
                onClick={() => {
                  clearSaved();
                  toast("Saved list cleared");
                }}
              >
                Clear saved
              </Button>
              <Button
                variant="danger"
                size="sm"
                icon="trash"
                disabled={!entries.length}
                onClick={() => {
                  clearTracker();
                  toast("Applications cleared");
                }}
              >
                Clear applications
              </Button>
            </div>
          </div>

          <div className={`${h.box} ${h.half}`}>
            <div className={h.boxHead}>
              <h2 className={h.boxTitle}>About the data</h2>
            </div>
            <p className="t-body-sm c-secondary">
              Listings are aggregated from six public sources and filtered down to open calls a BITS Pilani
              Dubai student can apply to &mdash; awarded grants, institutional mechanisms and fee-paying
              programme catalogues are excluded, because none of them is something you can apply to.
            </p>
            <p className="t-body-sm c-secondary">
              Dirham conversions use the US dollar peg of 3.6725, which is exact, and indicative
              mid-market rates from {RATES_AS_OF} for everything else. Treat a converted euro or pound
              figure as an order of magnitude, not a quote.
            </p>
            <p className="t-body-sm c-muted">
              The source page is authoritative on every detail, including the deadline. This index records
              what a page said when it was read.
            </p>
          </div>
        </div>
      </Section>
    </>
  );
}

/* §98: label at 13/500, help text at 12/17, and a 16px gap between fields. */
function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: "var(--s-2)" }}>
      <span className="t-body-sm" style={{ fontWeight: 500 }}>
        {label}
      </span>
      {children}
      {hint ? <span className="t-meta c-muted">{hint}</span> : null}
    </label>
  );
}
