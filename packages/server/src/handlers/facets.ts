/* GET /api/facets
 *
 * Filter options with counts, over the whole index rather than the current
 * result set -- see the note in lib/query.ts:facets(). Also returns the
 * dirham conversion table, so the currency switch has one source of truth and
 * the client is not carrying a second copy of the rates. */

import { CACHE_STATIC, fail, json, limited } from "../api";
import { AED_PER, RATES_AS_OF, facets } from "@rof/core";
import { getIndex } from "../source";


export async function GET(req: Request) {
  const blocked = limited(req, "facets", 60);
  if (blocked) return blocked;
  try {
    const index = await getIndex();
    return json(
      { facets: facets(index.items), fx: { aedPer: AED_PER, asOf: RATES_AS_OF }, origin: index.origin },
      {},
      CACHE_STATIC,
    );
  } catch (err) {
    return fail(500, "facets_failed", "Filters could not be loaded right now.", err);
  }
}
