/* GET / — a health check, and the only thing this service serves that is not
 * data. It names the endpoints so a deployment can be smoke-tested by hand,
 * and reports whether the live index or the committed snapshot is in play,
 * which is the first thing to check when the frontend looks empty.
 *
 * Deliberately says nothing about the Supabase project: no URL, no project
 * ref, no error text. */

import { getIndex, roverBudget, roverConfigured, roverModel } from "@rof/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  let index: Awaited<ReturnType<typeof getIndex>> | null = null;
  try {
    index = await getIndex();
  } catch {
    /* Reported as a degraded status below, not as a 500: a health check that
     * cannot be read tells you nothing. */
  }

  return Response.json(
    {
      service: "research-opportunity-api",
      status: index ? "ok" : "degraded",
      origin: index?.origin ?? null,
      openCalls: index?.items.length ?? 0,
      /* Whether the agent chat is switched on here. "off" is a valid
       * deployment, not a fault — see DEPLOY.md — and this is the quickest way
       * to tell a missing key from a broken one. The key itself is never
       * echoed, only the fact that there is one. */
      rover: roverConfigured()
        ? {
            status: "on",
            model: roverModel(),
            /* Null until a turn has run: the budget is read from OpenRouter
             * during a turn, and a health check must not spend a request
             * finding out. */
            budget: roverBudget(),
          }
        : { status: "off" },
      indexedAt: index?.freshestAt ?? null,
      endpoints: [
        "/api/feed?seed=<opaque>&ids=<saved ids>&limit=12",
        "/api/opportunities?sort=mixed&seed=<opaque>&page=1&pageSize=12",
        "/api/opportunities/<id>",
        "/api/facets",
        "/api/stats",
        "POST /api/rover  (server-sent events)",
      ],
    },
    {
      status: index ? 200 : 503,
      headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" },
    },
  );
}
