"use client";

/* The college desk — staff add opportunities they already know about.
 *
 * A listing added here is a `raw_items` row against the `college_desk` source
 * (db/014), which means it is an ordinary listing everywhere else in the
 * product: it filters, facets, appears on the deadline timeline, can be saved
 * and compared. The only difference a student sees is the "Added by college"
 * tag, and the tier-1 provenance line.
 *
 * AUTHENTICATION IS A STOPGAP AND SHOULD BE REPLACED. The desk is behind a
 * shared bearer token held in sessionStorage — not localStorage, so it dies
 * with the tab rather than sitting on a shared lab machine. It is enough to
 * keep the write endpoint off the open internet; it is NOT identity. Nothing
 * here records WHO added a listing beyond a name they type themselves, and a
 * shared secret cannot be revoked for one person. Supabase Auth restricted to
 * the campus domain is the real answer, and `added_by` already has a home in
 * the payload for when it arrives.
 */

import { useCallback, useEffect, useState } from "react";
import s from "./admin.module.css";
import { PageHead } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Select } from "@/components/ui/Field";
import { EmptyState, ErrorState } from "@/components/feedback/States";
import { RowsSkeleton } from "@/components/feedback/Skeletons";
import { useToast } from "@/components/feedback/Toast";
import { api } from "@/lib/api-base";
import { deadlineState, typeLabel } from "@rof/core";
import type { OpportunitySummary } from "@rof/core";

const TOKEN_KEY = "rof.v1.adminToken";

const TYPES = [
  "scholarship", "fellowship", "internship", "research_internship", "grant",
  "summer_school", "competition", "award", "training", "exchange", "other",
];
const LEVELS = [
  { value: "bachelors", label: "Bachelor's" },
  { value: "masters", label: "Master's" },
  { value: "phd", label: "PhD" },
  { value: "postdoc", label: "Postdoc" },
  { value: "any", label: "Any level" },
];
const FUNDING = ["fully_funded", "partially_funded", "tuition_waiver", "stipend", "paid"];

/* Every form field is a string; `levels` is held separately because it is the
 * one multi-select and does not belong in a flat string record. */
type Form = Record<string, string>;

const BLANK: Form = {
  title: "", url: "", summary: "", deadline: "", type: "", country: "", funding: "",
  duration: "", amountValue: "", amountCurrency: "", eligibility: "", benefits: "",
  howToApply: "", documents: "", applyLink: "", addedBy: "",
};

export default function AdminPage() {
  const toast = useToast();
  const [token, setToken] = useState<string>("");
  const [tokenDraft, setTokenDraft] = useState("");
  const [ready, setReady] = useState(false);

  const [form, setForm] = useState<Form>(BLANK);
  const [levels, setLevels] = useState<string[]>([]);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const [items, setItems] = useState<OpportunitySummary[]>([]);
  const [listState, setListState] = useState<"idle" | "loading" | "error">("loading");

  useEffect(() => {
    try {
      setToken(window.sessionStorage.getItem(TOKEN_KEY) ?? "");
    } catch {
      /* Storage blocked: the desk still works, the token just is not kept. */
    }
    setReady(true);
  }, []);

  const load = useCallback(async (t: string) => {
    if (!t) return;
    setListState("loading");
    try {
      const res = await fetch(api("/api/admin/opportunities"), {
        headers: { authorization: `Bearer ${t}`, accept: "application/json" },
      });
      if (res.status === 401) {
        setToken("");
        try { window.sessionStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
        setListState("idle");
        return;
      }
      if (!res.ok) throw new Error();
      const body = (await res.json()) as { items: OpportunitySummary[] };
      setItems(body.items);
      setListState("idle");
    } catch {
      setListState("error");
    }
  }, []);

  useEffect(() => {
    if (token) void load(token);
  }, [token, load]);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    setFieldErrors((x) => (x[k] ? { ...x, [k]: "" } : x));
  };

  async function submit() {
    setSaving(true);
    setFieldErrors({});
    try {
      const res = await fetch(api("/api/admin/opportunities"), {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ ...form, levels }),
      });
      if (res.status === 422) {
        const body = (await res.json()) as { fields?: { field: string; message: string }[] };
        setFieldErrors(Object.fromEntries((body.fields ?? []).map((f) => [f.field, f.message])));
        toast("Some fields need attention");
        return;
      }
      if (!res.ok) throw new Error();
      toast("Opportunity published to the portal");
      setForm(BLANK);
      setLevels([]);
      await load(token);
    } catch {
      toast("Could not save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(item: OpportunitySummary) {
    /* externalId is what addresses a college row; the API refuses any id that
     * is not in the staff- form, and the delete is pinned to college_desk, so
     * this cannot reach a scraped listing even if the id were wrong. */
    if (!item.externalId) {
      toast("That listing has no staff reference and cannot be removed here");
      return;
    }
    try {
      const res = await fetch(
        api(`/api/admin/opportunities?externalId=${encodeURIComponent(item.externalId)}`),
        { method: "DELETE", headers: { authorization: `Bearer ${token}` } },
      );
      if (!res.ok) throw new Error();
      toast("Listing removed");
      await load(token);
    } catch {
      toast("Could not remove it. Try again.");
    }
  }

  if (!ready) return <RowsSkeleton count={4} />;

  if (!token) {
    return (
      <>
        <PageHead eyebrow="Staff" title="College desk" description="Add opportunities the department already knows about." />
        <div className={s.gate}>
          <Chip tone="college" icon="shield">
            Staff only
          </Chip>
          <p className="t-body-sm c-secondary">
            Enter the desk token to continue. It is kept for this tab only and is cleared when you close it.
          </p>
          <input
            className={s.input}
            type="password"
            value={tokenDraft}
            placeholder="Desk token"
            autoComplete="off"
            onChange={(e) => setTokenDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && tokenDraft.trim()) {
                const t = tokenDraft.trim();
                try { window.sessionStorage.setItem(TOKEN_KEY, t); } catch { /* ignore */ }
                setToken(t);
              }
            }}
          />
          <Button
            variant="primary"
            block
            disabled={!tokenDraft.trim()}
            onClick={() => {
              const t = tokenDraft.trim();
              try { window.sessionStorage.setItem(TOKEN_KEY, t); } catch { /* ignore */ }
              setToken(t);
            }}
          >
            Open the desk
          </Button>
          <p className="t-meta c-muted">
            A shared token is a stopgap, not sign-in. It identifies the desk, not the person using it.
          </p>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHead
        eyebrow="Staff"
        title="College desk"
        description="Anything added here appears on the portal immediately, tagged “Added by college” and marked as a primary source."
        actions={
          <Button
            variant="ghost"
            icon="close"
            onClick={() => {
              try { window.sessionStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
              setToken("");
            }}
          >
            Lock the desk
          </Button>
        }
      />

      <div className={s.grid}>
        <div className={s.panel}>
          <h2 className="t-section">Add an opportunity</h2>

          <Field label="Title" hint="As the student should see it." error={fieldErrors.title}>
            <input className={[s.input, fieldErrors.title ? s.invalid : ""].join(" ")} value={form.title} onChange={set("title")} maxLength={240} />
          </Field>

          <Field label="Official link" hint="Where the student applies or reads more." error={fieldErrors.url}>
            <input className={[s.input, fieldErrors.url ? s.invalid : ""].join(" ")} value={form.url} onChange={set("url")} placeholder="https://" inputMode="url" />
          </Field>

          <Field label="Summary" hint="Two or three sentences. This is the card text." error={fieldErrors.summary}>
            <textarea className={s.textarea} value={form.summary} onChange={set("summary")} maxLength={400} />
          </Field>

          <div className={s.row}>
            <Field label="Deadline" hint="Leave blank if it is rolling." error={fieldErrors.deadline}>
              <input className={[s.input, fieldErrors.deadline ? s.invalid : ""].join(" ")} type="date" value={form.deadline} onChange={set("deadline")} />
            </Field>
            <Field label="Type" error={fieldErrors.type}>
              <Select
                value={form.type}
                options={[{ value: "", label: "Not specified" }, ...TYPES.map((t) => ({ value: t, label: typeLabel(t) as string }))]}
                onChange={(v) => setForm((f) => ({ ...f, type: v }))}
                ariaLabel="Opportunity type"
              />
            </Field>
          </div>

          <Field label="Who can apply" hint="Leave all unticked if it is open to any level.">
            <div className={s.levels}>
              {LEVELS.map((l) => (
                <label key={l.value} className={[s.check, levels.includes(l.value) ? s.checkOn : ""].join(" ")}>
                  <input
                    type="checkbox"
                    checked={levels.includes(l.value)}
                    onChange={() => setLevels((v) => (v.includes(l.value) ? v.filter((x) => x !== l.value) : [...v, l.value]))}
                    style={{ position: "absolute", opacity: 0, width: 1, height: 1 }}
                  />
                  {l.label}
                </label>
              ))}
            </div>
          </Field>

          <div className={s.row}>
            <Field label="Country" hint="Where it takes place.">
              <input className={s.input} value={form.country} onChange={set("country")} placeholder="Germany" maxLength={60} />
            </Field>
            <Field label="Funding">
              <Select
                value={form.funding}
                options={[{ value: "", label: "Not specified" }, ...FUNDING.map((f) => ({ value: f, label: typeLabel(f) as string }))]}
                onChange={(v) => setForm((f) => ({ ...f, funding: v }))}
                ariaLabel="Funding"
              />
            </Field>
          </div>

          <div className={s.row}>
            <Field label="Amount" hint="The headline figure, if there is one." error={fieldErrors.amountValue}>
              <input className={[s.input, fieldErrors.amountValue ? s.invalid : ""].join(" ")} value={form.amountValue} onChange={set("amountValue")} inputMode="decimal" placeholder="2000" />
            </Field>
            <Field label="Currency" hint="Three letters." error={fieldErrors.amountCurrency}>
              <input className={[s.input, fieldErrors.amountCurrency ? s.invalid : ""].join(" ")} value={form.amountCurrency} onChange={set("amountCurrency")} placeholder="USD" maxLength={3} />
            </Field>
          </div>

          <Field label="Duration">
            <input className={s.input} value={form.duration} onChange={set("duration")} placeholder="10 weeks" maxLength={60} />
          </Field>

          <Field label="Eligibility" hint="The criteria that decide whether an application is worth making.">
            <textarea className={s.textarea} value={form.eligibility} onChange={set("eligibility")} maxLength={4000} />
          </Field>

          <Field label="What it covers">
            <textarea className={s.textarea} value={form.benefits} onChange={set("benefits")} maxLength={4000} />
          </Field>

          <Field label="How to apply">
            <textarea className={s.textarea} value={form.howToApply} onChange={set("howToApply")} maxLength={4000} />
          </Field>

          <div className={s.row}>
            <Field label="Application link" hint="If different from the official link." error={fieldErrors.applyLink}>
              <input className={[s.input, fieldErrors.applyLink ? s.invalid : ""].join(" ")} value={form.applyLink} onChange={set("applyLink")} placeholder="https://" />
            </Field>
            <Field label="Added by" hint="Your name, for the audit trail.">
              <input className={s.input} value={form.addedBy} onChange={set("addedBy")} maxLength={80} />
            </Field>
          </div>

          <div className={s.actions}>
            <Button variant="primary" busy={saving} disabled={saving} onClick={submit}>
              Publish to the portal
            </Button>
            <Button variant="ghost" disabled={saving} onClick={() => { setForm(BLANK); setLevels([]); setFieldErrors({}); }}>
              Clear the form
            </Button>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-5)" }}>
          <div className={s.panel}>
            <h2 className="t-section">Added by the college</h2>
            {listState === "loading" ? (
              <RowsSkeleton count={3} />
            ) : listState === "error" ? (
              <ErrorState
                compact
                title="Couldn't load the desk"
                body="The college listings could not be read."
                actions={<Button variant="secondary" icon="refresh" onClick={() => load(token)}>Try again</Button>}
              />
            ) : items.length === 0 ? (
              <EmptyState
                compact
                icon="inbox"
                title="Nothing added yet"
                body="Anything you publish here appears on the portal straight away, tagged as a college listing."
              />
            ) : (
              <div className={s.list}>
                {items.map((item) => (
                  <div className={s.item} key={item.id}>
                    <span className={s.itemBody}>
                      <span className={`${s.itemTitle} clamp-2`}>{item.title}</span>
                      <span className={s.itemMeta}>
                        {typeLabel(item.type)} · {deadlineState(item).label}
                      </span>
                    </span>
                    <Button variant="ghost" size="sm" icon="trash" onClick={() => remove(item)}>
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <p className={s.note}>
            <strong>On access.</strong> This desk is protected by one shared token, which keeps the write
            endpoint off the open internet but is not sign-in: it cannot tell two staff members apart and
            cannot be revoked for one of them. Replacing it with Supabase Auth limited to
            <code> @dubai.bits-pilani.ac.in</code> is the next step, and the listing payload already carries
            an <code>added_by</code> field waiting for a real identity.
          </p>
        </div>
      </div>
    </>
  );
}

function Field({
  label, hint, error, children,
}: {
  label: string; hint?: string; error?: string; children: React.ReactNode;
}) {
  return (
    <label className={s.field}>
      <span className={s.label}>{label}</span>
      {children}
      {error ? <span className={s.error}>{error}</span> : hint ? <span className={s.hint}>{hint}</span> : null}
    </label>
  );
}
