"use client";

/* The deadline timeline: a horizontal date axis with one dot per listing,
 * stacked where several close on the same day.
 *
 * Built against the real distribution rather than a generic timeline: 111
 * dated listings sit on only 43 distinct dates, the busiest holding eleven. So
 * same-day collision is the normal case, and the vertical stack is the primary
 * visual instead of an overflow behaviour.
 *
 * Decisions that are not mine and should not be quietly changed:
 *   - every dated listing in range is plotted; saved and tracked ones also get
 *     a text label, which is the only distinction between them
 *   - stacks are uncapped
 *   - the gradient is on the axis rule; the dots are neutral
 *   - clicking a dot opens a card above it, rather than navigating
 *   - below 768px the range is forced to 30 days (handled by the caller)
 *
 * Expired listings never reach here: packages/server/src/source.ts drops them
 * from the index entirely, so there is no "past" side to this axis.
 */

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import s from "./timeline.module.css";
import { Icon } from "../ui/Icon";
import { daysUntil, typeLabel } from "@rof/core";
import type { OpportunitySummary } from "@rof/core";

const DOT = 9;
const DOT_GAP = 3;
const LABEL_ROW_H = 30;
const LABEL_MAX_W = 160;
const POP_W = 300;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export type TimelineRange = 30 | 90 | 180;

type Column = {
  date: string;
  days: number;
  /** 0–100, this date's position across the range. */
  x: number;
  items: OpportunitySummary[];
};

type Label = { col: Column; item: OpportunitySummary; row: number };

export function Timeline({
  items,
  range,
  mineIds,
  loading,
  rangeControl,
  count,
}: {
  items: OpportunitySummary[];
  range: TimelineRange;
  /** Saved and tracked ids. These are the only listings that get a label. */
  mineIds: Set<number>;
  loading?: boolean;
  /** The 30 / 90 / 180 buttons. Owned by the page, because the same control
   *  also filters the list below the band -- one control, both views. */
  rangeControl?: React.ReactNode;
  count?: number;
}) {
  const wrap = useRef<HTMLDivElement | null>(null);
  const [wrapW, setWrapW] = useState(0);
  const [open, setOpen] = useState<string | null>(null);

  /* Measured, not guessed: the label rows and the popover clamp both need the
   * band's real pixel width.
   *
   * A CALLBACK ref rather than useLayoutEffect with an empty dep array. The
   * loading branch below returns a different element that does not carry the
   * ref, so an effect would run once against null, never re-run, and leave the
   * width at 0 forever — which silently drops every label, because the layout
   * pass below cannot place a label without a width to place it in. A callback
   * ref fires again the moment the real node mounts. */
  const observer = useRef<ResizeObserver | null>(null);
  const attach = useCallback((node: HTMLDivElement | null) => {
    observer.current?.disconnect();
    wrap.current = node;
    if (!node) return;
    setWrapW(node.clientWidth);
    observer.current = new ResizeObserver(() => setWrapW(node.clientWidth));
    observer.current.observe(node);
  }, []);

  useEffect(() => () => observer.current?.disconnect(), []);

  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(null);
    const away = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(null);
    };
    document.addEventListener("keydown", esc);
    document.addEventListener("mousedown", away);
    return () => {
      document.removeEventListener("keydown", esc);
      document.removeEventListener("mousedown", away);
    };
  }, [open]);

  /* Changing the range re-plots everything, so a card anchored to a dot that
   * has moved would float unattached. */
  useEffect(() => setOpen(null), [range]);

  const columns = useMemo<Column[]>(() => {
    const byDate = new Map<string, OpportunitySummary[]>();
    for (const item of items) {
      if (!item.deadline) continue;
      const d = daysUntil(item.deadline);
      if (d == null || d < 0 || d > range) continue;
      const list = byDate.get(item.deadline) ?? [];
      list.push(item);
      byDate.set(item.deadline, list);
    }
    return [...byDate.entries()]
      .map(([date, list]) => {
        const days = daysUntil(date) ?? 0;
        return {
          date,
          days,
          /* Inset by 1.5% at each end so a deadline today and one at the far
           * edge are both fully on the axis rather than half-clipped. */
          x: 1.5 + (days / range) * 97,
          /* Within a stack, your own listings sit at the bottom where the eye
           * lands first and the label's leader line reaches them. */
          items: [...list].sort(
            (a, b) => Number(mineIds.has(b.id)) - Number(mineIds.has(a.id)) || a.id - b.id,
          ),
        };
      })
      .sort((a, b) => a.days - b.days);
  }, [items, range, mineIds]);

  const tallest = columns.reduce((n, c) => Math.max(n, c.items.length), 0);
  const plotH = Math.max(DOT * 3, tallest * (DOT + DOT_GAP));

  /* Label rows. Each labelled listing is placed in the lowest row where it
   * does not overlap one already there, using an estimated text width. A fixed
   * two-row alternation collides as soon as one title is long. */
  const labels = useMemo<Label[]>(() => {
    if (!wrapW) return [];
    const candidates: { col: Column; item: OpportunitySummary }[] = [];
    for (const col of columns) {
      for (const item of col.items) if (mineIds.has(item.id)) candidates.push({ col, item });
    }
    const rows: { from: number; to: number }[][] = [];
    const out: Label[] = [];
    for (const c of candidates) {
      const text = c.item.title ?? "";
      const estimated = Math.min(LABEL_MAX_W, Math.max(44, text.length * 5.4));
      const centre = (c.col.x / 100) * wrapW;
      const from = centre - estimated / 2 - 6;
      const to = centre + estimated / 2 + 6;
      let row = 0;
      while (rows[row]?.some((r) => from < r.to && to > r.from)) row++;
      (rows[row] ??= []).push({ from, to });
      out.push({ col: c.col, item: c.item, row });
    }
    return out;
  }, [columns, mineIds, wrapW]);

  const labelRows = labels.reduce((n, l) => Math.max(n, l.row + 1), 0);

  /* Tick scale follows the range. A 30-day axis marked only at month
   * boundaries gets exactly one tick, at the far right — useless for judging
   * where in the window a dot sits — so short ranges are marked weekly and
   * longer ones monthly. */
  const ticks = useMemo(() => {
    const out: { x: number; label: string; edge?: "start" | "end" }[] = [
      { x: 1.5, label: "Today", edge: "start" },
    ];
    const at = (days: number) => 1.5 + (days / range) * 97;
    const now = new Date();
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    if (range <= 30) {
      for (let d = 7; d <= range; d += 7) {
        const dt = new Date(midnight.getTime() + d * 86_400_000);
        out.push({
          x: at(d),
          label: `${dt.getDate()} ${MONTHS[dt.getMonth()]}`,
          edge: d > range - 4 ? "end" : undefined,
        });
      }
    } else {
      for (let i = 1; i <= Math.ceil(range / 30) + 1; i++) {
        const dt = new Date(now.getFullYear(), now.getMonth() + i, 1);
        const days = Math.round((dt.getTime() - midnight.getTime()) / 86_400_000);
        if (days < 6 || days > range - 3) continue;
        out.push({ x: at(days), label: MONTHS[dt.getMonth()] });
      }
    }
    return out;
  }, [range]);

  /* Solid segments, not a gradient. The urgency bands are discrete — a
   * listing is inside seven days or it is not — so the axis is divided rather
   * than faded, and each segment is painted in the same fill its chips use. */
  const bands = useMemo(() => {
    const at = (days: number) => Math.min(100, 1.5 + (days / range) * 97);
    const out: { cls: "urgent" | "soon" | "later"; from: number; to: number }[] = [];
    if (range >= 7) out.push({ cls: "urgent", from: 0, to: at(7) });
    else out.push({ cls: "urgent", from: 0, to: 100 });
    if (range > 7) out.push({ cls: "soon", from: at(7), to: Math.min(100, at(30)) });
    if (range > 30) out.push({ cls: "later", from: at(30), to: 100 });
    return out.filter((b) => b.to > b.from);
  }, [range]);

  const openCol = columns.find((c) => c.date === open) ?? null;

  if (loading) {
    /* §103: the skeleton holds the band's real geometry -- head, plot, axis --
     * so the list below it does not jump when the data lands. */
    return (
      <div className={s.wrap} aria-hidden="true">
        <div className={s.head}>
          <span className="skeleton skeleton-line tall" style={{ width: 180, display: "block" }} />
          <span className="skeleton" style={{ width: 210, height: 32, borderRadius: 10, display: "block" }} />
        </div>
        <span className="skeleton" style={{ height: 118, borderRadius: 10, display: "block" }} />
        <span className="skeleton" style={{ height: 3, borderRadius: 2, display: "block", marginTop: 8 }} />
      </div>
    );
  }

  return (
    <div className={s.wrap} ref={attach}>
      <div className={s.head}>
        <div>
          <h2 className="t-section">When things close</h2>
          <p className="t-meta c-muted">
            {count ?? columns.reduce((n, c) => n + c.items.length, 0)} deadlines in the next{" "}
            {range === 180 ? "6 months" : `${range} days`}
          </p>
        </div>
        {rangeControl ? <div className={s.ranges}>{rangeControl}</div> : null}
      </div>

      <div className={s.plot}>
        {columns.length === 0 ? (
          <p className={s.empty}>Nothing closes in this window.</p>
        ) : (
          <>
            <div className={s.lanes} style={{ height: plotH }}>
              {columns.map((col) => (
                <div className={s.stack} key={col.date} style={{ left: `${col.x}%` }}>
                  {col.items.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={[
                        s.dot,
                        mineIds.has(item.id) ? s.dotMine : null,
                        open === col.date ? s.dotOpen : null,
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      style={{ position: "relative" }}
                      aria-label={`${item.title}, closes ${col.date}`}
                      aria-expanded={open === col.date}
                      onClick={() => setOpen(open === col.date ? null : col.date)}
                    />
                  ))}
                </div>
              ))}
            </div>

            <div className={s.axis}>
              {bands.map((b) => (
                <span
                  key={b.cls}
                  className={[s.axisBand, b.cls === "urgent" ? s.axisBandUrgent : b.cls === "soon" ? s.axisBandSoon : s.axisBandLater].join(" ")}
                  style={{ left: `${b.from}%`, width: `${b.to - b.from}%` }}
                  aria-hidden="true"
                />
              ))}
              <span className={s.today} style={{ left: "0%" }} aria-hidden="true" />
            </div>

            <div className={s.ticks} aria-hidden="true">
              {ticks.map((t) => (
                <span
                  className={s.tick}
                  key={`${t.label}-${t.x}`}
                  style={{
                    left: `${t.x}%`,
                    /* A centred label at either extreme hangs off the band, so
                     * the first and last align inward from their own tick. */
                    transform: t.edge === "start" ? "translateX(0)" : t.edge === "end" ? "translateX(-100%)" : undefined,
                  }}
                >
                  <span
                    className={s.tickMark}
                    style={t.edge === "start" ? { left: 0 } : t.edge === "end" ? { right: 0 } : undefined}
                  />
                  {t.label}
                </span>
              ))}
            </div>

            {labels.length ? (
              <div className={s.labels} style={{ height: labelRows * LABEL_ROW_H }}>
                {labels.map((l) => (
                  <Link
                    href={`/opportunity/${l.item.id}`}
                    key={l.item.id}
                    className={s.label}
                    style={{ left: `${l.col.x}%`, top: l.row * LABEL_ROW_H }}
                  >
                    <span className={s.labelLead} aria-hidden="true" />
                    <span className={`${s.labelText} clamp-2`}>{l.item.title}</span>
                  </Link>
                ))}
              </div>
            ) : null}
          </>
        )}
      </div>

      {openCol ? (
        <div
          className={s.pop}
          role="dialog"
          aria-label={`Closing ${openCol.date}`}
          style={{
            /* Clamped in pixels against the measured container, so a card on
             * the first or last dot stays fully inside the band. */
            left: Math.min(Math.max(12, (openCol.x / 100) * wrapW - POP_W / 2), Math.max(12, wrapW - POP_W - 12)),
            top: 0,
          }}
        >
          <div className={s.popHead}>
            <span className={s.popDate}>
              {openCol.date} · {openCol.days === 0 ? "closes today" : `${openCol.days} day${openCol.days === 1 ? "" : "s"} left`}
            </span>
            <button type="button" aria-label="Close" onClick={() => setOpen(null)} style={{ color: "var(--color-text-muted)" }}>
              <Icon name="close" size={14} />
            </button>
          </div>
          <div className={s.popList}>
            {openCol.items.map((item) => (
              <Link href={`/opportunity/${item.id}`} key={item.id} className={s.popItem}>
                <span className={`${s.popTitle} clamp-2`}>{item.title}</span>
                <span className={s.popMeta}>
                  {typeLabel(item.type)} · {item.sourceName}
                  {mineIds.has(item.id) ? " · saved" : ""}
                </span>
              </Link>
            ))}
          </div>
        </div>
      ) : null}

      <p className={s.legend}>
        <span className={s.legendItem}>
          <span className={`${s.legendDot} ${s.legendDotMine}`} /> Saved or tracked
        </span>
        <span className={s.legendItem}>
          <span className={s.legendDot} /> Everything else closing in this window
        </span>
        <span className={s.legendItem}>Each dot is one listing. Select one to see what closes that day.</span>
      </p>
    </div>
  );
}
