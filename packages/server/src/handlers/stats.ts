/* GET /api/stats
 *
 * The figures on the home dashboard. Every one is counted from the index on
 * the way out -- none is stored, so none can drift from what the Explore grid
 * shows. The urgency counts use the SERVER's calendar day, which is at worst
 * a few hours off a Dubai viewer's; the per-card countdown is computed in the
 * browser instead, where the viewer's own date is known. */

import { CACHE_LIST, fail, json, limited } from "../api";
import { daysUntil } from "@rof/core";
import type { Stats } from "@rof/core";
import { getIndex } from "../source";


export async function GET(req: Request) {
  const blocked = limited(req, "stats", 60);
  if (blocked) return blocked;
  try {
    const { items, origin, freshestAt } = await getIndex();
    const within = (n: number) =>
      items.filter((o) => {
        const d = daysUntil(o.deadline);
        return d != null && d >= 0 && d <= n;
      }).length;

    const stats: Stats = {
      total: items.length,
      withDeadline: items.filter((o) => !!o.deadline).length,
      closingIn30: within(30),
      closingIn7: within(7),
      withAmount: items.filter((o) => !!o.amount).length,
      rolling: items.filter((o) => !o.deadline).length,
      sources: new Set(items.map((o) => o.sourceSlug)).size,
      origin,
      freshestAt,
    };
    return json(stats, {}, CACHE_LIST);
  } catch (err) {
    return fail(500, "stats_failed", "Dashboard figures could not be loaded right now.", err);
  }
}
