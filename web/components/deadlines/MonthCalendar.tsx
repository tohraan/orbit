"use client";

/* A month of deadlines, as a calendar.
 *
 * It replaces the horizontal dot band, which spent the widest, highest part of
 * the page answering one question — when is it busy — and answered it with a
 * row of dots nobody could count. A calendar answers the same question in a
 * shape everybody already reads, and it can be clicked: picking a day filters
 * the list beside it, which the band could not do.
 *
 * DATES ARE INTEGERS HERE, NEVER `Date` ARITHMETIC.
 *
 * This product renders for Dubai and runs on UTC servers, so a deadline turned
 * into a `Date` and back out through toISOString() can land on the previous
 * day. Every key in this file is the `YYYY-MM-DD` string the API already sent,
 * compared as a string; the only `Date` used is a throwaway one for "what
 * weekday does the 1st fall on", which is read with local getters and never
 * formatted. A listing closing on the 4th appears on the 4th in every timezone
 * the campus is ever in.
 */

import { useMemo } from "react";
import s from "./calendar.module.css";
import { Icon } from "../ui/Icon";
import type { OpportunitySummary } from "@rof/core";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/* Monday first: the UAE working week runs Monday to Friday, so a week that
   starts on Sunday puts two working days in the wrong half of the row. */
const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];

export type Cursor = { year: number; month: number }; // month is 1-12

const pad = (n: number) => String(n).padStart(2, "0");
export const dayKey = (c: Cursor, day: number) => `${c.year}-${pad(c.month)}-${pad(day)}`;

export function monthLabel(c: Cursor): string {
  return `${MONTHS[c.month - 1]} ${c.year}`;
}

export function shiftMonth(c: Cursor, by: number): Cursor {
  const m0 = c.month - 1 + by;
  return { year: c.year + Math.floor(m0 / 12), month: ((m0 % 12) + 12) % 12 + 1 };
}

/** Today's local calendar date, as the same string shape the API sends. */
export function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function cursorFromKey(key: string): Cursor {
  return { year: Number(key.slice(0, 4)), month: Number(key.slice(5, 7)) };
}

const daysInMonth = (c: Cursor) => new Date(c.year, c.month, 0).getDate();
/** 0 = Monday. getDay() is 0 = Sunday, so it is rotated. */
const firstWeekday = (c: Cursor) => (new Date(c.year, c.month - 1, 1).getDay() + 6) % 7;

export function MonthCalendar({
  items,
  cursor,
  onCursor,
  selected,
  onSelect,
  mineIds,
}: {
  items: OpportunitySummary[];
  cursor: Cursor;
  onCursor: (c: Cursor) => void;
  selected: string | null;
  onSelect: (key: string | null) => void;
  mineIds: Set<number>;
}) {
  /* One pass over the listings, keyed by the date string they already carry. */
  const byDay = useMemo(() => {
    const m = new Map<string, { count: number; mine: number }>();
    for (const it of items) {
      if (!it.deadline) continue;
      const k = it.deadline.slice(0, 10);
      const cur = m.get(k) ?? { count: 0, mine: 0 };
      cur.count += 1;
      if (mineIds.has(it.id)) cur.mine += 1;
      m.set(k, cur);
    }
    return m;
  }, [items, mineIds]);

  const busiest = useMemo(() => Math.max(1, ...[...byDay.values()].map((v) => v.count)), [byDay]);

  const today = todayKey();
  const total = daysInMonth(cursor);
  const lead = firstWeekday(cursor);
  const cells: (number | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: total }, (_, i) => i + 1),
  ];
  /* Pad to whole weeks so the grid keeps its shape month to month and the
     legend underneath never jumps. */
  while (cells.length % 7 !== 0) cells.push(null);

  const monthCount = [...byDay.entries()].filter(([k]) => k.startsWith(`${cursor.year}-${pad(cursor.month)}`))
    .reduce((n, [, v]) => n + v.count, 0);

  return (
    <div className={s.wrap}>
      <div className={s.head}>
        <div className={s.headText}>
          <h2 className={s.title}>{monthLabel(cursor)}</h2>
          <p className={s.sub}>
            {monthCount === 0 ? "Nothing closes this month" : `${monthCount} closing`}
          </p>
        </div>
        <div className={s.nav}>
          <button type="button" className={s.navBtn} aria-label="Previous month" onClick={() => onCursor(shiftMonth(cursor, -1))}>
            <Icon name="chevron-left" size={16} />
          </button>
          <button type="button" className={s.navBtn} aria-label="Next month" onClick={() => onCursor(shiftMonth(cursor, 1))}>
            <Icon name="chevron-right" size={16} />
          </button>
        </div>
      </div>

      <div className={s.weekdays} aria-hidden="true">
        {WEEKDAYS.map((d, i) => (
          <span key={i} className={s.weekday}>
            {d}
          </span>
        ))}
      </div>

      <div className={s.grid} role="grid" aria-label={`Deadlines in ${monthLabel(cursor)}`}>
        {cells.map((day, i) => {
          if (day == null) return <span key={`p${i}`} className={s.pad} aria-hidden="true" />;

          const key = dayKey(cursor, day);
          const hit = byDay.get(key);
          const isToday = key === today;
          const isSelected = key === selected;
          const past = key < today;

          /* Four steps, not a continuous ramp.
           *
           * A truly continuous gradient produces thirty shades nobody can tell
           * apart, which looks precise and reads as noise. Quartiles of the
           * busiest day in view give four surfaces a person can actually
           * distinguish and name, and the count is printed as well — the
           * colour ranks the days, the number says how many. */
          const level = hit ? Math.min(4, Math.ceil((hit.count / busiest) * 4)) : 0;

          return (
            <button
              key={key}
              type="button"
              role="gridcell"
              disabled={!hit}
              aria-pressed={isSelected}
              aria-label={
                hit
                  ? `${day} ${monthLabel(cursor)}, ${hit.count} closing${hit.mine ? `, ${hit.mine} saved or tracked` : ""}`
                  : `${day} ${monthLabel(cursor)}, nothing closing`
              }
              className={[
                s.day,
                hit ? s[`lvl${level}`] : null,
                isSelected ? s.daySelected : null,
                isToday ? s.dayToday : null,
                past ? s.dayPast : null,
                hit ? s.dayHas : null,
              ].filter(Boolean).join(" ")}
              onClick={() => onSelect(isSelected ? null : key)}
            >
              <span className={s.dayNum}>{day}</span>
              {hit ? (
                <span className={s.dayCount} aria-hidden="true">
                  {hit.count}
                </span>
              ) : null}
              {/* One dot, only when something here is yours. The count already
                  carries "how many"; this carries "and one of them is mine". */}
              {hit && hit.mine ? <span className={s.mineDot} aria-hidden="true" /> : null}
            </button>
          );
        })}
      </div>

      <div className={s.legend}>
        <span className={s.scale} aria-hidden="true">
          <span className={s.scaleLabel}>Quieter</span>
          <span className={`${s.scaleStep} ${s.lvl1}`} />
          <span className={`${s.scaleStep} ${s.lvl2}`} />
          <span className={`${s.scaleStep} ${s.lvl3}`} />
          <span className={`${s.scaleStep} ${s.lvl4}`} />
          <span className={s.scaleLabel}>Busier</span>
        </span>
        <span className={s.legendItem}>
          <span className={s.mineDot} />
          Saved or tracked
        </span>
      </div>
    </div>
  );
}
