"use client";

/* The one canonical card (§115): Explore, Home, Saved and search all render
 * this, and only the surrounding context changes.
 *
 * Laid out so a student can read it in a couple of seconds, top to bottom:
 *
 *   where it came from  ->  what it is  ->  who it is for
 *   ->  the three numbers that decide it  ->  what to do about it
 *
 * The metrics band is pinned with margin-top:auto, so funding, deadline and
 * fit land on the same line on every card in a row regardless of how long the
 * title ran or how much the source published.
 */

import Link from "next/link";
import s from "./card.module.css";
import { Chip } from "../ui/Chip";
import { Button, ButtonLink } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { Money } from "./Money";
import { CompareButton, SaveButton } from "./Actions";
import { useToast } from "../feedback/Toast";
import {
  CONFIDENCE_FLOOR,
  countryLabel,
  deadlineState,
  levelLabel,
  relativeTime,
  score,
  typeLabel,
} from "@rof/core";
import { FUNDING_LABELS, fundingBucket } from "@rof/core";
import type { OpportunitySummary } from "@rof/core";
import { useCompare, useProfile } from "@/lib/data";
import { downloadIcs } from "@/lib/ics";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function longDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  return `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}, ${m[1]}`;
}

export function OpportunityCard({ item }: { item: OpportunitySummary }) {
  const { isCompared } = useCompare();
  const { profile, started } = useProfile();
  const toast = useToast();

  const compared = isCompared(item.id);
  const dl = deadlineState(item);
  const bucket = fundingBucket(item.funding);
  const fit = started ? score(item, profile) : null;

  return (
    <article className={[s.card, compared ? s.cardCompared : null].filter(Boolean).join(" ")}>
      <Link href={`/opportunity/${item.id}`} className={s.cardLink} aria-label={item.title} tabIndex={-1} />

      {/* where it came from */}
      <div className={s.top}>
        <span className={s.origin}>
          <span className={s.domain} title={item.sourceName}>
            <Icon name="globe" size={14} />
            {item.host ?? item.sourceName}
          </span>
          {item.postedAt ? <span className={s.age}>· {relativeTime(item.postedAt)}</span> : null}
        </span>
        <span className={s.topRight}>
          {/* Social proof, and only when it is real. The server withholds any
              count below MIN_VISIBLE, so this renders nothing rather than
              "1 interested" — which on one campus is close to naming them, and
              reads as nobody caring either way. */}
          {item.interest ? (
            <span className={s.interest} title={`${item.interest} students have saved or are tracking this`}>
              <Icon name="user" size={12} />
              {item.interest}
            </span>
          ) : null}
          <SaveButton id={item.id} title={item.title} />
        </span>
      </div>

      {/* what it is */}
      <div className={s.titleBlock}>
        <h3 className={`${s.title} clamp-2`}>
          <Link href={`/opportunity/${item.id}`}>{item.title}</Link>
        </h3>
        <p className={`${s.org} clamp-1`}>
          {item.sourceName}
          {item.country ? ` · ${countryLabel(item.country)}` : ""}
        </p>
      </div>

      {/* who it is for */}
      <div className={s.tags}>
        <Chip tone="quiet">{typeLabel(item.type)}</Chip>
        {item.levels.slice(0, 1).map((l) => (
          <Chip key={l} tone="quiet">
            {levelLabel(l)}
          </Chip>
        ))}
        {bucket !== "unspecified" ? (
          <Chip tone={bucket === "fully_funded" ? "funding" : "neutral"} icon="coins">
            {FUNDING_LABELS[bucket]}
          </Chip>
        ) : null}
      </div>

      {/* the three numbers */}
      <div className={s.metrics}>
        <span className={s.metric}>
          <span className={s.metricLabel}>Funding</span>
          {item.amount ? (
            <Money value={item.amount} />
          ) : (
            <span className={s.metricNone}>Not stated</span>
          )}
        </span>

        <span className={s.metric}>
          <span className={s.metricLabel}>Deadline</span>
          {item.deadline ? (
            <>
              <span className={s.metricValue}>{longDate(item.deadline)}</span>
              <span>
                <Chip tone={dl.tone === "urgent" ? "urgent" : dl.tone === "soon" ? "soon" : "quiet"}>{dl.label}</Chip>
              </span>
            </>
          ) : (
            <span className={s.metricNone}>{dl.tone === "rolling" ? "Rolling" : "Not stated"}</span>
          )}
        </span>

        {fit ? (
          <span className={s.metric}>
            <span className={s.metricLabel}>Fit</span>
            <FitRing value={fit.score} low={fit.confidence < CONFIDENCE_FLOOR} />
          </span>
        ) : null}
      </div>

      {/* what to do about it */}
      <div className={s.actions}>
        <CompareButton id={item.id} title={item.title} />
        <span className={s.actionsRight}>
          {item.deadline ? (
            <Button
              variant="ghost"
              size="sm"
              icon="calendar"
              aria-label={`Add the ${item.title} deadline to your calendar`}
              onClick={() => {
                downloadIcs(item);
                toast("Calendar file downloaded");
              }}
            >
              .ics
            </Button>
          ) : null}
          <ButtonLink href={`/opportunity/${item.id}`} variant="secondary" size="sm" iconAfter="arrow-right">
            View
          </ButtonLink>
        </span>
      </div>
    </article>
  );
}

/* The fit ring. Drained of colour below the confidence floor, because a score
 * we are not confident in must not look like one we are. */
function FitRing({ value, low }: { value: number; low: boolean }) {
  const r = 18;
  const c = 2 * Math.PI * r;
  return (
    <span className={[s.ring, low ? s.ringLow : null].filter(Boolean).join(" ")}>
      <svg className={s.ringSvg} width="44" height="44" viewBox="0 0 44 44" aria-hidden="true">
        <circle className={s.ringTrack} cx="22" cy="22" r={r} fill="none" strokeWidth="4" />
        <circle
          className={s.ringFill}
          cx="22"
          cy="22"
          r={r}
          fill="none"
          strokeWidth="4"
          strokeDasharray={`${(value / 100) * c} ${c}`}
        />
      </svg>
      <span className={s.ringLabel}>{value}</span>
      <span className="sr-only">{low ? `Fit ${value} of 100, low confidence` : `Fit ${value} of 100`}</span>
    </span>
  );
}
