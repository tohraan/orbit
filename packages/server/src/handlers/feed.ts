/* GET /api/feed
 *
 * The first request a visitor makes. One round trip returns both halves of
 * what the opening screen needs:
 *
 *   saved  the listings this browser has saved, resolved to live records
 *   items  a first chunk of everything else, ordered so that the chunk holds
 *          a spread of deadline urgency rather than the twelve closest to
 *          closing (lib/shuffle.ts explains why)
 *
 * Why the saved ids are a QUERY PARAMETER and not a session lookup: there are
 * no accounts. The saved list lives in the visitor's own browser, so the
 * browser is the only thing that knows it, and it hands it over per request.
 * Nothing is stored server-side, which is also why there is nothing here to
 * leak: `seed` is hashed and discarded, and `saved` is a list of public row
 * ids that never touches a log.
 *
 *   ?seed=<opaque>   stabilises the ordering for this visit
 *   ?saved=1,2,3     ids from localStorage, bounded at 60 by lib/query.ts
 *   ?limit=12        chunk size, capped at 48
 */

import { CACHE_LIST, fail, json, limited } from "../api";
import { MAX_PAGE_SIZE, daysUntil, facets, parseQuery, sort, toSummary } from "@rof/core";
import { getIndex } from "../source";
import { getInterest, withInterest } from "../interest";


export async function GET(req: Request) {
  const blocked = limited(req, "feed", 60);
  if (blocked) return blocked;

  try {
    const url = new URL(req.url);
    const sp = url.searchParams;

    /* Reuse the same validator as the list route, so `seed` and the id bounds
     * are parsed in exactly one place. */
    const base = parseQuery(sp);
    const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, Number.parseInt(sp.get("limit") ?? "12", 10) || 12));
    const savedIds = base.ids;

    const [index, interest] = await Promise.all([getIndex(), getInterest()]);

    const savedSet = new Set(savedIds);
    const saved = savedIds
      .map((id) => index.byId.get(id))
      .filter((o): o is NonNullable<typeof o> => !!o)
      /* Soonest first: a saved listing is one the student already chose, so
       * the only question left about it is how long they have. */
      .sort(
        (a, b) =>
          (a.deadline ? 0 : 1) - (b.deadline ? 0 : 1) || String(a.deadline).localeCompare(String(b.deadline)),
      );

    /* Saved listings are excluded from the discovery chunk: they are already
     * on screen above it, and a duplicate card is a bug the student has to
     * work out for themselves. */
    const pool = savedSet.size ? index.items.filter((o) => !savedSet.has(o.id)) : index.items;
    const ordered = sort(pool, { ...base, ids: [], sort: "mixed" });

    /* The dashboard figures ride along, so the opening screen is ONE round
     * trip rather than four. They are counted here rather than stored, so
     * they cannot drift from what the Explore grid shows. */
    const within = (n: number) =>
      index.items.filter((o) => {
        const d = daysUntil(o.deadline);
        return d != null && d >= 0 && d <= n;
      }).length;

    return json(
      {
        stats: {
          total: index.items.length,
          withDeadline: index.items.filter((o) => !!o.deadline).length,
          closingIn30: within(30),
          closingIn7: within(7),
          withAmount: index.items.filter((o) => !!o.amount).length,
          rolling: index.items.filter((o) => !o.deadline).length,
          sources: new Set(index.items.map((o) => o.sourceSlug)).size,
          origin: index.origin,
          freshestAt: index.freshestAt,
        },
        saved: withInterest(saved.map(toSummary), interest),
        /* An id can outlive its row — the deadline passed and a sweep removed
         * it. The count is reported so the screen can say so instead of
         * quietly showing fewer cards than the sidebar promised. */
        savedMissing: savedIds.filter((id) => !index.byId.has(id)),
        items: withInterest(ordered.slice(0, limit).map(toSummary), interest),
        total: ordered.length,
        pageSize: limit,
        pageCount: Math.max(1, Math.ceil(ordered.length / limit)),
        page: 1,
        seed: base.seed,
        facets: facets(index.items),
        origin: index.origin,
        freshestAt: index.freshestAt,
      },
      {},
      CACHE_LIST,
    );
  } catch (err) {
    return fail(500, "feed_failed", "Your opportunities couldn't be loaded right now.", err);
  }
}
