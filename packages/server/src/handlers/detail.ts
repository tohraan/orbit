/* GET /api/opportunities/:id
 *
 * One opportunity, with the long-form detail the card leaves out. The id is a
 * bigint primary key; anything that is not a positive integer is a 400 before
 * the index is even consulted, and a miss is a plain 404 that does not say
 * whether the row exists but was filtered out -- it isn't in the student
 * finder either way. */

import { fail, json, limited, CACHE_STATIC } from "../api";
import { getIndex } from "../source";


export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const blocked = limited(req, "detail", 240);
  if (blocked) return blocked;

  const { id: raw } = await ctx.params;
  if (!/^\d{1,12}$/.test(raw)) {
    return fail(400, "bad_id", "That is not a valid opportunity reference.");
  }

  try {
    const index = await getIndex();
    const item = index.byId.get(Number(raw));
    if (!item) return fail(404, "not_found", "That opportunity is no longer in the index.");

    /* Neighbours let the detail page offer "next deadline" without a second
     * request. They are summaries, so the prose is not sent four times over. */
    const at = index.items.findIndex((o) => o.id === item.id);
    const related = index.items
      .filter((o, i) => i !== at && o.sourceSlug === item.sourceSlug && !!o.deadline)
      .slice(0, 3)
      .map((o) => ({ id: o.id, title: o.title, deadline: o.deadline, type: o.type }));

    return json({ item, related, origin: index.origin }, {}, CACHE_STATIC);
  } catch (err) {
    return fail(500, "detail_failed", "This opportunity could not be loaded right now.", err);
  }
}
