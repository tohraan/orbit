/* GET /api/opportunities
 *
 * The list endpoint. Reads the cached open-call index, applies the validated
 * query, and returns one page of CARD-shaped records -- lib/project.ts strips
 * the eligibility / benefits / how-to-apply prose, which is 60% of the bytes
 * and is never rendered on a card.
 *
 * Query parameters are documented in lib/query.ts. Unknown ones are ignored. */

import { fail, json, limited } from "../api";
import { facets, filter, isFiltered, page, parseQuery, sort, toSummary } from "@rof/core";
import type { ListResponse } from "@rof/core";
import { getIndex } from "../source";
import { getInterest, withInterest } from "../interest";


export async function GET(req: Request) {
  const blocked = limited(req, "list", 120);
  if (blocked) return blocked;

  try {
    const url = new URL(req.url);
    const q = parseQuery(url.searchParams);
    /* Two caches, two lifetimes: the index turns over when a scrape runs, the
     * counts when anyone saves anything. Fetched together so the page still
     * costs one round trip. */
    const [index, interest] = await Promise.all([getIndex(), getInterest()]);

    const matched = sort(filter(index.items, q), q);
    const { slice, page: current, pageCount } = page(matched, q);

    const body: ListResponse & { query: typeof q; filtered: boolean } = {
      items: withInterest(slice.map(toSummary), interest),
      total: matched.length,
      page: current,
      pageSize: q.pageSize,
      pageCount,
      origin: index.origin,
      freshestAt: index.freshestAt,
      query: q,
      filtered: isFiltered(q),
    };

    /* The facet counts are only wanted on a first load; sending them with
     * every page turn would triple the payload for no new information. */
    if (url.searchParams.get("facets") === "1") {
      return json({ ...body, facets: facets(index.items) });
    }
    return json(body);
  } catch (err) {
    return fail(500, "list_failed", "Opportunities could not be loaded right now.", err);
  }
}
