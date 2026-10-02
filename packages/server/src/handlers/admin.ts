/* /api/admin/opportunities — the college desk.
 *
 * GET    lists what staff have added (token required: the list reveals who
 *        added what, which is operational detail, not student-facing).
 * POST   adds or updates one. Idempotent via on_conflict.
 * DELETE removes one, by external_id, pinned to college_desk.
 *
 * Every response is no-store. An admin list behind a CDN cache is a leak.
 */

import { fail, json, limited } from "../api";
import { authorised, deleteRow, toRow, validate, writeRow } from "../admin";
import { getIndex, invalidateIndex } from "../source";
import { toSummary } from "@rof/core";

const NO_CACHE = "no-store";

function guard(req: Request): Response | null {
  /* Tighter than the read routes: a write endpoint being hammered is either a
   * bug or an attempt, and neither deserves 120 a minute. */
  const blocked = limited(req, "admin", 30);
  if (blocked) return blocked;
  if (!authorised(req)) {
    /* No hint about whether the token was wrong or simply unconfigured. */
    return fail(401, "unauthorised", "Not authorised.");
  }
  return null;
}

export async function GET(req: Request) {
  const blocked = guard(req);
  if (blocked) return blocked;
  try {
    const index = await getIndex();
    const mine = index.items.filter((o) => o.sourceSlug === "college_desk");
    return json({ items: mine.map(toSummary), total: mine.length }, {}, NO_CACHE);
  } catch (err) {
    return fail(500, "admin_list_failed", "The college listings could not be loaded.", err);
  }
}

export async function POST(req: Request) {
  const blocked = guard(req);
  if (blocked) return blocked;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail(400, "bad_json", "The request body was not valid JSON.");
  }

  const { input, errors } = validate(body);
  if (errors.length) {
    /* Field-level errors ARE safe to return: they are about what the caller
     * sent, not about the system. The form renders them inline. */
    return new Response(JSON.stringify({ error: { code: "invalid", message: "Some fields need attention." }, fields: errors }), {
      status: 422,
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": NO_CACHE },
    });
  }

  /* A caller-supplied id makes a retry idempotent; without one a new id is
   * minted, so a genuine second submission is a second listing. */
  const supplied = typeof (body as Record<string, unknown>).externalId === "string"
    ? (body as Record<string, unknown>).externalId as string
    : null;
  const externalId =
    supplied && /^staff-[a-z0-9-]{6,60}$/.test(supplied)
      ? supplied
      : `staff-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  try {
    await writeRow(toRow(input, externalId));
    /* The read path caches the index for five minutes. Without this the staff
     * member adds a listing, looks at Explore, and does not see it — and
     * concludes the feature is broken. */
    invalidateIndex();
    return json({ ok: true, externalId }, { status: 201 }, NO_CACHE);
  } catch (err) {
    return fail(502, "write_failed", "The listing could not be saved. Try again.", err);
  }
}

export async function DELETE(req: Request) {
  const blocked = guard(req);
  if (blocked) return blocked;
  const id = new URL(req.url).searchParams.get("externalId") ?? "";
  if (!/^staff-[a-z0-9-]{6,60}$/.test(id)) {
    return fail(400, "bad_id", "That is not a valid college listing reference.");
  }
  try {
    await deleteRow(id);
    invalidateIndex();
    return json({ ok: true }, {}, NO_CACHE);
  } catch (err) {
    return fail(502, "delete_failed", "The listing could not be removed. Try again.", err);
  }
}
