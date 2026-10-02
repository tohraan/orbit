"use client";

/* "Matched for you" — and, when the profile is thin, what we would need to do
 * it properly.
 *
 * The honesty rules this panel exists to keep:
 *   - a score below the confidence floor is shown drained of colour and
 *     labelled as uncertain, never as a recommendation
 *   - every score shows the reasons that produced it, so a student can
 *     disagree with it rather than take it on trust
 *   - the gaps list states what each missing field is WORTH, so "tell us your
 *     degree level" is an argument rather than a demand
 *
 * The scorer itself is in packages/core/src/match.ts, with a frank note about
 * what it is and is not.
 */

import Link from "next/link";
import { useMemo } from "react";
import s from "./match.module.css";
import { ButtonLink } from "../ui/Button";
import { EmptyState } from "../feedback/States";
import { CONFIDENCE_FLOOR, gaps, rank, typeLabel } from "@rof/core";
import type { OpportunitySummary, StudentProfile } from "@rof/core";

export function MatchPanel({
  items,
  profile,
  started,
  limit = 3,
}: {
  items: OpportunitySummary[];
  profile: StudentProfile;
  started: boolean;
  limit?: number;
}) {
  const missing = useMemo(() => gaps(profile), [profile]);
  const ranked = useMemo(
    () => (started ? rank(items, profile).slice(0, limit) : []),
    [items, profile, started, limit],
  );

  if (!started) {
    return (
      <div className={s.panel}>
        <div className={s.head}>
          <h2 className="t-section">Matched for you</h2>
        </div>
        <EmptyState
          compact
          icon="sparkle"
          title="Tell us a little and we'll rank these for you"
          body="Four answers — your degree level, your fields, the funding you need and where you would go — are enough to sort 428 listings into the ones worth your evening."
          actions={
            <ButtonLink href="/welcome" variant="primary">
              Set up your profile
            </ButtonLink>
          }
        />
      </div>
    );
  }

  return (
    <div className={s.panel}>
      <div className={s.head}>
        <h2 className="t-section">Matched for you</h2>
        <Link href="/profile" className="t-meta c-muted">
          Adjust what we match on
        </Link>
      </div>

      {missing.length ? (
        <div className={s.gaps}>
          <strong className="t-body-sm">To rank these properly we still need:</strong>
          <div className={s.gapList}>
            {missing.map((g) => (
              <span className={s.gapItem} key={g.field}>
                <span className={s.gapWorth}>{g.worth}%</span>
                <span>
                  <strong>{g.label}.</strong> {g.why}
                </span>
              </span>
            ))}
          </div>
          <ButtonLink href="/profile" variant="secondary" size="sm">
            Fill these in
          </ButtonLink>
        </div>
      ) : null}

      {ranked.map(({ item, score, reasons, confidence }) => {
        const low = confidence < CONFIDENCE_FLOOR;
        return (
          <Link href={`/opportunity/${item.id}`} className={s.row} key={item.id}>
            <span className={[s.score, low ? s.scoreLow : null].filter(Boolean).join(" ")}>
              <span className={s.scoreNum}>{score}</span>
              <span className={s.scoreOf}>{low ? "unsure" : "fit"}</span>
            </span>
            <span className={s.body}>
              <span className={`${s.title} clamp-2`}>{item.title}</span>
              <span className="t-micro c-muted">
                {typeLabel(item.type)} · {item.sourceName}
              </span>
              <span className={s.reasons}>
                {reasons.slice(0, 3).map((r) => (
                  <span
                    key={r.factor}
                    className={[
                      s.reason,
                      r.points === r.of ? s.reasonGood : null,
                      r.unknown ? s.reasonUnknown : null,
                    ].filter(Boolean).join(" ")}
                  >
                    {r.label}
                  </span>
                ))}
              </span>
            </span>
          </Link>
        );
      })}

      <p className={s.confidence}>
        Scores come from a published set of weights — degree level {34}%, field {26}%, funding {18}%,
        country {12}%, time to prepare {10}% — not from a trained model. Every point above is
        attributable to one of the reasons shown, and the ranking is a starting point, not a judgement
        about whether you will be accepted.
      </p>
    </div>
  );
}
