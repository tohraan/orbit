"use client";

/* The three indicators that must behave identically on every screen (§81):
 * deadline, funding, and the external-source line. Each is one component, used
 * by the card, the detail hero, the deadline list and the comparison table. */

import s from "./opportunity.module.css";
import { Chip, type ChipTone } from "../ui/Chip";
import { FUNDING_LABELS, countryLabel, deadlineState, fundingBucket, levelLabel, tierLabel, typeLabel } from "@rof/core";
import type { OpportunitySummary } from "@rof/core";

/* §33: normal shows a date, upcoming and urgent show days left, expired says
 * so, and an unknown deadline is explicit but quiet (§105). §108: the tone is
 * never the only signal — the label carries the same meaning.
 *
 * The BADGE thresholds are tighter than deadlineState's: error at 3 days or
 * fewer, warning at 14 or fewer, neutral beyond. deadlineState's own bands
 * (7 and 30) stay as they are — they are shared with the data service and
 * decide ordering and filtering, not colour — but a listing 28 days out was
 * being painted amber, which spends the alarm colour on something that is not
 * yet worth alarm. Colour is decided here, where it is a presentation choice. */
function badgeTone(days: number | null, fallback: string): ChipTone {
  if (days == null) return TONE[fallback] ?? "quiet";
  if (days <= 3) return "urgent";
  if (days <= 14) return "soon";
  return "neutral";
}

const TONE: Record<string, ChipTone> = {
  urgent: "urgent",
  soon: "soon",
  normal: "neutral",
  expired: "quiet",
  rolling: "info",
  unknown: "quiet",
};

export function DeadlineIndicator({
  item,
  withLabel,
}: {
  item: Pick<OpportunitySummary, "deadline" | "deadlineKind">;
  withLabel?: boolean;
}) {
  const d = deadlineState(item);

  if (d.tone === "unknown" || d.tone === "rolling") {
    return (
      <span className={s.deadlineValue}>
        {withLabel ? <span className={s.deadlineLabel}>Deadline</span> : null}
        <span className={s.deadlineUnknown}>{d.tone === "rolling" ? "Rolling — no fixed date" : d.label}</span>
      </span>
    );
  }

  return (
    <span className={s.deadlineValue}>
      {withLabel ? <span className={s.deadlineLabel}>Deadline</span> : null}
      <Chip tone={d.tone === "expired" ? "quiet" : badgeTone(d.days, d.tone)} icon={d.days != null && d.days <= 3 ? "clock" : undefined}>
        {d.label}
      </Chip>
    </span>
  );
}

/** §34: funding is immediately scannable, and uses the lime accent surface. */
export function FundingIndicator({ funding }: { funding: string | null }) {
  const bucket = fundingBucket(funding);
  if (bucket === "unspecified") {
    return <Chip tone="quiet">Funding not specified</Chip>;
  }
  /* The lime surface is reserved for the two buckets that mean money is
     actually covered. §34: do not turn every funding label into a bright
     badge. */
  const tone: ChipTone = bucket === "fully_funded" || bucket === "tuition_waiver" ? "funding" : "neutral";
  return (
    <Chip tone={tone} icon="coins">
      {FUNDING_LABELS[bucket]}
    </Chip>
  );
}

/** §35: compact location metadata, with an explicit unknown. */
export function LocationIndicator({ country }: { country: string | null }) {
  return (
    <Chip tone={country ? "neutral" : "quiet"} icon="globe">
      {countryLabel(country)}
    </Chip>
  );
}

export function LevelChips({ levels, max = 2 }: { levels: string[]; max?: number }) {
  if (!levels.length) return null;
  const shown = levels.slice(0, max);
  const rest = levels.length - shown.length;
  return (
    <>
      {shown.map((l) => (
        <Chip key={l} tone="quiet">
          {levelLabel(l)}
        </Chip>
      ))}
      {rest > 0 ? (
        <Chip tone="quiet" title={levels.map(levelLabel).join(", ")}>
          +{rest}
        </Chip>
      ) : null}
    </>
  );
}

/* §73: an external source is labelled as external. The tier is stated because
 * provenance is a real decision input here — a figure from a primary funder
 * and the same figure from an aggregator are not equally reliable. */
export function Provenance({ item }: { item: OpportunitySummary }) {
  const tier = tierLabel(item.sourceTier);
  return (
    <span className={s.provenance}>
      <span className={s.provenanceHost} title={`${item.sourceName}${tier ? ` — ${tier}` : ""}`}>
        {item.host ?? item.sourceName}
      </span>
      {tier ? (
        <>
          <span aria-hidden="true">&middot;</span>
          <span>{tier}</span>
        </>
      ) : null}
    </span>
  );
}

export { typeLabel };
