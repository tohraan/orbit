"use client";

/* §51 section order, which does not vary by opportunity:
 *   1 Overview  2 Eligibility  3 Requirements  4 Funding
 *   5 Important dates  6 Application information  7 Source / official link
 *
 * §105 governs the whole page: where the scrape found nothing, the section
 * says so plainly rather than being silently omitted — a student needs to know
 * the difference between "no eligibility criteria" and "we did not capture
 * them, read the source page". Only 137 of 431 listings carry eligibility
 * text, so this is the common case, not the edge one. */

import Link from "next/link";
import s from "../detail.module.css";
import { DeadlineIndicator, FundingIndicator, LevelChips, LocationIndicator } from "@/components/opportunities/Indicators";
import { Money } from "@/components/opportunities/Money";
import { CompareButton, SaveButton, TrackControl } from "@/components/opportunities/Actions";
import { Button, ButtonLink, ExternalButton } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { ScanFacts, ScanText } from "@/components/opportunities/ScanText";
import { ErrorState } from "@/components/feedback/States";
import { BentoSkeleton } from "@/components/feedback/Skeletons";
import { useApi } from "@/lib/useApi";
import { countryLabel, deadlineState, relativeTime, titleCase, typeLabel } from "@rof/core";
import type { OpportunityDetail } from "@rof/core";
import { api } from "@/lib/api-base";

type Payload = {
  item: OpportunityDetail;
  related: { id: number; title: string; deadline: string | null; type: string | null }[];
  origin: "live" | "snapshot";
};

export function DetailScreen({ id }: { id: string }) {
  const { data, error, initial, reload } = useApi<Payload>(
    api(`/api/opportunities/${encodeURIComponent(id)}`),
    "This opportunity couldn't be loaded right now.",
  );

  if (error && !data) {
    return (
      <ErrorState
        title="Couldn't load this opportunity"
        body={error}
        actions={
          <>
            <Button variant="secondary" icon="refresh" onClick={reload}>
              Try again
            </Button>
            <ButtonLink href="/explore" variant="ghost">
              Back to Explore
            </ButtonLink>
          </>
        }
      />
    );
  }

  if (initial || !data) return <DetailSkeleton />;

  const o = data.item;
  const dl = deadlineState(o);
  /* §50: the external CTA is the dominant action. The apply link is preferred
   * over the listing URL when the scrape found one — it saves a hop. */
  const applyHref = o.applyLink ?? o.url;

  return (
    <>
      {/* §48: the breadcrumb is the header's (components/layout/Header.tsx);
          the hero carries the title, so there is no second page heading. */}
      <div className={s.layout}>
        {/* ---------------------------------------------------------- hero */}
        <div className={s.hero}>
          <div className={s.heroTop}>
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-2)", minWidth: 0 }}>
              <span className="eyebrow">{typeLabel(o.type)}</span>
              <h1 className={s.heroTitle}>{o.title}</h1>
              <p className={s.heroOrg}>{o.sourceName}</p>
            </div>
            <span style={{ display: "flex", alignItems: "center", gap: "var(--s-2)" }}>
              {o.sourceSlug === "college_desk" ? (
                <Chip tone="college" icon="shield">
                  Added by college
                </Chip>
              ) : null}
              <SaveButton id={o.id} title={o.title} />
            </span>
          </div>

          {o.summary ? <p className={s.heroSummary}>{o.summary}</p> : null}

          <div className={s.heroMeta}>
            <DeadlineIndicator item={o} />
            <FundingIndicator funding={o.funding} />
            <LocationIndicator country={o.country} />
            <LevelChips levels={o.levels} max={4} />
            {o.duration ? <Chip tone="quiet" icon="clock">{o.duration}</Chip> : null}
          </div>

          <div className={s.heroActions}>
            {/* One height across the whole row. The primary action is
                dominant through colour (§50), not through being taller than
                the controls beside it. */}
            <ExternalButton href={applyHref} variant="primary">
              {o.applyLink ? "Apply on the official page" : "Open the official listing"}
            </ExternalButton>
            <SaveButton id={o.id} title={o.title} labelled size="md" />
            <CompareButton id={o.id} title={o.title} size="md" />
            <TrackControl id={o.id} size="md" />
          </div>
        </div>

        {/* ------------------------------------------------------- content */}
        <div className={s.stack}>
          <section className={s.panel}>
            <h2 className={s.panelTitle}>Overview</h2>
            {o.summary ? (
              <ScanText text={o.summary} label="the overview" />
            ) : (
              <p className={s.absent}>
                The source page did not publish a summary. Open the official listing for the full description.
              </p>
            )}
          </section>

          <section className={s.panel}>
            <h2 className={s.panelTitle}>Eligibility</h2>
            {o.eligibility ? (
              <>
                {/* The numbers a student checks first, lifted out of the prose
                    below rather than restated — §105, nothing invented. */}
                <ScanFacts
                  items={[
                    { label: "Level", value: o.levels.length ? o.levels.map((l) => titleCase(l)).join(", ") : null },
                    { label: "Country", value: o.country ? countryLabel(o.country) : null },
                    { label: "Duration", value: o.duration },
                  ]}
                />
                <ScanText text={o.eligibility} label="the eligibility criteria" />
              </>
            ) : (
              <p className={s.absent}>
                Eligibility criteria were not captured for this listing. They are on the source page, and they
                decide whether an application is worth making &mdash; check them there before you start.
              </p>
            )}
          </section>

          <section className={s.panel}>
            <h2 className={s.panelTitle}>What it covers</h2>
            {o.benefits ? (
              <ScanText text={o.benefits} label="what it covers" />
            ) : (
              <p className={s.absent}>No breakdown of what this covers was published.</p>
            )}
            {o.amounts.length ? (
              <div className={s.amounts}>
                {o.amounts.map((m, i) => (
                  <span className={s.amountRow} key={i}>
                    <span className="t-meta c-muted">{m.raw ? `As published: ${m.raw}` : `Amount ${i + 1}`}</span>
                    <Money value={m} />
                  </span>
                ))}
              </div>
            ) : null}
          </section>

          <section className={s.panel}>
            <h2 className={s.panelTitle}>How to apply</h2>
            {o.howToApply ? (
              <ScanText text={o.howToApply} label="the application steps" />
            ) : (
              <p className={s.absent}>
                The application process was not captured. It is described on the official page.
              </p>
            )}
            {o.documents ? (
              <>
                <h3 className="t-card-title" style={{ marginTop: "var(--s-2)" }}>
                  Documents needed
                </h3>
                <ScanText text={o.documents} label="the documents" />
              </>
            ) : null}
            <div style={{ paddingTop: "var(--s-2)" }}>
              <ExternalButton href={applyHref} variant="secondary">
                {o.applyLink ? "Go to the application" : "Open the listing"}
              </ExternalButton>
            </div>
          </section>

          {data.related.length ? (
            <section className={s.panel}>
              <h2 className={s.panelTitle}>Also from {o.sourceName}</h2>
              <div className={s.related}>
                {data.related.map((r) => (
                  <Link href={`/opportunity/${r.id}`} key={r.id} className={s.relatedRow}>
                    <span className="t-body-sm clamp-1">{r.title}</span>
                    <DeadlineIndicator item={{ deadline: r.deadline, deadlineKind: null }} />
                  </Link>
                ))}
              </div>
            </section>
          ) : null}
        </div>

        {/* ------------------------------------------- key information rail */}
        <aside className={s.sticky}>
          <div className={s.panel}>
            <h2 className={s.panelTitle}>Key information</h2>
            <dl className={s.facts}>
              <Fact k="Deadline" v={dl.full ?? (dl.tone === "rolling" ? "Rolling — no fixed date" : null)} />
              <Fact
                k="Time left"
                v={dl.days == null ? null : dl.days < 0 ? "Closed" : `${dl.days} day${dl.days === 1 ? "" : "s"}`}
              />
              <Fact k="Category" v={titleCase(o.type)} />
              <Fact k="Degree level" v={o.levels.length ? o.levels.map((l) => titleCase(l)).join(", ") : null} />
              <Fact k="Country" v={o.country ? countryLabel(o.country) : null} unknownText="Location not specified" />
              <Fact k="Duration" v={o.duration} />
              <Fact k="Amount" v={o.amount ? <Money value={o.amount} /> : null} unknownText="Not stated" />
              <Fact k="Deadline type" v={titleCase(o.deadlineKind === "unknown" ? null : o.deadlineKind)} />
            </dl>
            {o.deadlineNote ? <p className="t-meta c-muted">{o.deadlineNote}</p> : null}
          </div>

          {/* §73 and §72: where this came from, and when. */}
          <div className={s.source}>
            <h2 className="t-card-title">Source</h2>
            <dl className={s.facts}>
              <Fact k="Published by" v={o.sourceName} />
              <Fact k="Domain" v={o.host} />
              <Fact k="Posted" v={o.postedAt ? relativeTime(o.postedAt) : null} unknownText="Not stated" />
              <Fact k="Indexed" v={o.indexedAt ? relativeTime(o.indexedAt) : null} />
            </dl>
            <p className="t-meta c-muted">
              This page reproduces what {o.host ?? o.sourceName} published. The official listing is
              authoritative on every detail, including the deadline.
            </p>
            <ExternalButton href={o.url} variant="secondary" block>
              Official source
            </ExternalButton>
          </div>
        </aside>
      </div>
    </>
  );
}

/* §105: an unknown value is explicit and quiet, never a blank cell. */
function Fact({ k, v, unknownText = "Not specified" }: { k: string; v: React.ReactNode; unknownText?: string }) {
  const empty = v == null || v === "";
  return (
    <div className={s.fact}>
      <dt className={s.factKey}>{k}</dt>
      <dd className={[s.factValue, empty ? s.factUnknown : null].filter(Boolean).join(" ")}>
        {empty ? unknownText : v}
      </dd>
    </div>
  );
}

/* §103: the skeleton matches the real page's geometry — hero, four sections,
 * and the rail — so nothing jumps when the data lands. */
function DetailSkeleton() {
  return (
    <div className={s.layout}>
      <div className={s.hero} aria-hidden="true">
        <span className="skeleton skeleton-line" style={{ width: 90 }} />
        <span className="skeleton" style={{ height: 30, width: "70%", borderRadius: 8 }} />
        <span className="skeleton skeleton-line" style={{ width: "32%" }} />
        <span className="skeleton skeleton-line skeleton-stagger-2" style={{ width: "92%" }} />
        <span className="skeleton skeleton-line skeleton-stagger-3" style={{ width: "76%" }} />
        <div style={{ display: "flex", gap: 8 }}>
          {[90, 110, 80].map((w, i) => (
            <span key={i} className="skeleton" style={{ width: w, height: 22, borderRadius: 8 }} />
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, paddingTop: 12, borderTop: "1px solid var(--color-border)" }}>
          {/* Matches the real controls' height exactly; reserving 48 for a
              40px button made the page jump when the data arrived. */}
          <span className="skeleton" style={{ width: 200, height: "var(--control-md)", borderRadius: 10 }} />
          <span className="skeleton" style={{ width: 92, height: "var(--control-md)", borderRadius: 10 }} />
        </div>
      </div>
      <div className={s.stack}>
        <BentoSkeleton lines={4} />
        <BentoSkeleton lines={5} />
        <BentoSkeleton lines={3} />
      </div>
      <aside className={s.sticky}>
        <BentoSkeleton lines={6} />
        <BentoSkeleton lines={4} />
      </aside>
    </div>
  );
}
