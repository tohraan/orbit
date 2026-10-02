"use client";

/* §23 and §83: a personal command centre, not a wall of statistics. Every
 * figure here links into a filtered Explore view, which is §23's test for
 * whether a metric belongs ("use metrics only when they lead to an action").
 *
 * The whole screen is ONE request. /api/feed returns, in a single round trip:
 * the dashboard counts, this browser's saved listings resolved to live
 * records, and a first chunk of twelve discovery cards ordered so that the
 * chunk holds a spread of deadline urgency rather than only the listings
 * closing first (lib/shuffle.ts). Four separate calls is what made a cold
 * visit feel slow — the index is cached server-side, so the cost was almost
 * entirely round trips. */

import Link from "next/link";
import s from "./home.module.css";
import o from "@/components/opportunities/opportunity.module.css";
import { PageHead, Section } from "@/components/layout/AppShell";
import { OpportunityCard } from "@/components/opportunities/OpportunityCard";
import { DeadlineIndicator } from "@/components/opportunities/Indicators";
import { BentoSkeleton, GridSkeleton, RowsSkeleton } from "@/components/feedback/Skeletons";
import { EmptyState, ErrorState } from "@/components/feedback/States";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Icon } from "@/components/ui/Icon";
import { useApi } from "@/lib/useApi";
import { relativeTime, typeLabel } from "@rof/core";
import type { OpportunitySummary, Stats } from "@rof/core";
import { STATUS_LABELS, STATUS_TONE, useProfile, useSaved, useSessionSeed, useTracker } from "@/lib/store";
import { MatchPanel } from "@/components/matching/MatchPanel";
import { api } from "@/lib/api-base";

type Feed = {
  stats: Stats;
  saved: OpportunitySummary[];
  savedMissing: number[];
  items: OpportunitySummary[];
  total: number;
  seed: string;
  origin: "live" | "snapshot";
  freshestAt: string | null;
};

export default function HomePage() {
  const seed = useSessionSeed();
  const { saved, ready: savedReady } = useSaved();
  const { entries } = useTracker();
  const { profile, started } = useProfile();

  /* Held until the stored state has been read: firing without the saved ids
   * would return a feed that then has to be refetched a frame later. */
  const url =
    seed && savedReady
      ? api(
          `/api/feed?seed=${encodeURIComponent(seed)}&limit=12` +
            (saved.length ? `&ids=${saved.slice(0, 60).join(",")}` : ""),
        )
      : null;

  const { data, error, initial, reload } = useApi<Feed>(url, "Your opportunities couldn't be loaded right now.");
  const stats = data?.stats;

  /* The tracker stores ids and statuses. Titles come from whatever the feed
   * already resolved — saved and tracked overlap heavily in practice — and a
   * tracked listing that is not saved falls back to its id rather than
   * costing a second request on the opening screen. */
  const byId = new Map([...(data?.saved ?? []), ...(data?.items ?? [])].map((i) => [i.id, i]));

  return (
    <>
      <PageHead
        eyebrow="Home"
        title="Your opportunity desk"
        description="Everything open to a BITS Pilani Dubai student, with the deadlines that need attention first."
        actions={
          <ButtonLink href="/explore" variant="primary" iconAfter="arrow-right">
            Explore
          </ButtonLink>
        }
      />

      <div className={s.bento}>
        {/* ---- the three figures that lead somewhere ---- */}
        <div className={`${s.box} ${s.wide}`}>
          <div className={s.boxHead}>
            <h2 className={s.boxTitle}>What is open right now</h2>
            {data?.freshestAt ? <span className="t-meta c-muted">Updated {relativeTime(data.freshestAt)}</span> : null}
          </div>

          {error && !data ? (
            <ErrorState
              compact
              title="Couldn't load the figures"
              body={error}
              actions={
                <Button variant="secondary" icon="refresh" onClick={reload}>
                  Try again
                </Button>
              }
            />
          ) : initial || !stats ? (
            <div className={s.metrics} aria-hidden="true">
              {[1, 2, 3].map((i) => (
                <span key={i} className={`skeleton skeleton-stagger-${i}`} style={{ height: 86, borderRadius: 12 }} />
              ))}
            </div>
          ) : (
            <div className={s.metrics}>
              <Link href="/explore" className={s.metric}>
                <span className={s.metricValue}>{stats.total}</span>
                <span className={s.metricLabel}>Open calls</span>
              </Link>
              <Link href="/explore?deadline=d30&sort=deadline" className={`${s.metric} ${s.metricUrgent}`}>
                <span className={s.metricValue}>{stats.closingIn30}</span>
                <span className={s.metricLabel}>Closing within 30 days</span>
              </Link>
              <Link href="/explore?funding=fully_funded" className={`${s.metric} ${s.metricFunding}`}>
                <span className={s.metricValue}>{stats.withAmount}</span>
                <span className={s.metricLabel}>State an amount</span>
              </Link>
            </div>
          )}

          <p className="t-body-sm c-secondary">
            Every listing here links back to the site that published it. Check the eligibility on the source
            page before you spend time on an application — the index records what a page said, not what a
            selection committee will decide.
          </p>

          <div className={s.boxFoot}>
            <ButtonLink href="/explore?deadline=d30&sort=deadline" variant="secondary" iconAfter="arrow-right">
              See what closes soonest
            </ButtonLink>
          </div>
        </div>

        {/* ---- deadline spread ---- */}
        <div className={`${s.box} ${s.narrow}`}>
          <div className={s.boxHead}>
            <h2 className={s.boxTitle}>Deadline spread</h2>
            <Link href="/deadlines" className="t-meta c-muted">
              All deadlines
            </Link>
          </div>

          {initial || !stats ? (
            <BentoSkeleton lines={4} />
          ) : (
            <>
              {(
                [
                  ["Next 7 days", stats.closingIn7, "/explore?deadline=d7"],
                  ["Next 30 days", stats.closingIn30, "/explore?deadline=d30"],
                  ["Has a fixed date", stats.withDeadline, "/explore?deadline=dated"],
                  ["Rolling or undated", stats.rolling, "/explore?deadline=rolling"],
                ] as const
              ).map(([label, count, href]) => (
                <Link href={href} key={label} className={s.band}>
                  <span className={s.bandLabel}>{label}</span>
                  <span className={s.bandTrack}>
                    <span
                      className={s.bandFill}
                      style={{ width: `${Math.max(2, Math.round((count / Math.max(1, stats.total)) * 100))}%` }}
                    />
                  </span>
                  <span className={s.bandCount}>{count}</span>
                </Link>
              ))}
              <p className="t-micro c-muted">
                {stats.withDeadline} of {stats.total} listings published a date. The rest are rolling, or the
                source page did not state one.
              </p>
            </>
          )}
        </div>

        {/* ---- saved ---- */}
        <div className={`${s.box} ${s.half}`}>
          <div className={s.boxHead}>
            <h2 className={s.boxTitle}>Saved</h2>
            {saved.length ? (
              <Link href="/saved" className="t-meta c-muted">
                All {saved.length}
              </Link>
            ) : null}
          </div>

          {!savedReady || (initial && saved.length > 0) ? (
            <RowsSkeleton count={3} />
          ) : saved.length === 0 ? (
            /* §46, verbatim. */
            <EmptyState
              compact
              icon="bookmark"
              title="Nothing saved yet"
              body="Save opportunities while browsing so you can return to them later."
              actions={
                <ButtonLink href="/explore" variant="secondary">
                  Explore opportunities
                </ButtonLink>
              }
            />
          ) : (
            <>
              <div className={s.rows}>
                {(data?.saved ?? []).slice(0, 4).map((item) => (
                  <Link href={`/opportunity/${item.id}`} key={item.id} className={s.row}>
                    <span className={s.rowBody}>
                      <span className={`${s.rowTitle} clamp-1`}>{item.title}</span>
                      <span className={s.rowMeta}>
                        {typeLabel(item.type)} &middot; {item.sourceName}
                      </span>
                    </span>
                    <span className={s.rowTail}>
                      <DeadlineIndicator item={item} />
                    </span>
                  </Link>
                ))}
              </div>
              {data?.savedMissing?.length ? (
                <p className="t-micro c-muted">
                  {data.savedMissing.length} saved {data.savedMissing.length === 1 ? "listing has" : "listings have"}{" "}
                  left the index — most likely closed.
                </p>
              ) : null}
            </>
          )}
        </div>

        {/* ---- applications ---- */}
        <div className={`${s.box} ${s.half}`}>
          <div className={s.boxHead}>
            <h2 className={s.boxTitle}>Applications</h2>
            {entries.length ? (
              <Link href="/applications" className="t-meta c-muted">
                All {entries.length}
              </Link>
            ) : null}
          </div>

          {entries.length === 0 ? (
            <EmptyState
              compact
              icon="applications"
              title="No applications tracked yet"
              body="Set a status on any opportunity and it will appear here with its deadline."
              actions={
                <ButtonLink href="/explore" variant="secondary">
                  Explore opportunities
                </ButtonLink>
              }
            />
          ) : (
            <div className={s.rows}>
              {entries.slice(0, 4).map((e) => {
                const item = byId.get(e.id);
                return (
                  <Link href={`/opportunity/${e.id}`} key={e.id} className={s.row}>
                    <span className={s.rowBody}>
                      <span className={`${s.rowTitle} clamp-1`}>{item?.title ?? `Opportunity #${e.id}`}</span>
                      <span className={s.rowMeta}>Status changed {relativeTime(e.updatedAt)}</span>
                    </span>
                    <span className={s.rowTail}>
                      <Chip tone={STATUS_TONE[e.status]}>{STATUS_LABELS[e.status]}</Chip>
                    </span>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Ranked against the student's own profile, from the chunk already on
          screen — no extra request, and the scorer is pure (packages/core). */}
      <Section title="For you">
        <MatchPanel items={data?.items ?? []} profile={profile} started={started} />
      </Section>

      {/* The first discovery chunk, from the same request. Twelve cards with a
          spread of urgency rather than twelve that all close this week. */}
      <Section
        title="Worth a look"
        aside={
          <Link href="/explore" className="t-body-sm c-secondary">
            Explore all <Icon name="arrow-right" size={14} style={{ display: "inline-block", verticalAlign: "-2px" }} />
          </Link>
        }
      >
        {error && !data ? (
          <ErrorState
            body={error}
            actions={
              <Button variant="secondary" icon="refresh" onClick={reload}>
                Try again
              </Button>
            }
          />
        ) : initial ? (
          <div className={o.grid}>
            <GridSkeleton count={6} />
          </div>
        ) : !data?.items.length ? (
          <EmptyState
            icon="inbox"
            title="Nothing left to suggest"
            body="Everything currently in the index is already on your saved list."
            actions={
              <ButtonLink href="/saved" variant="secondary">
                Go to Saved
              </ButtonLink>
            }
          />
        ) : (
          <>
            <p className="t-meta c-muted" style={{ marginBottom: "var(--s-4)" }}>
              A mixed batch: some closing this week, some months away. Reload for a different set.
            </p>
            <div className={o.grid}>
              {data.items.slice(0, 6).map((item) => (
                <OpportunityCard key={item.id} item={item} />
              ))}
            </div>
            <div className={o.pager}>
              <ButtonLink href="/explore" variant="secondary" iconAfter="arrow-right">
                Browse all {data.total} opportunities
              </ButtonLink>
            </div>
          </>
        )}
      </Section>
    </>
  );
}
