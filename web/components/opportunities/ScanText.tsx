"use client";

/* Long scraped prose, made skimmable.
 *
 * The problem: eligibility and benefits arrive as one unbroken run of
 * sentences, 900 characters of it, and a student bounces off the wall of text
 * before finding the one line that decides whether they can apply.
 *
 * The rule I held to: NOTHING IS REMOVED and nothing is reworded. Summarising
 * scraped text would mean inventing claims the source did not make, on a page
 * whose whole value is that it reports what a page said. So this changes the
 * SHAPE only —
 *
 *   - one sentence per line, with a hairline rather than a bullet, so the eye
 *     has somewhere to rest between claims
 *   - the facts a student hunts for (amounts, dates, durations, CGPA, counts)
 *     set in a heavier weight
 *   - sentences carrying a hard requirement ("must", "minimum", "required")
 *     marked, because those are the ones that decide whether to start
 *   - everything past the first few sentences folded, with the exact count of
 *     what is hidden, so the control never reads as "we cut something"
 */

import { useMemo, useState } from "react";
import s from "./ScanText.module.css";
import { Icon } from "../ui/Icon";

const VISIBLE = 4;

/* Abbreviations that must not end a sentence, or "e.g. 8.0 CGPA" becomes three
 * fragments. Deliberately short: this is a splitter, not a parser. */
const NOT_END = /\b(?:e\.g|i\.e|etc|vs|approx|no|dr|prof|mr|mrs|ms|st|jr|sr|u\.s|u\.k|ph\.d|b\.e|m\.s|a\.m|p\.m)\.$/i;

function sentences(text: string): string[] {
  const out: string[] = [];
  let buf = "";
  for (const part of text.split(/(?<=[.!?])\s+/)) {
    buf = buf ? `${buf} ${part}` : part;
    /* Keep accumulating while the fragment ends in an abbreviation, or is too
     * short to be a sentence on its own. */
    if (NOT_END.test(buf.trim()) || buf.trim().length < 40) continue;
    out.push(buf.trim());
    buf = "";
  }
  if (buf.trim()) out.push(buf.trim());
  return out.filter(Boolean);
}

/* Numbers and dates a student is scanning for. Order matters: the money and
 * date patterns run before the bare-number one so "$60,000" is not split. */
const KEY = new RegExp(
  [
    String.raw`[$€£₹]\s?[\d,]+(?:\.\d+)?`,
    String.raw`\b(?:USD|EUR|GBP|AED|INR|CHF|CAD|AUD|JPY|SEK)\s?[\d,]+(?:\.\d+)?`,
    String.raw`\b\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\b`,
    String.raw`\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}(?:,\s*\d{4})?`,
    String.raw`\b\d+(?:\.\d+)?\s*(?:CGPA|GPA)\b`,
    String.raw`\b\d+(?:\.\d+)?\s*%`,
    String.raw`\b\d+\s*(?:years?|months?|weeks?|days?|semesters?)\b`,
    String.raw`\b20\d{2}(?:[-–/]\d{2,4})?\b`,
  ].join("|"),
  "gi",
);

const REQUIREMENT = /\b(?:must|required?|minimum|at least|not eligible|only|mandatory|should have|need to)\b/i;

function Highlighted({ text }: { text: string }) {
  const parts = useMemo(() => {
    const out: { t: string; key: boolean }[] = [];
    let last = 0;
    for (const m of text.matchAll(KEY)) {
      const i = m.index ?? 0;
      if (i > last) out.push({ t: text.slice(last, i), key: false });
      out.push({ t: m[0], key: true });
      last = i + m[0].length;
    }
    if (last < text.length) out.push({ t: text.slice(last), key: false });
    return out;
  }, [text]);

  return (
    <>
      {parts.map((p, i) => (p.key ? <strong className={s.key} key={i}>{p.t}</strong> : <span key={i}>{p.t}</span>))}
    </>
  );
}

export function ScanText({ text, label }: { text: string; label?: string }) {
  const [all, setAll] = useState(false);
  const lines = useMemo(() => sentences(text), [text]);

  /* Short enough to read as-is: splitting three sentences into a list is
   * ceremony, not help. */
  if (lines.length <= 2) {
    return (
      <p className={s.item} style={{ paddingLeft: 0 }}>
        <span className={s.text}>
          <Highlighted text={text} />
        </span>
      </p>
    );
  }

  const shown = all ? lines : lines.slice(0, VISIBLE);
  const hidden = lines.length - shown.length;

  return (
    <div>
      <ul className={s.list}>
        {shown.map((line, i) => {
          const req = REQUIREMENT.test(line);
          return (
            <li className={s.item} key={i}>
              <span className={[s.marker, req ? s.markerKey : null].filter(Boolean).join(" ")} aria-hidden="true" />
              <span className={s.text}>
                {req ? (
                  <span className={s.req}>
                    <Highlighted text={line} />
                  </span>
                ) : (
                  <Highlighted text={line} />
                )}
              </span>
            </li>
          );
        })}
      </ul>

      {hidden > 0 || all ? (
        <button type="button" className={s.more} onClick={() => setAll((a) => !a)}>
          <Icon name={all ? "minus" : "plus"} size={14} />
          {all
            ? `Show less${label ? ` of ${label.toLowerCase()}` : ""}`
            : `Show ${hidden} more line${hidden === 1 ? "" : "s"}`}
        </button>
      ) : null}
    </div>
  );
}

/* The strip of pulled-out numbers above a long block. Only renders what it
 * actually found — §105, never imply a fact that is not there. */
export function ScanFacts({ items }: { items: { label: string; value: string | null }[] }) {
  const real = items.filter((i) => i.value);
  if (!real.length) return null;
  return (
    <div className={s.facts}>
      {real.map((i) => (
        <span className={s.fact} key={i.label}>
          <span className={s.factLabel}>{i.label}</span>
          <span className={s.factValue}>{i.value}</span>
        </span>
      ))}
    </div>
  );
}
