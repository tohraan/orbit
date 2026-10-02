"use client";

/* §54 and §88: upcoming deadlines, grouped by date, highly scannable — now
 * with the horizontal timeline band above the list.
 *
 * One range control drives BOTH. The band and the list are rendered from the
 * same single response, so they cannot disagree about what falls inside the
 * window: whatever you can see plotted is exactly what is listed underneath.
 * That is also why this screen fetches up to 120 rows in one request instead
 * of paging — the whole dated index is 111 listings.
 *
 * Below 768px the range is forced to 30 days. A six-month axis on a 390px
 * screen is about 2px per day, which is a line, not a timeline.
 *
 * Listings whose deadline has passed are not here and are not anywhere else
 * either: packages/server/src/source.ts drops them from the index.
 */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import r from "../rows.module.css";
import { PageHead } from "@/components/layout/AppShell";
import { Timeline, type TimelineRange } from "@/components/timeline/Timeline";
import { FundingIndicator } from "@/components/opportunities/Indicators";
import { SaveButton } from "@/components/opportunities/Actions";
import { RowsSkeleton } from "@/components/feedback/Skeletons";
import { EmptyState, ErrorState } from "@/components/feedback/States";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { useApi } from "@/lib/useApi";
import { api } from "@/lib/api-base";
import { countryLabel, daysUntil, typeLabel } from "@rof/core";
import type { ListResponse, OpportunitySummary } from "@rof/core";
import { STATUS_LABELS, STATUS_TONE, useSaved, useTracker } from "@/lib/data";

const RANGES: { value: TimelineRange; label: string; window: string; wide?: boolean }[] = [
  { value: 30, label: "30 days", window: "d30" },
  { value: 90, label: "90 days", window: "d90", wide: true },
  { value: 180, label: "6 months", window: "d180", wide: true },
];

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export default function DeadlinesPage() {
  const [range, setRange] = useState<TimelineRange>(30);
  const { saved } = useSaved();
  const { entries, statusOf } = useTracker();

  /* The wide ranges are hidden by CSS below 768px, but hiding a button does
   * not change the state behind it — so the value is forced back as well,
   * otherwise a phone rotated from landscape keeps a 180-day axis it cannot
   * render. matchMedia rather than a resize listener: it fires only on the
   * crossing, not on every pixel. */
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const apply = () => {
      if (mq.matches) setRange(30);
    };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  const window_ = RANGES.find((x) => x.value === range)!.window;
  const { data, initial, loading, error, reload } = useApi<ListResponse>(
    api(`/api/opportunities?deadline=${window_}&sort=deadline&pageSize=120`),
    "The deadline list couldn't be loaded right now.",
  );

  const items = data?.items ?? [];

  /* Saved and tracked are the listings that get named on the axis. Both are
   * per-browser, so this is empty on a first visit and the band is simply all
   * neutral dots — which is a legitimate state, not an empty one. */
  const mineIds = useMemo(
    () => new Set<number>([...saved, ...entries.map((e) => e.id)]),
    [saved, entries],
  );

  /* Grouped by calendar month, built from the date digits rather than a Date
   * object — see the note in packages/core/src/format.ts about why. */
  const groups = useMemo(() => {
    const out = new Map<string, { label: string; items: OpportunitySummary[] }>();
    for (const item of items) {
      if (!item.deadline) continue;
      const [y, m] = item.deadline.split("-");
      const key = `${y}-${m}`;
      if (!out.has(key)) out.set(key, { label: `${MONTHS[Number(m) - 1]} ${y}`, items: [] });
      out.get(key)!.items.push(item);
    }
    return [...out.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([key, g]) => ({ key, ...g }));
  }, [items]);

  const rangeControl = RANGES.map((opt) => (
    <Button
      key={opt.value}
      variant={range === opt.value ? "primary" : "secondary"}
      size="sm"
      aria-pressed={range === opt.value}
      className={opt.wide ? "rangeWide" : undefined}
      onClick={() => setRange(opt.value)}
    >
      {opt.label}
    </Button>
  ));

  return (
    <>
      <PageHead
        eyebrow="Plan"
        title="Upcoming deadlines"
        description="Every listing that published a closing date, soonest first. Anything already closed has been removed from the index."
        actions={
          <ButtonLink href="/explore" variant="secondary" iconAfter="arrow-right">
            Explore
          </ButtonLink>
        }
      />

      <Timeline
        items={items}
        range={range}
        mineIds={mineIds}
        loading={initial}
        rangeControl={rangeControl}
        count={items.length}
      />

      {error && !data ? (
        <ErrorState
          title="Couldn't load the deadlines"
          body={error}
          actions={
            <Button variant="secondary" icon="refresh" onClick={reload}>
              Try again
            </Button>
          }
        />
      ) : initial ? (
        <RowsSkeleton count={8} />
      ) : groups.length === 0 ? (
        <EmptyState
          icon="calendar"
          title="Nothing closes in this window"
          body="Widen the window, or look at the listings with no fixed date — many of those accept applications all year."
          actions={
            <>
              {range !== 180 ? (
                <Button variant="secondary" onClick={() => setRange(180)}>
                  Try the next 6 months
                </Button>
              ) : null}
              <ButtonLink href="/explore?deadline=rolling" variant="ghost">
                Rolling listings
              </ButtonLink>
            </>
          }
        />
      ) : (
        <div style={loading ? { opacity: 0.55, transition: "opacity var(--motion) var(--ease)" } : undefined}>
          {groups.map((g) => (
            <section key={g.key}>
              <div className={r.dGroupHead}>
                <h2 className={r.groupTitle}>{g.label}</h2>
                <span className={r.groupCount}>
                  {g.items.length} {g.items.length === 1 ? "deadline" : "deadlines"}
                </span>
              </div>
              <div>
                {g.items.map((item) => {
                  const days = daysUntil(item.deadline) ?? 0;
                  const tone = days <= 7 ? "urgent" : days <= 30 ? "soon" : "later";
                  const st = statusOf(item.id);
                  const day = item.deadline!.slice(8);
                  const mon = MONTHS[Number(item.deadline!.slice(5, 7)) - 1]?.slice(0, 3);
                  return (
                    <div className={r.dRow} key={item.id} id={`deadline-${item.id}`}>
                      {/* The date block carries the urgency as a solid fill, so
                          the left edge of the list reads as a column of urgency
                          before a single title is read. */}
                      <Link
                        href={`/opportunity/${item.id}`}
                        className={[
                          r.dDate,
                          tone === "urgent" ? r.dDateUrgent : tone === "soon" ? r.dDateSoon : null,
                        ].filter(Boolean).join(" ")}
                        aria-label={`${item.title}, closes ${day} ${mon}`}
                      >
                        <span className={r.dDay}>{day}</span>
                        <span className={r.dMon}>{mon}</span>
                      </Link>

                      <Link href={`/opportunity/${item.id}`} className={r.dBody}>
                        <span className={`${r.dTitle} clamp-1`}>{item.title}</span>
                        <span className={r.dMeta}>
                          <span>{typeLabel(item.type)}</span>
                          <span className={r.dDot}>·</span>
                          <span>{item.sourceName}</span>
                          {item.country ? (
                            <>
                              <span className={r.dDot}>·</span>
                              <span>{countryLabel(item.country)}</span>
                            </>
                          ) : null}
                        </span>
                      </Link>

                      <span className={r.dTail}>
                        <span className={[r.dLeft, tone === "urgent" ? r.dLeftUrgent : null].filter(Boolean).join(" ")}>
                          {days === 0 ? "closes today" : `${days}d left`}
                        </span>
                        <FundingIndicator funding={item.funding} />
                        {st ? <Chip tone={STATUS_TONE[st]}>{STATUS_LABELS[st]}</Chip> : null}
                        <SaveButton id={item.id} title={item.title} />
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}

          {/* §105: say what is NOT on this screen. 111 of 431 listings carry a
              date; the rest are rolling and have no place on a timeline. */}
          <p className="t-body-sm c-muted" style={{ marginTop: "var(--s-8)" }}>
            Listings with no published date are not on this timeline.{" "}
            <Link href="/explore?deadline=rolling" style={{ textDecoration: "underline", textUnderlineOffset: 2 }}>
              See the rolling and undated listings
            </Link>
            .
          </p>
        </div>
      )}
    </>
  );
}
