"use client";

/* What the student will see, rendered from the same draft the form is editing.
 *
 * It is a REIMPLEMENTATION of the card, and that is a real cost worth naming:
 * the portal's own card component lives in web/ and is wired to the portal's
 * data hooks, its gate and its saved-state store, none of which exist here. The
 * honest options were to lift the card into a shared package — a large refactor
 * of the student app to serve the desk — or to draw a faithful copy of it from
 * the same tokens. This is the copy, and it uses the real projection helpers
 * (deadlineState, typeLabel, formatMoney) so the parts that encode judgement
 * are shared even though the markup is not.
 *
 * What that means in practice: if the portal's card changes, this must be
 * changed too. It is one file and it is named so that is findable.
 */

import s from "./preview.module.css";
import { deadlineState, typeLabel, type Draft } from "@/lib/draft";

export function StudentPreview({ draft }: { draft: Draft }) {
  const d = deadlineState(draft.deadline);
  const money =
    draft.amountValue && Number(draft.amountValue) > 0
      ? `${draft.amountCurrency || ""} ${Number(draft.amountValue).toLocaleString()}`.trim()
      : null;

  return (
    <div className={s.wrap} aria-label="Student preview">
      <div className={s.frameHead}>
        <span className={s.dot} /><span className={s.dot} /><span className={s.dot} />
        <span className={s.frameLabel}>What a student sees</span>
      </div>

      <div className={s.canvas}>
        <article className={s.card}>
          <div className={s.cardTop}>
            <span className={s.badge}>Added by college</span>
            {d.label ? (
              <span className={[s.deadline, d.urgent ? s.deadlineUrgent : d.soon ? s.deadlineSoon : ""].join(" ")}>
                {d.label}
              </span>
            ) : null}
          </div>

          <h3 className={s.title}>{draft.title.trim() || "Your title will appear here"}</h3>

          <p className={s.meta}>
            {[typeLabel(draft.type), draft.country, draft.duration].filter(Boolean).join(" · ") ||
              "Type · Country · Duration"}
          </p>

          {draft.summary.trim() ? (
            <p className={s.summary}>{draft.summary.trim()}</p>
          ) : (
            <p className={`${s.summary} ${s.placeholder}`}>
              The description you write will show here, trimmed to about four lines.
            </p>
          )}

          <div className={s.tags}>
            {draft.funding ? <span className={s.tag}>{draft.funding.replace(/_/g, " ")}</span> : null}
            {money ? <span className={s.tag}>{money}</span> : null}
            {draft.levels.map((l) => <span key={l} className={s.tag}>{l}</span>)}
          </div>

          <div className={s.cardFoot}>
            <span className={s.source}>BITS Pilani Dubai</span>
            <span className={s.open}>Open →</span>
          </div>
        </article>

        {/* The detail screen, which is where the long fields finally show. A
            staff member filling in "Eligibility" should be able to see that it
            goes somewhere, or the field reads as a form for the sake of one. */}
        <section className={s.detail}>
          <h4 className={s.detailHead}>On the full page</h4>
          {([
            ["Eligibility", draft.eligibility],
            ["What it covers", draft.benefits],
            ["How to apply", draft.howToApply],
            ["Documents", draft.documents],
          ] as const).map(([label, value]) => (
            <div key={label} className={s.block}>
              <span className={s.blockLabel}>{label}</span>
              {value.trim() ? (
                <p className={s.blockText}>{value.trim()}</p>
              ) : (
                <p className={`${s.blockText} ${s.placeholder}`}>Not filled in — this section is hidden.</p>
              )}
            </div>
          ))}
          {draft.applyLink.trim() ? (
            <span className={s.applyBtn}>Apply on the official site →</span>
          ) : (
            <span className={`${s.applyBtn} ${s.applyMuted}`}>No apply link — students go to the main URL</span>
          )}
        </section>
      </div>
    </div>
  );
}
