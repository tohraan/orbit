/* GET /api/opportunities/:id
 *
 * One opportunity, with the long-form detail the card leaves out. The id is a
 * bigint primary key; anything that is not a positive integer is a 400 before
 * the index is even consulted, and a miss is a plain 404 that does not say
 * whether the row exists but was filtered out -- it isn't in the student
 * finder either way. */

import { CACHE_LIST, fail, json, limited } from "../api";
import { getIndex } from "../source";
import { getInterest, withInterest } from "../interest";


export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const blocked = limited(req, "detail", 240);
  if (blocked) return blocked;

  const { id: raw } = await ctx.params;
  if (!/^\d{1,12}$/.test(raw)) {
    return fail(400, "bad_id", "That is not a valid opportunity reference.");
  }

  try {
    const [index, interest] = await Promise.all([getIndex(), getInterest()]);
    const item = index.byId.get(Number(raw));
    if (!item) return fail(404, "not_found", "That opportunity is no longer in the index.");

    /* Neighbours let the detail page offer "next deadline" without a second
     * request. They are summaries, so the prose is not sent four times over. */
    const at = index.items.findIndex((o) => o.id === item.id);
    const related = index.items
      .filter((o, i) => i !== at && o.sourceSlug === item.sourceSlug && !!o.deadline)
      .slice(0, 3)
      .map((o) => ({ id: o.id, title: o.title, deadline: o.deadline, type: o.type }));

    const [withCount] = withInterest([item], interest);
    /* CACHE_LIST, not CACHE_STATIC. The prose on this page is static and used
     * to earn a ten-minute shared cache, but the response now carries the
     * interest count, which moves whenever anyone saves the listing. A student
     * who saves something and watches the number sit still for ten minutes
     * concludes the save did not work. */
    return json({ item: withCount, related, origin: index.origin }, {}, CACHE_LIST);
  } catch (err) {
    return fail(500, "detail_failed", "This opportunity could not be loaded right now.", err);
  }
}
