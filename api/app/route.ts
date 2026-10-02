/* GET / — a health check, and the only thing this service serves that is not
 * data. It names the endpoints so a deployment can be smoke-tested by hand,
 * and reports whether the live index or the committed snapshot is in play,
 * which is the first thing to check when the frontend looks empty.
 *
 * Deliberately says nothing about the Supabase project: no URL, no project
 * ref, no error text. */

import { getIndex } from "@rof/server";

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
      indexedAt: index?.freshestAt ?? null,
      endpoints: [
        "/api/feed?seed=<opaque>&ids=<saved ids>&limit=12",
        "/api/opportunities?sort=mixed&seed=<opaque>&page=1&pageSize=12",
        "/api/opportunities/<id>",
        "/api/facets",
        "/api/stats",
      ],
    },
    {
      status: index ? 200 : 503,
      headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" },
    },
  );
}
