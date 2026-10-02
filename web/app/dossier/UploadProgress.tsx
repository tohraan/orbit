"use client";

/* What the student watches while a document is being taken in.
 *
 * The work is genuinely staged — hash, upload, read page by page, match
 * against the index — so the progress is staged too, and each number it shows
 * is a real one. A bar that animates to 90% and waits is a lie told to make
 * waiting feel shorter; this one moves when something has actually happened,
 * which also means a stall is visible instead of disguised.
 *
 * The findings tick in as they are made. That is not decoration either: it is
 * the first moment the student sees that we are reading rather than just
 * storing, and it sets up the review step that follows.
 */

import { useEffect, useRef, useState } from "react";
import s from "./upload.module.css";
import { Icon } from "@/components/ui/Icon";

export type Stage = "hashing" | "uploading" | "reading" | "matching" | "done" | "failed";

export type Progress = {
  stage: Stage;
  fileName: string;
  /** 0–100 within the current stage, where the stage can report one. */
  pct: number;
  page?: number;
  pages?: number;
  /** Terms as they are found, so the panel fills in rather than sitting still. */
  found: string[];
  note?: string | null;
  /* Which stage it broke in. Without it a failure renders every step grey —
   * the panel forgets that the file was already checked and stored, which is
   * both wrong and the opposite of reassuring when storage DID succeed. */
  failedAt?: Stage;
};

const STEPS: { id: Stage; label: string; doing: string }[] = [
  { id: "hashing", label: "Checked", doing: "Checking the file" },
  { id: "uploading", label: "Stored", doing: "Storing it privately" },
  { id: "reading", label: "Read", doing: "Reading the text" },
  { id: "matching", label: "Matched", doing: "Matching against the index" },
];

/* Overall completion, weighted by how long each stage actually takes. Reading
 * dominates on a multi-page PDF, so it owns most of the bar; hashing is
 * near-instant and owns almost none of it. */
const WEIGHT: Record<string, [number, number]> = {
  hashing: [0, 8],
  uploading: [8, 40],
  reading: [40, 88],
  matching: [88, 100],
};

function overall(p: Progress): number {
  if (p.stage === "done") return 100;
  if (p.stage === "failed") return 100;
  const [from, to] = WEIGHT[p.stage] ?? [0, 100];
  return Math.round(from + ((to - from) * Math.min(100, Math.max(0, p.pct))) / 100);
}

export function UploadProgress({ progress }: { progress: Progress }) {
  const pct = overall(progress);
  const done = progress.stage === "done";
  const failed = progress.stage === "failed";
  const activeIndex = STEPS.findIndex((x) => x.id === (failed ? (progress.failedAt ?? progress.stage) : progress.stage));

  /* The bar must never appear to go backwards: a later stage reporting a low
   * within-stage percentage would otherwise pull it back. */
  const [shown, setShown] = useState(pct);
  const high = useRef(pct);
  useEffect(() => {
    high.current = Math.max(high.current, pct);
    setShown(high.current);
  }, [pct]);

  const current = STEPS[activeIndex];

  return (
    <section className={[s.wrap, done ? s.wrapDone : null, failed ? s.wrapFailed : null].filter(Boolean).join(" ")}>
      <div className={s.head}>
        <span className={[s.spinner, done || failed ? s.spinnerStill : null].filter(Boolean).join(" ")} aria-hidden="true">
          {done ? <Icon name="check" size={16} /> : failed ? <Icon name="alert" size={16} /> : null}
        </span>
        <div className={s.headText}>
          <p className={s.title}>
            {done ? "Added to your Dossier" : failed ? "Could not finish" : (current?.doing ?? "Working")}
            {progress.pages && progress.stage === "reading" ? (
              <span className={s.pageCount}>
                {" "}
                page {progress.page ?? 1} of {progress.pages}
              </span>
            ) : null}
          </p>
          <p className={s.file}>{progress.fileName}</p>
        </div>
        <span className={s.pct} aria-hidden="true">
          {shown}%
        </span>
      </div>

      <div className={s.track} role="progressbar" aria-valuenow={shown} aria-valuemin={0} aria-valuemax={100}>
        <span className={s.fill} style={{ width: `${Math.max(3, shown)}%` }} />
      </div>

      {/* The stages, so the wait has a shape rather than being one long bar. */}
      <ol className={s.steps}>
        {STEPS.map((step, i) => {
          const state = failed && i === activeIndex ? "failed" : i < activeIndex || done ? "done" : i === activeIndex ? "now" : "todo";
          return (
            <li key={step.id} className={[s.step, s[`step_${state}`]].join(" ")}>
              <span className={s.stepDot} aria-hidden="true">
                {state === "done" ? <Icon name="check" size={11} /> : null}
              </span>
              <span className={s.stepLabel}>{step.label}</span>
            </li>
          );
        })}
      </ol>

      {/* Findings as they land. Each one animates in once, so the panel reports
          progress the bar cannot: that it is reading something real. */}
      {progress.found.length ? (
        <div className={s.found} aria-live="polite">
          {progress.found.map((f, i) => (
            <span className={s.chip} key={f} style={{ animationDelay: `${Math.min(i, 6) * 60}ms` }}>
              <Icon name="sparkle" size={12} />
              {f}
            </span>
          ))}
        </div>
      ) : null}

      {progress.note ? <p className={s.note}>{progress.note}</p> : null}
    </section>
  );
}
