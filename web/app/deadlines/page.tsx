"use client";

/* §54 and §88: upcoming deadlines — a calendar beside the list.
 *
 * WHY THE BAND WENT. The horizontal dot timeline took the widest, highest part
 * of the page to answer one question ("when is it busy") with a row of dots
 * nobody could count, and it could not be acted on. A calendar answers the
 * same question in a shape every student already reads, and picking a day
 * filters the list next to it.
 *
 * ONE REQUEST, NO REFETCH ON NAVIGATION. The whole dated index is ~111
 * listings, so the six-month window is fetched once and the calendar pages
 * through it in memory. Moving to another month cannot produce a spinner, and
 * the calendar and the list are rendered from the same array — so they can
 * never disagree about what closes when.
 *
 * Listings whose deadline has passed are not here and are not anywhere else
 * either: packages/server/src/source.ts drops them from the index.
 */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import r from "../rows.module.css";
import { PageHead } from "@/components/layout/AppShell";
import {
  MonthCalendar,
  cursorFromKey,
  monthLabel,
  todayKey,
  type Cursor,
} from "@/components/deadlines/MonthCalendar";
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

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export default function DeadlinesPage() {
  const { saved } = useSaved();
  const { entries, statusOf } = useTracker();

  /* The calendar opens on the current month and the list opens unfiltered:
   * arriving on a screen that has already filtered itself hides most of what
   * the page is for. */
  const [cursor, setCursor] = useState<Cursor>(() => cursorFromKey(todayKey()));
  const [day, setDay] = useState<string | null>(null);

  /* Six months, once. Paging the calendar is a slice of this array, not a
   * request — a month that spins before it draws is a month nobody flips
   * through. */
  const { data, initial, error, reload } = useApi<ListResponse>(
    api(`/api/opportunities?deadline=d180&sort=deadline&pageSize=120`),
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

  /* What the list shows. A picked day narrows it to that day; otherwise it is
   * every dated listing, grouped by month. Built from the date DIGITS rather
   * than a Date object — see the note in packages/core/src/format.ts. */
  const shown = useMemo(
    () => (day ? items.filter((i) => i.deadline?.slice(0, 10) === day) : items),
    [items, day],
  );

  const groups = useMemo(() => {
    const out = new Map<string, { label: string; items: OpportunitySummary[] }>();
    for (const item of shown) {
      if (!item.deadline) continue;
      const [y, m] = item.deadline.split("-");
      const key = `${y}-${m}`;
      if (!out.has(key)) out.set(key, { label: `${MONTHS[Number(m) - 1]} ${y}`, items: [] });
      out.get(key)!.items.push(item);
    }
    return [...out.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([key, g]) => ({ key, ...g }));
  }, [shown]);

  /* Picking a day in a month the list is not showing would leave the student
   * looking at an empty column with no explanation, so selection always moves
   * the calendar with it. */
  function pickDay(next: string | null) {
    setDay(next);
    if (next) setCursor(cursorFromKey(next));
  }

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

      <div className={r.dLayout}>
        {/* The calendar sticks: scrolling a long list should not cost you the
            thing you navigate it with. */}
        <aside className={r.dCal}>
          <MonthCalendar
            items={items}
            cursor={cursor}
            onCursor={setCursor}
            selected={day}
            onSelect={pickDay}
            mineIds={mineIds}
          />

          {/* §105: say what is NOT on this screen — and say it here, beside
              the calendar, rather than under a list you must reach the end of
              to discover that a third of the index was never on it. */}
          <p className={r.dAside}>
            107 of 427 listings publish a date. The rest are rolling or undated and are not on this calendar.{" "}
            <Link href="/explore?deadline=rolling" className={r.dAsideLink}>
              See the rolling listings
            </Link>
            .
          </p>
        </aside>

        <div className={r.dList}>
          {/* What the list is currently showing, and the way back out of it. */}
          <div className={r.dListHead}>
            <h2 className={r.groupTitle}>
              {day ? `${Number(day.slice(8))} ${monthLabel(cursorFromKey(day))}` : "Everything upcoming"}
            </h2>
            <span className={r.dListMeta}>
              {shown.length} {shown.length === 1 ? "deadline" : "deadlines"}
              {day ? (
                <button type="button" className={r.dClear} onClick={() => pickDay(null)}>
                  Show all
                </button>
              ) : null}
            </span>
          </div>

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
          title={day ? "Nothing closes on this day" : "Nothing closes in the next six months"}
          body={
            day
              ? "Pick another day, or show everything upcoming."
              : "Many listings accept applications all year and publish no date at all."
          }
          actions={
            <>
              {day ? (
                <Button variant="secondary" onClick={() => pickDay(null)}>
                  Show all
                </Button>
              ) : null}
              <ButtonLink href="/explore?deadline=rolling" variant="ghost">
                Rolling listings
              </ButtonLink>
            </>
          }
        />
      ) : (
        <div>
          {groups.map((g) => (
            <section key={g.key}>
              <div className={r.dGroupHead}>
                <h2 className={r.groupTitle}>{g.label}</h2>
                <span className={r.groupCount}>
                  {g.items.length} {g.items.length === 1 ? "deadline" : "deadlines"}
                </span>
              </div>
              <div className={r.dCard}>
                {g.items.map((item) => {
                  const days = daysUntil(item.deadline) ?? 0;
                  /* Same bands as every other deadline badge: 3 and 14. */
                  const tone = days <= 3 ? "urgent" : days <= 14 ? "soon" : "later";
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

        </div>
      )}
        </div>
      </div>
    </>
  );
}
