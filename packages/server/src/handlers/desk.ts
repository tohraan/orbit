/* /api/desk/* — the management desk's API.
 *
 * Every route here is staff-only (../staff), rate limited, and no-store: an
 * admin response behind a CDN cache is a leak, and several of these carry the
 * student roster.
 *
 * The writes are deliberately narrow. Staff never name a source — a published
 * listing is pinned to `college_desk` (db/014) — and a correction to a scraped
 * listing becomes an override row (db/020) rather than an edit to `raw_items`,
 * which the scraper would overwrite on its next run.
 */

import { fail, json, limited } from "../api";
import { requireStaff, audit, type Staff } from "../staff";
import { scrape } from "../scrape";
import { toRow, validate, writeRow } from "../admin";
import { getIndex, invalidateIndex } from "../source";
import { cleanPatch, toSummary, type OverrideRow } from "@rof/core";

const NO_CACHE = "no-store";

/** Rate limits are per route-kind, because the costs differ by orders of
 *  magnitude: a scrape makes an outbound request to somebody else's server. */
async function gate(req: Request, bucket: string, perMinute: number):
  Promise<{ staff: Staff } | Response> {
  const blocked = limited(req, bucket, perMinute);
  if (blocked) return blocked;
  const check = await requireStaff(req);
  if (!check.ok) return fail(check.status, check.code, check.message);
  return { staff: check.staff };
}

function sb() {
  const url = (process.env.SUPABASE_URL ?? "").replace(/\/+$/, "");
  const key = process.env.SUPABASE_SERVICE_KEY ?? "";
  if (!url || !key) return null;
  return {
    get: async <T>(path: string): Promise<T> => {
      const res = await fetch(`${url}/rest/v1/${path}`, {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`supabase ${res.status}`);
      return res.json() as Promise<T>;
    },
    write: async (path: string, body: unknown, prefer: string): Promise<void> => {
      const res = await fetch(`${url}/rest/v1/${path}`, {
        method: "POST",
        headers: {
          apikey: key, Authorization: `Bearer ${key}`,
          "Content-Type": "application/json", Prefer: prefer,
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`supabase ${res.status}: ${(await res.text()).slice(0, 200)}`);
    },
  };
}

/* ------------------------------------------------------------- scrape --- */

/** POST /api/desk/scrape — read a page so staff do not have to retype it.
 *
 *  The result is a DRAFT and is never written anywhere. Nothing is published
 *  until a staff member has looked at it and pressed publish, which is the
 *  whole reason the response carries `missing` and `warnings` rather than
 *  quietly filling blanks with its best guess. */
export async function scrapeRoute(req: Request) {
  const g = await gate(req, "desk-scrape", 12);
  if (g instanceof Response) return g;

  let body: { url?: unknown };
  try {
    body = (await req.json()) as { url?: unknown };
  } catch {
    return fail(400, "bad_json", "The request body was not valid JSON.");
  }
  const url = typeof body.url === "string" ? body.url.trim() : "";
  if (!url) return fail(400, "no_url", "Paste the link to the opportunity page.");
  if (url.length > 2000) return fail(400, "bad_url", "That link is too long.");

  /* Today in Dubai. The server runs on UTC, and a deadline compared against
   * the wrong day is exactly the bug this project has hit before, so the date
   * is formatted for the timezone the portal is read in. */
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai" }).format(new Date());

  const result = await scrape(url, today);
  await audit(g.staff, "scrape", url, { ok: result.ok, code: result.ok ? null : result.code });
  if (!result.ok) {
    /* 422, not 500: the request was fine, the page was not. A 500 here would
     * read as "our fault" and send staff to the wrong person. */
    return json(result, { status: 422 }, NO_CACHE);
  }
  return json(result, {}, NO_CACHE);
}

/* ----------------------------------------------------------- listings --- */

/** GET /api/desk/listings — every listing, with its override state and how many
 *  students are interested. This is the staff view, so suppressed listings are
 *  INCLUDED: a desk that hides what it has hidden cannot un-hide it. */
export async function listingsRoute(req: Request) {
  const g = await gate(req, "desk-read", 60);
  if (g instanceof Response) return g;
  const db = sb();
  if (!db) return fail(500, "not_configured", "The desk is not configured.");

  try {
    /* getIndex() has already applied overrides and dropped suppressed listings,
     * so it cannot answer this question — it is the student's view by
     * construction. The override and interest tables are read directly and
     * joined here against the unsuppressed set, with the suppressed ones added
     * back from their own rows. */
    const [index, overrides, interest] = await Promise.all([
      getIndex(),
      db.get<OverrideRow[]>("opportunity_overrides?select=raw_item_id,suppressed,featured,patch,note,updated_at"),
      db.get<{ opportunity_id: number; saved_count: number; tracked_count: number }[]>(
        "opportunity_interest?select=opportunity_id,saved_count,tracked_count",
      ),
    ]);

    const ovBy = new Map(overrides.map((o) => [o.raw_item_id, o]));
    const intBy = new Map(interest.map((i) => [i.opportunity_id, i]));

    const rows = index.items.map((o) => {
      const ov = ovBy.get(o.id);
      const it = intBy.get(o.id);
      return {
        ...toSummary(o),
        manual: o.sourceSlug === "college_desk",
        suppressed: Boolean(ov?.suppressed),
        featured: Boolean(ov?.featured),
        edited: Object.keys(cleanPatch(ov?.patch)).length > 0,
        note: (ov as { note?: string | null } | undefined)?.note ?? null,
        saved: it?.saved_count ?? 0,
        tracked: it?.tracked_count ?? 0,
      };
    });

    /* Suppressed listings are absent from the index by design, so they are
     * listed separately rather than silently missing from the desk. */
    const visible = new Set(index.items.map((o) => o.id));
    const hidden = overrides
      .filter((o) => o.suppressed && !visible.has(o.raw_item_id))
      .map((o) => ({
        id: o.raw_item_id,
        suppressed: true,
        featured: Boolean(o.featured),
        edited: Object.keys(cleanPatch(o.patch)).length > 0,
        note: (o as { note?: string | null }).note ?? null,
        saved: intBy.get(o.raw_item_id)?.saved_count ?? 0,
        tracked: intBy.get(o.raw_item_id)?.tracked_count ?? 0,
      }));

    return json({ items: rows, hidden, total: rows.length }, {}, NO_CACHE);
  } catch (err) {
    return fail(500, "desk_list_failed", "The listings could not be loaded.", err);
  }
}

/* ----------------------------------------------------------- override --- */

/** PATCH /api/desk/override — remove, restore, feature, or correct a listing.
 *
 *  This is the route that makes "update an existing listing" mean something.
 *  It writes to `opportunity_overrides`, NOT to `raw_items`, because W01
 *  upserts raw_items on every run and an edit written there would be gone by
 *  the next scrape with nothing to show for it. */
export async function overrideRoute(req: Request) {
  const g = await gate(req, "desk-write", 40);
  if (g instanceof Response) return g;
  const db = sb();
  if (!db) return fail(500, "not_configured", "The desk is not configured.");

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return fail(400, "bad_json", "The request body was not valid JSON.");
  }

  const id = Number(body.id);
  if (!Number.isInteger(id) || id <= 0) return fail(400, "bad_id", "Which listing?");

  const row: Record<string, unknown> = { raw_item_id: id, updated_by: g.staff.id, updated_at: new Date().toISOString() };
  const actions: string[] = [];

  if (typeof body.suppressed === "boolean") {
    row.suppressed = body.suppressed;
    actions.push(body.suppressed ? "suppress" : "restore");
  }
  if (typeof body.featured === "boolean") {
    row.featured = body.featured;
    actions.push(body.featured ? "feature" : "unfeature");
  }
  if (body.patch !== undefined) {
    /* cleanPatch drops anything not in PATCHABLE, so the identity fields —
     * source, host, provenance — cannot be rewritten to make a staff listing
     * look like a UKRI one. */
    const patch = cleanPatch(body.patch);
    row.patch = patch;
    if (Object.keys(patch).length) actions.push("update");
  }
  if (typeof body.note === "string") row.note = body.note.trim().slice(0, 500) || null;

  if (!actions.length && row.note === undefined) {
    return fail(400, "nothing_to_do", "Nothing was changed.");
  }

  try {
    await db.write(
      "opportunity_overrides?on_conflict=raw_item_id",
      row,
      "resolution=merge-duplicates,return=minimal",
    );
    invalidateIndex();
    for (const a of actions) await audit(g.staff, a, String(id), { note: row.note ?? null });
    return json({ ok: true, id, actions }, {}, NO_CACHE);
  } catch (err) {
    return fail(500, "override_failed", "That change could not be saved.", err);
  }
}

/* ------------------------------------------------------------ publish --- */

/** POST /api/desk/publish — put a staff-written listing in front of students.
 *
 *  Reuses the existing college-desk validator and writer (../admin) rather than
 *  growing a second one: the shape it writes is what the whole product already
 *  knows how to read, and the (source_slug, external_id) constraint is what
 *  makes a retry idempotent instead of producing a duplicate card. */
export async function publishRoute(req: Request) {
  const g = await gate(req, "desk-write", 40);
  if (g instanceof Response) return g;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail(400, "bad_json", "The request body was not valid JSON.");
  }

  const { input, errors } = validate(body);
  if (errors.length) return json({ ok: false, errors }, { status: 422 }, NO_CACHE);

  try {
    /* The staff member's real identity, not a name they typed. This is the one
     * thing a shared token could never record. */
    input.addedBy = g.staff.name || g.staff.email;

    /* Same id shape and same rules as the older token route, so the two cannot
     * mint colliding ids: a caller may supply one to make a retry idempotent
     * (the unique (source_slug, external_id) makes the write an upsert), and
     * anything else is rejected rather than trusted. */
    const supplied = (body as { externalId?: unknown }).externalId;
    const externalId =
      typeof supplied === "string" && /^staff-[a-z0-9-]{6,60}$/.test(supplied)
        ? supplied
        : `staff-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

    const row = toRow(input, externalId);
    await writeRow(row);
    invalidateIndex();
    await audit(g.staff, "publish", externalId, { title: input.title, url: input.url });
    return json({ ok: true, externalId }, {}, NO_CACHE);
  } catch (err) {
    return fail(500, "publish_failed", "That listing could not be published.", err);
  }
}

/* ------------------------------------------------------------ people ---- */

/** GET /api/desk/students — who has registered on the portal.
 *
 *  WHAT THIS DELIBERATELY DOES NOT RETURN: which opportunities a given student
 *  saved. db/017 keeps interest as totals with no student ids precisely so that
 *  question has no answer, and the consent banner promises students the count
 *  is "a number only, never who". Per-listing totals are on /listings; the two
 *  are never joined. */
export async function studentsRoute(req: Request) {
  const g = await gate(req, "desk-read", 30);
  if (g instanceof Response) return g;
  const db = sb();
  if (!db) return fail(500, "not_configured", "The desk is not configured.");

  try {
    const rows = await db.get<
      {
        email: string | null; full_name: string | null; degree: string | null; branch: string | null;
        year_of_study: string | null; graduation: string | null; level: string | null;
        onboarded_at: string | null; created_at: string | null;
        is_staff: boolean; share_interest: boolean;
      }[]
    >(
      /* Column names read off db/015, not guessed: it is `year_of_study`, a
       * text column, not `year`. PostgREST answers a wrong name with a 400 and
       * the whole screen fails, so this is the one query worth checking against
       * the schema rather than against memory. */
      "students?select=email,full_name,degree,branch,year_of_study,graduation,level," +
        "onboarded_at,created_at,is_staff,share_interest&order=created_at.desc&limit=2000",
    );

    const students = rows.map((r) => ({
      name: r.full_name,
      /* The roll number IS the local part of a campus address (f20240000@...),
       * so it is derived rather than stored twice and able to disagree. */
      id: (r.email ?? "").split("@")[0] || null,
      email: r.email,
      degree: r.degree,
      branch: r.branch,
      year: r.year_of_study,
      graduation: r.graduation,
      level: r.level,
      onboarded: Boolean(r.onboarded_at),
      joinedAt: r.created_at,
      staff: r.is_staff,
    }));

    return json(
      {
        students,
        total: students.length,
        onboarded: students.filter((s) => s.onboarded).length,
        /* The funnel staff actually want: registered, finished onboarding, and
         * said enough for the matcher to rank anything. */
        withLevel: students.filter((s) => s.level).length,
        countedIn: rows.filter((r) => r.share_interest).length,
      },
      {},
      NO_CACHE,
    );
  } catch (err) {
    return fail(500, "roster_failed", "The student list could not be loaded.", err);
  }
}

/* ------------------------------------------------------------- audit ---- */

/** GET /api/desk/audit — who did what. */
export async function auditRoute(req: Request) {
  const g = await gate(req, "desk-read", 30);
  if (g instanceof Response) return g;
  const db = sb();
  if (!db) return fail(500, "not_configured", "The desk is not configured.");
  try {
    const rows = await db.get<unknown[]>("admin_audit?select=id,actor_email,action,target,detail,at&order=at.desc&limit=200");
    return json({ entries: rows }, {}, NO_CACHE);
  } catch (err) {
    return fail(500, "audit_failed", "The activity log could not be loaded.", err);
  }
}

/* ------------------------------------------------------------ health ---- */

/** GET /api/desk/sources — is the pipeline actually working?
 *
 *  v_source_health exists in db/002 and nothing has ever read it. It is the
 *  answer to the question a department will ask first when the feed looks
 *  thin: which sources ran, when, and how much did they bring back. */
export async function sourcesRoute(req: Request) {
  const g = await gate(req, "desk-read", 30);
  if (g instanceof Response) return g;
  const db = sb();
  if (!db) return fail(500, "not_configured", "The desk is not configured.");
  try {
    const rows = await db.get<unknown[]>("v_source_health?select=*");
    return json({ sources: rows }, {}, NO_CACHE);
  } catch (err) {
    return fail(500, "sources_failed", "Source health could not be loaded.", err);
  }
}
