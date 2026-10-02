"use client";

/* The structured block inside an opportunity card.
 *
 * Replaces a loose row of same-shaped chips. Chips made every fact look alike,
 * so finding "which country" meant reading all of them; labelled rows give
 * each fact a fixed place on every card in the grid, which is what §3.1 asks
 * for and what makes a grid scannable rather than merely tidy.
 *
 * Only facts that exist are rendered — §105 forbids implying data that is not
 * there — but the LABELS stay in the same order, so two cards side by side
 * still line up on whatever they do have.
 */

import s from "./opportunity.module.css";
import { Money } from "./Money";
import { countryLabel, deadlineState, levelLabel } from "@rof/core";
import { FUNDING_LABELS, fundingBucket } from "@rof/core";
import type { OpportunitySummary } from "@rof/core";

export function CardFacts({ item }: { item: OpportunitySummary }) {
  const bucket = fundingBucket(item.funding);
  const levels = item.levels.length
    ? item.levels.slice(0, 2).map(levelLabel).join(", ") + (item.levels.length > 2 ? ` +${item.levels.length - 2}` : "")
    : null;

  const rows: { label: string; value: string | null }[] = [
    { label: "Funding", value: bucket === "unspecified" ? null : FUNDING_LABELS[bucket] },
    { label: "Where", value: item.country ? countryLabel(item.country) : null },
    { label: "Level", value: levels },
    { label: "Length", value: item.duration },
  ].filter((r) => r.value) as { label: string; value: string }[];

  if (!rows.length) {
    return (
      <div className={s.facts}>
        <span className={s.factLabel}>Details</span>
        <span className={`${s.factValue} ${s.factValueMuted}`}>Not published by the source</span>
      </div>
    );
  }

  return (
    <div className={s.facts}>
      {rows.map((r) => (
        <span key={r.label} style={{ display: "contents" }}>
          <span className={s.factLabel}>{r.label}</span>
          <span className={s.factValue} title={r.value ?? undefined}>
            {r.value}
          </span>
        </span>
      ))}
    </div>
  );
}

/** The two facts that decide whether a card is worth opening. */
export function CardDecide({ item }: { item: OpportunitySummary }) {
  const dl = deadlineState(item);
  /* The band takes its tint from the deadline, because that is the fact that
   * expires; funding only tints it when there is no date to be urgent about. */
  const tone =
    dl.tone === "urgent"
      ? s.decideUrgent
      : dl.tone === "soon"
        ? s.decideSoon
        : fundingBucket(item.funding) === "fully_funded"
          ? s.decideFunded
          : null;

  return (
    <div className={[s.decide, tone].filter(Boolean).join(" ")}>
      <span className={s.decideLeft}>
        <span className={s.decideLabel}>{dl.tone === "rolling" || dl.tone === "unknown" ? "Applications" : "Closes"}</span>
        <span className={s.decideValue}>{dl.tone === "rolling" ? "Open — no fixed date" : dl.label}</span>
      </span>
      {item.amount ? (
        <span className={s.decideRight}>
          <Money value={item.amount} size="sm" />
        </span>
      ) : null}
    </div>
  );
}
