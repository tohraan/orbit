"use client";

/* The board view of the tracker.
 *
 * WHY THIS EXISTS ALONGSIDE THE LIST, rather than replacing it. The two answer
 * different questions and neither answers both:
 *
 *   list   "what is closing next?"   — ordered by deadline, across every status
 *   board  "where does everything stand?" — grouped by status, deadline second
 *
 * A student deciding what to do this evening wants the list. A student taking
 * stock of fifteen applications wants the board. Forcing one view to serve both
 * is what makes a tracker feel like a spreadsheet.
 *
 * §53 says the status must stay visually SECONDARY to the opportunity, which
 * rules out the usual board of saturated colour blocks. So the columns are
 * plain: the status is the column HEADING, stated once, and the cards beneath
 * carry the opportunity's own title and deadline with no status chip repeating
 * what the column already said. Colour appears only on the deadline, where it
 * means urgency rather than decoration.
 *
 * MOVING A CARD. Drag-and-drop is not used. It is unusable by keyboard without
 * a parallel control, it is awkward on the touch devices most of these students
 * are on, and the pointer-event handling it needs is a real amount of code to
 * maintain. Each card carries the same TrackControl as the list — a menu that
 * names every status — so moving an application is one tap, works on every
 * input, and is the identical control in both views.
 */

import Link from "next/link";
import { useMemo } from "react";
import b from "./board.module.css";
import { DeadlineIndicator } from "@/components/opportunities/Indicators";
import { TrackControl } from "@/components/opportunities/Actions";
import { typeLabel } from "@rof/core";
import type { OpportunitySummary } from "@rof/core";
import { STATUSES, STATUS_LABELS, type Status, type TrackerEntry } from "@/lib/data";

export function Board({
  entries,
  byId,
}: {
  entries: TrackerEntry[];
  byId: Map<number, OpportunitySummary>;
}) {
  /* Grouped once, then each column sorted by deadline — within a status, the
   * thing closing soonest is the thing to do next. */
  const columns = useMemo(() => {
    const m = new Map<Status, TrackerEntry[]>();
    for (const st of STATUSES) m.set(st, []);
    for (const e of entries) m.get(e.status)?.push(e);
    for (const list of m.values()) {
      list.sort((x, y) => {
        const dx = byId.get(x.id)?.deadline ?? "9999-99-99";
        const dy = byId.get(y.id)?.deadline ?? "9999-99-99";
        return dx.localeCompare(dy);
      });
    }
    return m;
  }, [entries, byId]);

  return (
    /* Scrolls horizontally rather than compressing six columns into the
       viewport: a column too narrow to hold a title is not a column. */
    <div className={b.board} role="list" aria-label="Applications by status">
      {STATUSES.map((st) => {
        const list = columns.get(st) ?? [];
        return (
          <section className={b.column} key={st} role="listitem" aria-label={STATUS_LABELS[st]}>
            <header className={b.columnHead}>
              <h3 className={b.columnTitle}>{STATUS_LABELS[st]}</h3>
              <span className={b.columnCount}>{list.length}</span>
            </header>

            <div className={b.stack}>
              {list.length === 0 ? (
                /* A column saying nothing is here is more useful than an empty
                   box, which reads as something that failed to load. */
                <p className={b.empty}>Nothing here</p>
              ) : (
                list.map((e) => {
                  const item = byId.get(e.id);
                  if (!item) return null;
                  return (
                    <article className={b.card} key={e.id}>
                      <Link href={`/opportunity/${e.id}`} className={b.cardLink}>
                        <span className={`${b.cardTitle} clamp-2`}>{item.title}</span>
                        <span className={b.cardMeta}>
                          {typeLabel(item.type)} &middot; {item.sourceName}
                        </span>
                      </Link>
                      <div className={b.cardFoot}>
                        <DeadlineIndicator item={item} />
                        <TrackControl id={e.id} />
                      </div>
                    </article>
                  );
                })
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
