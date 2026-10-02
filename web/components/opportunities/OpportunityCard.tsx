"use client";

/* The one canonical card (§115): Explore, Home, Saved and search results all
 * render this, and only the surrounding context changes. §79 forbids a
 * different card layout per category.
 *
 * Content is capped at what §62 allows — one category, one title, one
 * organisation, one short description, two to four metadata fields, one
 * deadline, two or three actions. Everything else is on the detail page. */

import Link from "next/link";
import s from "./opportunity.module.css";
import { Provenance } from "./Indicators";
import { CardDecide, CardFacts } from "./CardFacts";
import { CompareButton, SaveButton } from "./Actions";
import { ButtonLink } from "../ui/Button";
import { Chip } from "../ui/Chip";
import { deadlineState, typeLabel } from "@rof/core";
import type { OpportunitySummary } from "@rof/core";
import { useCompare } from "@/lib/data";

export function OpportunityCard({ item }: { item: OpportunitySummary }) {
  const { isCompared } = useCompare();
  const compared = isCompared(item.id);
  const expired = deadlineState(item).tone === "expired";

  return (
    <article
      className={[s.card, compared ? s.cardCompared : null, expired ? s.cardExpired : null]
        .filter(Boolean)
        .join(" ")}
    >
      {/* The body is the link target; the controls sit above it in z-order. */}
      <Link href={`/opportunity/${item.id}`} className={s.cardLink} aria-label={item.title} tabIndex={-1} />

      <div className={s.topRow}>
        <span className={s.category}>{typeLabel(item.type)}</span>
        <span style={{ display: "flex", alignItems: "center", gap: "var(--s-2)" }}>
          {/* db/014: a listing staff entered by hand. Worth saying on the card,
              because unlike every scraped row a person at the institution
              checked this one before it appeared. */}
          {item.sourceSlug === "college_desk" ? (
            <Chip tone="college" icon="shield">
              Added by college
            </Chip>
          ) : null}
          <SaveButton id={item.id} title={item.title} />
        </span>
      </div>

      <div className={s.titleBlock}>
        <h3 className={`${s.title} clamp-2`}>
          <Link href={`/opportunity/${item.id}`}>{item.title}</Link>
        </h3>
        <p className={`${s.org} clamp-1`}>{item.sourceName}</p>
      </div>

      <p className={`${s.summary} clamp-3`}>
        {item.summary ?? "No summary was published for this opportunity."}
      </p>

      <CardFacts item={item} />

      <div className={s.foot}>
        <CardDecide item={item} />

        <Provenance item={item} />

        <div className={s.actions}>
          <CompareButton id={item.id} title={item.title} />
          <ButtonLink href={`/opportunity/${item.id}`} variant="ghost" size="sm" iconAfter="arrow-right">
            View
          </ButtonLink>
        </div>
      </div>
    </article>
  );
}
