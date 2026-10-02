"use client";

/* The Dossier.
 *
 * Two jobs, and the second is the one that justifies the first.
 *
 *   1  Keep the documents an application asks for in one place, so the
 *      twentieth application does not mean hunting for the transcript again.
 *   2  Read them — with permission, visibly — and use what they say to find
 *      opportunities the student would not have searched for.
 *
 * The design rule throughout: a document produces CLAIMS, never facts. Nothing
 * read out of a CV reaches the matcher until the student has seen the sentence
 * it came from and said yes. That is why the review step shows evidence beside
 * every term and a count of how many listings the term actually reaches — a
 * student should be able to tell the difference between a finding that will
 * change their results and one that will not, and so should we.
 */

import { useCallback, useMemo, useRef, useState } from "react";
import Link from "next/link";
import s from "./dossier.module.css";
import { PageHead } from "@/components/layout/AppShell";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Chip } from "@/components/ui/Chip";
import { Select } from "@/components/ui/Field";
import { EmptyState, ErrorState } from "@/components/feedback/States";
import { BentoSkeleton } from "@/components/feedback/Skeletons";
import { useToast } from "@/components/feedback/Toast";
import { useGate } from "@/lib/gate";
import { useDossier, type DossierDoc } from "@/lib/dossier";
import { useProfile } from "@/lib/data";
import { useApi } from "@/lib/useApi";
import { api } from "@/lib/api-base";
import { ACCEPT, MAX_BYTES, hashFile, readDocument } from "@/lib/read-document";
import { UploadProgress, type Progress } from "./UploadProgress";
import {
  DOC_KINDS,
  DOC_KIND_LABELS,
  DOC_KIND_WHY,
  extract,
  mergeFields,
  reachIndex,
  relativeTime,
  type DocKind,
  type Extraction,
  type OpportunitySummary,
} from "@rof/core";

/* The checklist. Not a progress bar — a student with no reference letter is
 * not 80% of a person — but a list of what applications ask for, so the empty
 * state is useful rather than decorative. */
const CHECKLIST: DocKind[] = ["cv", "transcript", "certificate", "sop", "reference", "identity"];

export function DossierScreen() {
  const gate = useGate();
  const { docs, ready, error, schemaReady, upload, saveExtraction, saveApplied, rename, setKind, remove, openUrl, reload } =
    useDossier();
  const { profile, save } = useProfile();
  const toast = useToast();

  /* The corpus, for reach. One request, cached server-side; the whole index is
   * needed because reach is a property of all of it, not of a page. */
  const corpus = useApi<{ items: OpportunitySummary[] }>(api("/api/opportunities?pageSize=120&sort=deadline"));
  const reach = useMemo(() => reachIndex(corpus.data?.items ?? []), [corpus.data]);

  const [progress, setProgress] = useState<Progress | null>(null);
  const [review, setReview] = useState<{ doc: DossierDoc; found: Extraction } | null>(null);
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const accept = useCallback(
    async (file: File) => {
      if (file.size > MAX_BYTES) {
        toast("That file is larger than the 10 MB limit.");
        return;
      }

      /* Each step reports when it has actually happened. Nothing here advances
       * the bar on a timer, so a stall shows up as a stall. */
      const step = (patch: Partial<Progress>) =>
        setProgress((cur) => ({ ...(cur ?? { stage: "hashing", fileName: file.name, pct: 0, found: [] }), ...patch }));

      setProgress({ stage: "hashing", fileName: file.name, pct: 0, found: [] });
      try {
        const hash = await hashFile(file);
        step({ stage: "uploading", pct: 10 });

        const { doc, error: upErr } = await upload(file, { kind: guessKind(file.name), hash });
        if (!doc) {
          step({ stage: "failed", failedAt: "uploading", note: upErr ?? "The upload did not complete." });
          toast(upErr ?? "The upload did not complete.");
          window.setTimeout(() => setProgress(null), 4200);
          return;
        }
        step({ stage: "reading", pct: 0 });

        const read = await readDocument(file, (pct, page, pages) =>
          step({ stage: "reading", pct, page, pages }),
        );

        step({ stage: "matching", pct: 30 });
        const found = read.status === "parsed" ? extract(read.text, reach) : null;
        /* Reveal the findings one at a time: the point of this panel is that
         * the student sees reading happen, not a number climbing. */
        if (found?.terms.length) {
          for (let i = 0; i < found.terms.length; i++) {
            step({ found: found.terms.slice(0, i + 1).map((t) => t.term), pct: 30 + ((i + 1) / found.terms.length) * 70 });
            await new Promise((r) => window.setTimeout(r, 160));
          }
        }

        await saveExtraction(doc.id, read.status, found, read.pages);
        step({ stage: "done", pct: 100, note: read.note });

        if (found && (found.terms.length || found.level)) {
          setReview({ doc: { ...doc, parseStatus: read.status, extracted: found }, found });
        } else if (!read.note) {
          toast("Added — nothing in it we could match on.");
        }
        window.setTimeout(() => setProgress(null), 2600);
      } catch {
        /* Keep the stage we had reached, so the panel still shows what did
         * succeed before the failure. */
        setProgress((cur) =>
          cur ? { ...cur, stage: "failed", failedAt: cur.stage, note: "Something went wrong part-way through." } : cur,
        );
        window.setTimeout(() => setProgress(null), 4200);
      }
    },
    [upload, saveExtraction, reach, toast],
  );

  const pick = () => gate.require("dossier", () => input.current?.click());

  /* ------------------------------------------------------------- gated --- */
  if (!gate.signedIn && !gate.pending) {
    return (
      <>
        <PageHead eyebrow="You" title="Dossier" description="The documents you need for applications, in one place." />
        <EmptyState
          icon="upload"
          title="Sign in to use your Dossier"
          body="Documents are stored privately against your account — nobody else can read them, and that is only possible once we know whose they are."
          actions={
            <>
              <ButtonLink href="/account?next=%2Fdossier" variant="primary">
                Sign in
              </ButtonLink>
              <ButtonLink href="/explore" variant="secondary">
                Keep browsing
              </ButtonLink>
            </>
          }
        />
      </>
    );
  }

  const missing = CHECKLIST.filter((k) => !docs.some((d) => d.kind === k));

  return (
    <>
      <PageHead
        compact
        eyebrow="You"
        title="Dossier"
        description="The documents applications ask for, kept in one place — and read, with your say-so, to find more that fit."
        actions={
          docs.length ? (
            <Button variant="primary" icon="upload" onClick={pick} busy={Boolean(progress)}>
              Add a document
            </Button>
          ) : null
        }
      />

      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void accept(f);
        }}
      />

      {review ? (
        <ReviewPanel
          doc={review.doc}
          found={review.found}
          onDismiss={() => setReview(null)}
          onApply={async (terms, level) => {
            const next = { ...profile, fields: mergeFields(profile.fields, terms) };
            if (level && !profile.level) next.level = level;
            await save(next);
            await saveApplied(review.doc.id, { terms, level });
            setReview(null);
            toast(terms.length ? `Added ${terms.length} to what we match on` : "Nothing added");
          }}
        />
      ) : null}

      {schemaReady === false ? <SetupNotice /> : null}
      {progress ? <UploadProgress progress={progress} /> : null}

      {!ready || corpus.initial ? (
        <BentoSkeleton lines={5} />
      ) : error ? (
        <ErrorState
          title="Couldn't load your documents"
          body={error}
          actions={
            <Button variant="secondary" icon="refresh" onClick={reload}>
              Try again
            </Button>
          }
        />
      ) : docs.length === 0 ? (
        <Dropzone dragging={dragging} setDragging={setDragging} onFile={accept} onPick={pick} first />
      ) : (
        <div className={s.layout}>
          <div className={s.list}>
            {docs.map((d) => (
              <DocRow
                key={d.id}
                doc={d}
                onOpen={async () => {
                  const url = await openUrl(d);
                  if (url) window.open(url, "_blank", "noopener");
                  else toast("That link could not be created.");
                }}
                onKind={(k) => setKind(d.id, k)}
                onRename={(l) => rename(d.id, l)}
                onRemove={async () => {
                  if (!window.confirm(`Remove ${d.label || d.fileName} from your Dossier? This cannot be undone.`))
                    return;
                  await remove(d);
                  toast("Removed");
                }}
                onReview={() => d.extracted && setReview({ doc: d, found: d.extracted })}
              />
            ))}
            <Dropzone dragging={dragging} setDragging={setDragging} onFile={accept} onPick={pick} />
          </div>

          <aside className={s.rail}>
            <div className={s.card}>
              <h2 className="t-section">Still to gather</h2>
              {missing.length === 0 ? (
                <p className="t-body-sm c-secondary">
                  Everything on the usual list is here. Applications occasionally ask for more — add it when they do.
                </p>
              ) : (
                <ul className={s.todo}>
                  {missing.map((k) => (
                    <li className={s.todoRow} key={k}>
                      <span className={s.todoDot} />
                      <span className={s.todoBody}>
                        <span className={s.todoLabel}>{DOC_KIND_LABELS[k]}</span>
                        <span className={s.todoWhy}>{DOC_KIND_WHY[k]}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className={s.card}>
              <h2 className="t-section">Where this lives</h2>
              <p className="t-body-sm c-secondary">
                Files are stored in a private bucket scoped to your account, and the text is read in this browser —
                the file itself is never sent anywhere to be parsed.
              </p>
              <p className="t-meta c-muted">
                We read PDFs and text files. Images and Word files are kept but not read, and we do not run OCR, so a
                scan is stored as a scan.
              </p>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}

/* --------------------------------------------------------------- review --- */

/* The consent step, and the most important screen in the feature.
 *
 * Every term carries the sentence it came from and the number of listings it
 * reaches. The reach is not decoration: it is the difference between a term
 * that will change the student's results and one that will sit in their
 * profile doing nothing, and hiding it would make the feature feel cleverer
 * than it is. Terms with no reach never get this far (dossier.ts drops them). */
function ReviewPanel({
  doc,
  found,
  onApply,
  onDismiss,
}: {
  doc: DossierDoc;
  found: Extraction;
  onApply: (terms: string[], level: string | null) => void | Promise<void>;
  onDismiss: () => void;
}) {
  const already = new Set(doc.applied?.terms ?? []);
  const [chosen, setChosen] = useState<Set<string>>(
    () => new Set(found.terms.filter((t) => !already.has(t.term)).map((t) => t.term)),
  );
  const [takeLevel, setTakeLevel] = useState(Boolean(found.level));
  const [saving, setSaving] = useState(false);

  const toggle = (t: string) =>
    setChosen((cur) => {
      const next = new Set(cur);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });

  return (
    <section className={s.review}>
      <div className={s.reviewHead}>
        <span className={s.reviewMark} aria-hidden="true">
          <Icon name="sparkle" size={18} />
        </span>
        <div style={{ minWidth: 0 }}>
          <h2 className="t-section">We read {doc.label || doc.fileName}</h2>
          <p className="t-body-sm c-secondary">
            Here is what it says you work on. Nothing below changes your matches until you add it.
          </p>
        </div>
        <button type="button" className={s.reviewClose} aria-label="Dismiss" onClick={onDismiss}>
          <Icon name="close" size={16} />
        </button>
      </div>

      {found.level ? (
        <label className={s.levelRow}>
          <input type="checkbox" checked={takeLevel} onChange={(e) => setTakeLevel(e.target.checked)} />
          <span className={s.levelBody}>
            <span className={s.termName}>
              You are applying at <strong>{found.level.value}</strong> level
            </span>
            {found.level.evidence ? <span className={s.evidence}>“{found.level.evidence}”</span> : null}
          </span>
        </label>
      ) : null}

      {found.terms.length ? (
        <>
          <p className="t-meta c-muted">
            Subjects found, with how many of the current listings each one appears in:
          </p>
          <div className={s.terms}>
            {found.terms.map((t) => {
              const on = chosen.has(t.term);
              const had = already.has(t.term);
              return (
                <label className={[s.term, on ? s.termOn : null].filter(Boolean).join(" ")} key={t.term}>
                  <input type="checkbox" checked={on} onChange={() => toggle(t.term)} disabled={had} />
                  <span className={s.termBody}>
                    <span className={s.termTop}>
                      <span className={s.termName}>{t.term}</span>
                      <span className={s.termReach}>
                        {t.reach} listing{t.reach === 1 ? "" : "s"}
                      </span>
                      {had ? <Chip tone="quiet">Already added</Chip> : null}
                    </span>
                    {t.matched !== t.term ? (
                      <span className={s.termMatched}>your document says “{t.matched}”</span>
                    ) : null}
                    {t.evidence ? <span className={s.evidence}>“{t.evidence}”</span> : null}
                  </span>
                </label>
              );
            })}
          </div>
        </>
      ) : (
        <p className="t-body-sm c-secondary">
          No subjects we can match on. That usually means the document is a certificate or an ID rather than a CV.
        </p>
      )}

      <div className={s.reviewFoot}>
        <Button
          variant="primary"
          busy={saving}
          disabled={saving || (chosen.size === 0 && !takeLevel)}
          onClick={async () => {
            setSaving(true);
            await onApply([...chosen], takeLevel && found.level ? found.level.value : null);
            setSaving(false);
          }}
        >
          {chosen.size ? `Add ${chosen.size} to my profile` : "Add"}
        </Button>
        <Button variant="ghost" onClick={onDismiss}>
          Not now
        </Button>
        <span className="t-meta c-muted">
          You can change any of this on <Link href="/profile" className={s.inlineLink}>your profile</Link>.
        </span>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------- the list --- */

function DocRow({
  doc,
  onOpen,
  onKind,
  onRename,
  onRemove,
  onReview,
}: {
  doc: DossierDoc;
  onOpen: () => void;
  onKind: (k: DocKind) => void;
  onRename: (label: string) => void;
  onRemove: () => void;
  onReview: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(doc.label ?? "");
  const added = doc.applied?.terms?.length ?? 0;

  return (
    <article className={s.doc}>
      <span className={s.docIcon} aria-hidden="true">
        <Icon name="file" size={18} />
      </span>

      <div className={s.docBody}>
        {editing ? (
          <input
            className={s.renameInput}
            value={draft}
            autoFocus
            maxLength={120}
            placeholder={doc.fileName}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => {
              onRename(draft);
              setEditing(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                onRename(draft);
                setEditing(false);
              }
              if (e.key === "Escape") {
                setDraft(doc.label ?? "");
                setEditing(false);
              }
            }}
          />
        ) : (
          <button type="button" className={s.docTitle} onClick={() => setEditing(true)} title="Rename">
            {doc.label || doc.fileName}
          </button>
        )}

        <div className={s.docMeta}>
          <Select
            size="sm"
            value={doc.kind}
            ariaLabel="Document type"
            options={DOC_KINDS.map((k) => ({ value: k, label: DOC_KIND_LABELS[k] }))}
            onChange={(v) => onKind(v as DocKind)}
          />
          <span className="t-micro c-muted">
            {formatBytes(doc.byteSize)}
            {doc.pageCount ? ` · ${doc.pageCount} page${doc.pageCount === 1 ? "" : "s"}` : ""} ·{" "}
            {relativeTime(doc.uploadedAt)}
          </span>
        </div>

        <ParseBadge doc={doc} added={added} onReview={onReview} />
      </div>

      <div className={s.docActions}>
        <Button variant="ghost" size="sm" icon="external" onClick={onOpen}>
          Open
        </Button>
        <Button variant="ghost" size="sm" icon="trash" aria-label="Remove" onClick={onRemove} />
      </div>
    </article>
  );
}

/* What happened when we tried to read it, said plainly. "Stored · not read" is
 * a legitimate outcome and looks like one — never an error. */
function ParseBadge({ doc, added, onReview }: { doc: DossierDoc; added: number; onReview: () => void }) {
  const n = doc.extracted?.terms.length ?? 0;

  if (doc.parseStatus === "parsed" && n > 0) {
    return (
      <span className={s.docState}>
        <Chip tone="funding" icon="sparkle">
          {added ? `${added} added to your profile` : `${n} subject${n === 1 ? "" : "s"} found`}
        </Chip>
        <button type="button" className={s.reviewLink} onClick={onReview}>
          {added ? "Review again" : "Review what we found"}
        </button>
      </span>
    );
  }
  if (doc.parseStatus === "parsed")
    return <span className="t-micro c-muted">Read — nothing in it we can match on.</span>;
  if (doc.parseStatus === "no_text")
    return <span className="t-micro c-muted">Stored · no text layer, so there was nothing to read.</span>;
  if (doc.parseStatus === "stored") return <span className="t-micro c-muted">Stored · not read.</span>;
  if (doc.parseStatus === "failed") return <span className="t-micro c-muted">Stored · could not be opened.</span>;
  return <span className="t-micro c-muted">Stored.</span>;
}

/* ------------------------------------------------------------ dropzone --- */

function Dropzone({
  dragging,
  setDragging,
  onFile,
  onPick,
  first,
}: {
  dragging: boolean;
  setDragging: (v: boolean) => void;
  onFile: (f: File) => void;
  onPick: () => void;
  first?: boolean;
}) {
  return (
    <div
      className={[s.drop, dragging ? s.dropActive : null, first ? s.dropFirst : null].filter(Boolean).join(" ")}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const f = e.dataTransfer.files?.[0];
        if (f) onFile(f);
      }}
    >
      <span className={s.dropIcon} aria-hidden="true">
        <Icon name="upload" size={first ? 24 : 18} />
      </span>
      <div className={s.dropText}>
        <p className={s.dropTitle}>{first ? "Start your Dossier" : "Add another"}</p>
        <p className="t-body-sm c-secondary">
          {first
            ? "Your CV first — it is the one every application asks for, and the one we can read the most from."
            : "Drop a file here, or choose one."}
        </p>
      </div>
      <Button variant={first ? "primary" : "secondary"} icon="upload" onClick={onPick}>
        Choose a file
      </Button>
      <p className="t-micro c-muted">PDF and text files are read · images and Word files are kept · 10 MB max</p>
    </div>
  );
}

/* The one state that no amount of retrying fixes: the code is ahead of the
 * database. Saying so, with the file to run, is worth more than a spinner. */
function SetupNotice() {
  return (
    <section className={s.setup}>
      <span className={s.setupMark} aria-hidden="true">
        <Icon name="alert" size={18} />
      </span>
      <div className={s.setupBody}>
        <h2 className="t-section">The Dossier needs one migration</h2>
        <p className="t-body-sm c-secondary">
          Documents are stored against columns this database does not have yet. Run{" "}
          <code className={s.code}>db/016_dossier.sql</code> in Supabase Studio&rsquo;s SQL editor, then reload — it is
          additive and safe to run twice.
        </p>
        <p className="t-micro c-muted">
          Until then your existing documents still list, but new uploads cannot be recorded.
        </p>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- utils --- */

/* A first guess from the filename, so the common case needs no dropdown. It is
 * a guess and the student can change it, which is why it never blocks. */
function guessKind(name: string): DocKind {
  const n = name.toLowerCase();
  if (/\b(cv|resume|r[ée]sum[ée])\b/.test(n)) return "cv";
  if (/\b(transcript|marksheet|grade|marks|academic record)\b/.test(n)) return "transcript";
  if (/\b(certificate|cert|award|diploma)\b/.test(n)) return "certificate";
  if (/\b(sop|statement|motivation|essay|purpose)\b/.test(n)) return "sop";
  if (/\b(reference|recommendation|lor|referee)\b/.test(n)) return "reference";
  if (/\b(passport|emirates|id|visa|nric|aadhaar)\b/.test(n)) return "identity";
  return "other";
}

function formatBytes(n: number | null): string {
  if (!n) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} kB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
