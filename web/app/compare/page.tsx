"use client";

/* §39, §40, §87.
 *
 * The constraint that shapes this screen is §87: "No ranking language. No
 * winner indicators." So no cell is highlighted, no figure is called higher or
 * better, and the two columns are styled identically. §39 adds the other half:
 * compare only information that is common and meaningful across both — a row
 * where neither listing published anything is dropped, and a row where one did
 * says so for the other rather than leaving a gap (§105).
 *
 * §40: below 768px the table becomes stacked attribute groups, with both
 * opportunities named in every group. */

import Link from "next/link";
import c from "@/components/comparison/comparison.module.css";
import { PageHead } from "@/components/layout/AppShell";
import { Money } from "@/components/opportunities/Money";
import { Button, ButtonLink, ExternalButton } from "@/components/ui/Button";
import { SaveButton } from "@/components/opportunities/Actions";
import { EmptyState, ErrorState } from "@/components/feedback/States";
import { BentoSkeleton } from "@/components/feedback/Skeletons";
import { useItemsByIds } from "@/lib/useApi";
import { FUNDING_LABELS, countryLabel, deadlineState, fundingBucket, relativeTime, titleCase, typeLabel } from "@rof/core";
import type { OpportunityDetail, OpportunitySummary } from "@rof/core";
import { MAX_COMPARE, useCompare } from "@/lib/store";

type Row = { key: string; label: string; render: (o: OpportunitySummary) => React.ReactNode; has: (o: OpportunitySummary) => boolean };

/* §39's attribute list, plus provenance — which is meaningful here because the
 * two listings may come from sources of very different authority. */
const ROWS: Row[] = [
  {
    key: "category",
    label: "Category",
    render: (o) => typeLabel(o.type),
    has: (o) => !!o.type,
  },
  {
    key: "country",
    label: "Country",
    render: (o) => countryLabel(o.country),
    has: (o) => !!o.country,
  },
  {
    key: "funding",
    label: "Funding",
    render: (o) => FUNDING_LABELS[fundingBucket(o.funding)],
    has: (o) => fundingBucket(o.funding) !== "unspecified",
  },
  {
    key: "amount",
    label: "Amount",
    render: (o) => <Money value={o.amount} fallback="Not stated" />,
    has: (o) => !!o.amount,
  },
  {
    key: "deadline",
    label: "Deadline",
    render: (o) => {
      const d = deadlineState(o);
      return d.full ? `${d.full} (${d.label})` : d.label;
    },
    has: () => true,
  },
  {
    key: "level",
    label: "Degree level",
    render: (o) => o.levels.map((l) => titleCase(l)).join(", "),
    has: (o) => o.levels.length > 0,
  },
  {
    key: "duration",
    label: "Duration",
    render: (o) => o.duration,
    has: (o) => !!o.duration,
  },
  {
    key: "source",
    label: "Published by",
    render: (o) => `${o.sourceName}${o.host ? ` (${o.host})` : ""}`,
    has: () => true,
  },
  {
    key: "posted",
    label: "Posted",
    render: (o) => (o.postedAt ? relativeTime(o.postedAt) : null),
    has: (o) => !!o.postedAt,
  },
];

export default function ComparePage() {
  const { compare, remove, clear, ready } = useCompare();
  const { items, initial, error, reload } = useItemsByIds<OpportunityDetail>(compare);

  /* §39: only rows that at least one of the two actually published. A table of
   * nine "Not specified" cells compares nothing. */
  const rows = items.length ? ROWS.filter((r) => items.some((o) => r.has(o))) : [];

  return (
    <>
      <PageHead
        eyebrow="Decide"
        title="Compare opportunities"
        description={`Side by side on the attributes both listings published. Up to ${MAX_COMPARE} at a time.`}
        actions={
          compare.length ? (
            <Button variant="ghost" icon="trash" onClick={clear}>
              Clear selection
            </Button>
          ) : null
        }
      />

      {!ready ? (
        <BentoSkeleton lines={6} />
      ) : compare.length === 0 ? (
        <EmptyState
          icon="compare"
          title="Nothing selected to compare"
          body="Press Compare on two opportunities while browsing, and they will appear here side by side."
          actions={
            <ButtonLink href="/explore" variant="primary">
              Explore opportunities
            </ButtonLink>
          }
        />
      ) : error ? (
        <ErrorState
          title="Couldn't load the comparison"
          body="The two listings could not be read from the index."
          actions={
            <Button variant="secondary" icon="refresh" onClick={reload}>
              Try again
            </Button>
          }
        />
      ) : initial ? (
        <BentoSkeleton lines={8} />
      ) : (
        <>
          {/* §87's "opportunity identities": each column is named, with its own
              actions, before any attribute is compared. */}
          <div className={c.slots}>
            {items.map((o) => (
              <div className={c.slot} key={o.id}>
                <span className="eyebrow">{typeLabel(o.type)}</span>
                <Link href={`/opportunity/${o.id}`} className="t-card-title clamp-2">
                  {o.title}
                </Link>
                <p className="t-meta c-muted">{o.sourceName}</p>
                <div className={c.colActions}>
                  <ExternalButton href={o.applyLink ?? o.url} variant="secondary" size="sm">
                    Official page
                  </ExternalButton>
                  <SaveButton id={o.id} title={o.title} labelled />
                  <Button variant="ghost" size="sm" icon="close" onClick={() => remove(o.id)}>
                    Remove
                  </Button>
                </div>
              </div>
            ))}
            {items.length < MAX_COMPARE ? (
              <Link href="/explore" className={c.slotEmpty}>
                <span className="t-body-sm">Add a second opportunity</span>
                <span className="t-micro">Press Compare on any card in Explore</span>
              </Link>
            ) : null}
          </div>

          {items.length < 2 ? (
            <p className={c.note}>
              Pick one more opportunity to see the attribute comparison. One listing on its own is just its
              detail page.
            </p>
          ) : (
            <>
              {/* ------------------------------------------- desktop table */}
              <div className={c.desktopOnly} style={{ marginTop: "var(--s-6)" }}>
                <div className="t-section" style={{ marginBottom: "var(--s-4)" }}>
                  Common attributes
                </div>
                <div style={{ overflowX: "auto", border: "1px solid var(--color-border)", borderRadius: "var(--radius-lg)", background: "var(--color-surface)" }}>
                  <table className={c.table}>
                    <caption className="sr-only">
                      Attribute comparison. Neither column is ranked above the other.
                    </caption>
                    <thead>
                      <tr>
                        <th scope="col" className={c.attr}>
                          Attribute
                        </th>
                        {items.map((o) => (
                          <th scope="col" className={c.colHead} key={o.id}>
                            <span className={`${c.colTitle} clamp-2`}>{o.title}</span>
                            <span className={c.colOrg}>{o.sourceName}</span>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr key={r.key}>
                          <th scope="row" className={c.attr}>
                            {r.label}
                          </th>
                          {items.map((o) => (
                            <td key={o.id} className={r.has(o) ? undefined : c.unknown}>
                              {r.has(o) ? r.render(o) : "Not specified"}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* --------------------------------------------- mobile stack */}
              <div className={c.mobileOnly} style={{ marginTop: "var(--s-6)" }}>
                {rows.map((r) => (
                  <div className={c.group} key={r.key}>
                    <p className={c.groupLabel}>{r.label}</p>
                    {items.map((o) => (
                      <div className={c.groupPair} key={o.id}>
                        <span className={`${c.groupWho} clamp-1`}>{o.title}</span>
                        <span className={[c.groupValue, r.has(o) ? null : c.unknown].filter(Boolean).join(" ")}>
                          {r.has(o) ? r.render(o) : "Not specified"}
                        </span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>

              <p className={c.note}>
                Amounts are compared in whichever currency the switch is set to. Dirham figures use the
                US dollar peg of 3.6725, which is exact, and indicative mid-market rates for every other
                currency — so a euro and a pound figure are comparable in direction, not to the dirham.
              </p>
            </>
          )}
        </>
      )}
    </>
  );
}
