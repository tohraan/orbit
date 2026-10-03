"use client";

/* Add an opportunity: paste a link, we read the page, you check it, it goes
 * live.
 *
 * THE SHAPE OF THE SCREEN IS THE ARGUMENT. Form on the left, the student's view
 * on the right, both live. Staff are not writing a database row, they are
 * writing something a student will read on a card at 2am the night before a
 * deadline, and the only way to keep that in view is to keep it in view.
 *
 * WHAT THE SCRAPE IS AND IS NOT. It fills the form in. It does not publish, it
 * does not decide, and it says which fields it could not find rather than
 * leaving a staff member to discover the gaps by scrolling. Where the page was
 * ambiguous — a roundup article, a deadline already past, a nationality
 * restriction — it says so and leaves the judgement to the person, who can see
 * the page and we cannot.
 */

import { useCallback, useMemo, useRef, useState } from "react";
import s from "./add.module.css";
import shell from "@/components/shell.module.css";
import { StudentPreview } from "@/components/StudentPreview";
import { desk } from "@/lib/desk";
import { BLANK, FUNDING, LEVELS, TYPES, type Draft } from "@/lib/draft";

type ScrapeOk = {
  ok: true; finalUrl: string; title: string | null; summary: string | null;
  deadline: string | null; deadlineKind: string; deadlineNote: string | null;
  funding: string | null; covers: string[];
  amount: { currency: string | null; value: number; period: string | null } | null;
  duration: string | null; eligibility: string | null; benefits: string | null;
  howToApply: string | null; documents: string | null; applyLink: string | null;
  missing: string[]; warnings: string[];
};

/* The steps shown while the server works. They are not a progress bar over a
 * known quantity — the server does not report back mid-flight — so they are
 * honest about being a sequence of things being attempted, and the last one
 * stays lit until the answer arrives rather than pretending to reach 100%. */
const STEPS = [
  "Checking the link",
  "Asking the site for permission",
  "Reading the page",
  "Pulling out the details",
];

const FIELD_LABELS: Record<string, string> = {
  title: "Title", summary: "Description", deadline: "Deadline", funding: "Funding",
  eligibility: "Eligibility", howToApply: "How to apply", applyLink: "Apply link",
};

export default function AddPage() {
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [draft, setDraft] = useState<Draft>(BLANK);
  const [phase, setPhase] = useState<"idle" | "reading" | "editing">("idle");
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [missing, setMissing] = useState<string[]>([]);
  const [filled, setFilled] = useState<string[]>([]);
  const [published, setPublished] = useState<string | null>(null);
  const inFlight = useRef(false);

  const set = useCallback(<K extends keyof Draft>(k: K, v: Draft[K]) => {
    setDraft((d) => ({ ...d, [k]: v }));
  }, []);

  async function read() {
    if (inFlight.current) return;
    const link = url.trim();
    if (!link) { setError("Paste the link to the opportunity page first."); return; }
    inFlight.current = true;
    setPhase("reading");
    setError(null);
    setWarnings([]);
    setStep(0);

    /* The ticker walks the steps on a timer because the server answers once, at
     * the end. It stops at the last step rather than looping, so it never
     * suggests more is happening than is. */
    const ticker = setInterval(() => setStep((i) => Math.min(i + 1, STEPS.length - 1)), 900);

    const res = await desk<ScrapeOk | { ok: false; code: string; message: string }>("scrape", {
      method: "POST",
      body: JSON.stringify({ url: link }),
    });
    clearInterval(ticker);
    inFlight.current = false;

    if (!res.ok) {
      setPhase("idle");
      setError(res.error.message);
      return;
    }
    const d = res.data;
    if (!("ok" in d) || !d.ok) {
      setPhase("idle");
      setError((d as { message?: string }).message ?? "That page could not be read.");
      return;
    }

    /* The name the staff member typed WINS over the scraped title. They chose
     * to type it, which is a stronger signal than anything a <title> tag says —
     * and page titles are routinely "Home | Some Foundation". */
    const next: Draft = {
      ...BLANK,
      title: name.trim() || d.title || "",
      url: d.finalUrl || link,
      summary: d.summary ?? "",
      deadline: d.deadline ?? "",
      deadlineKind: d.deadlineKind ?? "",
      funding: d.funding ?? "",
      duration: d.duration ?? "",
      amountValue: d.amount ? String(d.amount.value) : "",
      amountCurrency: d.amount?.currency ?? "",
      eligibility: d.eligibility ?? "",
      benefits: d.benefits ?? "",
      howToApply: d.howToApply ?? "",
      documents: d.documents ?? "",
      applyLink: d.applyLink ?? "",
      levels: [],
    };
    setDraft(next);
    setFilled(
      (Object.entries(next) as [string, unknown][])
        .filter(([k, v]) => k !== "url" && k !== "title" && (Array.isArray(v) ? v.length : Boolean(v)))
        .map(([k]) => k),
    );
    setMissing(d.missing ?? []);
    setWarnings(d.warnings ?? []);
    setPhase("editing");
  }

  const canPublish = draft.title.trim().length > 2 && /^https?:\/\//.test(draft.url.trim());

  async function publish() {
    if (inFlight.current || !canPublish) return;
    inFlight.current = true;
    setError(null);
    const res = await desk<{ ok: true; externalId: string } | { ok: false; errors: { field: string; message: string }[] }>(
      "publish",
      {
        method: "POST",
        body: JSON.stringify({
          title: draft.title, url: draft.url, summary: draft.summary,
          deadline: draft.deadline || null, type: draft.type || null, levels: draft.levels,
          country: draft.country || null, funding: draft.funding || null, duration: draft.duration || null,
          amountValue: draft.amountValue ? Number(draft.amountValue) : null,
          amountCurrency: draft.amountCurrency || null,
          eligibility: draft.eligibility, benefits: draft.benefits, howToApply: draft.howToApply,
          documents: draft.documents, applyLink: draft.applyLink || null,
        }),
      },
    );
    inFlight.current = false;
    if (!res.ok) { setError(res.error.message); return; }
    if ("errors" in res.data && res.data.errors?.length) {
      setError(res.data.errors.map((e) => `${e.field}: ${e.message}`).join(" · "));
      return;
    }
    setPublished(draft.title.trim());
    setDraft(BLANK);
    setUrl("");
    setName("");
    setPhase("idle");
    setMissing([]);
    setFilled([]);
    setWarnings([]);
  }

  const fieldNote = useMemo(() => {
    if (phase !== "editing") return null;
    const got = filled.length;
    const miss = missing.map((m) => FIELD_LABELS[m] ?? m);
    return { got, miss };
  }, [phase, filled, missing]);

  return (
    <div className={s.layout}>
      <div className={s.left}>
        <header className={s.head}>
          <span className="eyebrow">Add</span>
          <h1 className="t-page-title">Add an opportunity</h1>
          <p className="t-body-sm c-secondary">
            Paste the link and we will read the page and fill in what we can find. Nothing goes live until
            you publish it.
          </p>
        </header>

        {published ? (
          <p className={shell.ok} role="status">
            “{published}” is live. Students will see it on the next load, tagged “Added by college”.
          </p>
        ) : null}

        {/* ---------------------------------------------------------- step 1 */}
        <section className={s.card}>
          <h2 className="t-section">1 · The link</h2>
          <label className={shell.field}>
            <span className={shell.label}>Link to the opportunity page</span>
            <input className={shell.input} value={url} onChange={(e) => setUrl(e.target.value)}
                   placeholder="https://…" inputMode="url" disabled={phase === "reading"}
                   onKeyDown={(e) => { if (e.key === "Enter") void read(); }} />
            <span className={shell.hint}>
              The official page for this opportunity. We read it once; we do not crawl the site.
            </span>
          </label>

          <label className={shell.field}>
            <span className={shell.label}>What should it be called?</span>
            <input className={shell.input} value={name} onChange={(e) => setName(e.target.value)}
                   maxLength={240} disabled={phase === "reading"}
                   placeholder="e.g. DAAD WISE Summer Research Internship 2027" />
            <span className={shell.hint}>
              Your wording wins over the page’s own title, which is often “Home | Some Foundation”.
            </span>
          </label>

          {error ? <p className={shell.error} role="alert">{error}</p> : null}

          <div className={s.actions}>
            <button type="button" className={shell.primary} onClick={() => void read()}
                    disabled={phase === "reading" || !url.trim()}>
              {phase === "reading" ? "Reading…" : phase === "editing" ? "Read again" : "Read the page"}
            </button>
            {phase === "idle" && !published ? (
              <button type="button" className={shell.ghost}
                      onClick={() => { setDraft(BLANK); setPhase("editing"); setMissing([]); setFilled([]); }}>
                Skip — type it myself
              </button>
            ) : null}
          </div>

          {phase === "reading" ? (
            <ol className={s.steps} aria-live="polite">
              {STEPS.map((label, i) => (
                <li key={label} className={[s.step, i < step ? s.stepDone : i === step ? s.stepNow : ""].join(" ")}>
                  <span className={s.stepDot} aria-hidden="true" />
                  {label}
                </li>
              ))}
            </ol>
          ) : null}
        </section>

        {/* ---------------------------------------------------------- step 2 */}
        {phase === "editing" ? (
          <>
            {fieldNote ? (
              <div className={s.report} role="status">
                <p className={s.reportLine}>
                  <strong>{fieldNote.got}</strong> field{fieldNote.got === 1 ? "" : "s"} filled in from the page.
                  {fieldNote.miss.length ? <> Still needed: <strong>{fieldNote.miss.join(", ")}</strong>.</> : " Nothing obvious is missing."}
                </p>
                <p className={s.reportHint}>Everything below is editable — the page is a starting point, not the truth.</p>
              </div>
            ) : null}

            {warnings.length ? (
              <div className={s.warn} role="alert">
                <span className={s.warnHead}>Worth a look before publishing</span>
                <ul className={s.warnList}>{warnings.map((w) => <li key={w}>{w}</li>)}</ul>
              </div>
            ) : null}

            <section className={s.card}>
              <h2 className="t-section">2 · Check and edit</h2>

              <Field label="Title" hint="What a student sees first.">
                <input className={shell.input} value={draft.title} maxLength={240}
                       onChange={(e) => set("title", e.target.value)} />
              </Field>

              <Field label="Link" hint="Where “Open” takes them.">
                <input className={shell.input} value={draft.url} onChange={(e) => set("url", e.target.value)} />
              </Field>

              <Field label="Description" hint="Four lines on the card. Say what it is and who it is for.">
                <textarea className={shell.textarea} value={draft.summary} maxLength={600}
                          onChange={(e) => set("summary", e.target.value)} />
              </Field>

              <div className={s.row}>
                <Field label="Deadline" hint={draft.deadlineKind && draft.deadlineKind !== "fixed"
                  ? `The page suggested “${draft.deadlineKind}”.` : "YYYY-MM-DD."}>
                  <input className={shell.input} type="date" value={draft.deadline}
                         onChange={(e) => set("deadline", e.target.value)} />
                </Field>
                <Field label="Type">
                  <select className={shell.select} value={draft.type} onChange={(e) => set("type", e.target.value)}>
                    <option value="">Not set</option>
                    {TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
                  </select>
                </Field>
              </div>

              <div className={s.row}>
                <Field label="Country"><input className={shell.input} value={draft.country}
                       onChange={(e) => set("country", e.target.value)} /></Field>
                <Field label="Duration"><input className={shell.input} value={draft.duration} maxLength={60}
                       onChange={(e) => set("duration", e.target.value)} /></Field>
              </div>

              <div className={s.row}>
                <Field label="Funding">
                  <select className={shell.select} value={draft.funding} onChange={(e) => set("funding", e.target.value)}>
                    <option value="">Not set</option>
                    {FUNDING.map((f) => <option key={f} value={f}>{f.replace(/_/g, " ")}</option>)}
                  </select>
                </Field>
                <Field label="Amount" hint="Currency and value, if there is one.">
                  <div className={s.pair}>
                    <input className={shell.input} value={draft.amountCurrency} maxLength={3} placeholder="EUR"
                           onChange={(e) => set("amountCurrency", e.target.value.toUpperCase())} />
                    <input className={shell.input} value={draft.amountValue} inputMode="numeric" placeholder="2500"
                           onChange={(e) => set("amountValue", e.target.value.replace(/[^\d.]/g, ""))} />
                  </div>
                </Field>
              </div>

              <Field label="Who can apply" hint="Degree levels. Leave empty for “any”.">
                <div className={s.chips}>
                  {LEVELS.map((l) => {
                    const on = draft.levels.includes(l.value);
                    return (
                      <button key={l.value} type="button"
                              className={on ? `${s.chip} ${s.chipOn}` : s.chip}
                              aria-pressed={on}
                              onClick={() => set("levels", on ? draft.levels.filter((x) => x !== l.value) : [...draft.levels, l.value])}>
                        {l.label}
                      </button>
                    );
                  })}
                </div>
              </Field>

              <Field label="Eligibility"><textarea className={shell.textarea} value={draft.eligibility}
                     maxLength={4000} onChange={(e) => set("eligibility", e.target.value)} /></Field>
              <Field label="What it covers"><textarea className={shell.textarea} value={draft.benefits}
                     maxLength={4000} onChange={(e) => set("benefits", e.target.value)} /></Field>
              <Field label="How to apply"><textarea className={shell.textarea} value={draft.howToApply}
                     maxLength={4000} onChange={(e) => set("howToApply", e.target.value)} /></Field>
              <Field label="Documents needed"><textarea className={shell.textarea} value={draft.documents}
                     maxLength={2000} onChange={(e) => set("documents", e.target.value)} /></Field>
              <Field label="Apply link" hint="If applications open somewhere other than the main page.">
                <input className={shell.input} value={draft.applyLink} onChange={(e) => set("applyLink", e.target.value)} />
              </Field>
            </section>

            <section className={`${s.card} ${s.publish}`}>
              <div>
                <h2 className="t-section">3 · Publish</h2>
                <p className="t-meta c-secondary">
                  It appears for every student immediately, tagged “Added by college”. You can edit or remove
                  it afterwards from Listings.
                </p>
              </div>
              <button type="button" className={shell.primary} disabled={!canPublish} onClick={() => void publish()}>
                Publish to the portal
              </button>
            </section>
          </>
        ) : null}
      </div>

      <aside className={s.right}>
        <StudentPreview draft={draft} />
      </aside>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className={shell.field}>
      <span className={shell.label}>{label}</span>
      {children}
      {hint ? <span className={shell.hint}>{hint}</span> : null}
    </label>
  );
}
