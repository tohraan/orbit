/* Staff corrections, layered over a projected listing.
 *
 * WHY THIS IS A LAYER AND NOT AN EDIT.
 *
 * W01 upserts `raw_items` on (source_slug, external_id) with
 * `resolution=merge-duplicates`, on every run of the scrape. A staff edit
 * written into that row therefore survives until the next scrape and then
 * disappears, silently, with the listing reverting to whatever the source says
 * today. That is the worst shape a bug can take: it looks like it worked, and
 * it keeps looking like it worked until nobody is watching.
 *
 * So the scraper keeps sole ownership of `raw_items` — it writes what the
 * source actually said — and a correction lives beside it in
 * `opportunity_overrides` (db/020), applied here, after projection. The
 * consequences are all good ones: a re-scrape cannot undo a correction, the
 * source's own words are never destroyed so "what did it say before?" is always
 * answerable, and a listing with no override costs exactly nothing.
 *
 * ONLY THE KEYS PRESENT ARE APPLIED. A staff member fixing one garbled
 * description should not thereby freeze that listing's deadline against every
 * future scrape — which is what a whole-record copy would do, and it would not
 * look wrong until a deadline moved.
 */

import type { OpportunityDetail } from "./types";

/** The fields staff may correct. Deliberately not every field: `id`,
 *  `sourceSlug`, `host` and the provenance line identify the listing and are
 *  not opinions, so letting them be rewritten would let a staff listing
 *  impersonate a UKRI one. */
export const PATCHABLE = [
  "title", "summary", "deadline", "deadlineKind", "deadlineNote", "type",
  "levels", "country", "funding", "duration", "amount", "fields",
  "applyLink", "eligibility", "benefits", "howToApply", "documents", "url",
] as const;

export type PatchableField = (typeof PATCHABLE)[number];
export type Patch = Partial<Pick<OpportunityDetail, PatchableField>>;

export type Override = {
  rawItemId: number;
  suppressed: boolean;
  featured: boolean;
  patch: Patch;
};

export type OverrideRow = {
  raw_item_id: number;
  suppressed?: boolean | null;
  featured?: boolean | null;
  patch?: unknown;
};

const FIELDS = new Set<string>(PATCHABLE);

/** Keep only the keys staff may set, and only ones carrying a real value.
 *  Applied on read as well as on write: a patch stored before a field was
 *  removed from PATCHABLE must not keep being honoured. */
export function cleanPatch(raw: unknown): Patch {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!FIELDS.has(k)) continue;
    /* null is meaningful — it is how staff clear a field the scraper filled
     * with something wrong. undefined is just an absent key. */
    if (v === undefined) continue;
    out[k] = v;
  }
  return out as Patch;
}

export function toOverride(row: OverrideRow): Override {
  return {
    rawItemId: row.raw_item_id,
    suppressed: Boolean(row.suppressed),
    featured: Boolean(row.featured),
    patch: cleanPatch(row.patch),
  };
}

/** Index a set of override rows by the listing they belong to. */
export function overrideIndex(rows: OverrideRow[] | null | undefined): Map<number, Override> {
  const m = new Map<number, Override>();
  for (const r of rows ?? []) {
    if (typeof r?.raw_item_id !== "number") continue;
    m.set(r.raw_item_id, toOverride(r));
  }
  return m;
}

/** Apply one override to one projected listing. Returns the listing unchanged
 *  when there is nothing to apply, so the common case allocates nothing. */
export function applyOverride(o: OpportunityDetail, ov: Override | undefined): OpportunityDetail {
  if (!ov) return o;
  const keys = Object.keys(ov.patch);
  if (keys.length === 0) return o;
  return { ...o, ...ov.patch };
}

/** The student-facing feed: corrections applied, suppressed listings gone.
 *
 *  Suppression is a filter here rather than a `delete` in the database because
 *  the scraper would simply find a deleted listing again on its next run and
 *  put it straight back. "Removed" has to be a fact we record, not an absence. */
export function applyOverrides(
  items: OpportunityDetail[],
  index: Map<number, Override>,
): OpportunityDetail[] {
  if (index.size === 0) return items;
  const out: OpportunityDetail[] = [];
  for (const it of items) {
    const ov = index.get(it.id);
    if (ov?.suppressed) continue;
    out.push(applyOverride(it, ov));
  }
  return out;
}

/** Ids a feed query must exclude. Used where filtering in SQL is cheaper than
 *  fetching rows only to drop them. */
export function suppressedIds(index: Map<number, Override>): number[] {
  const out: number[] = [];
  for (const [id, ov] of index) if (ov.suppressed) out.push(id);
  return out;
}

/** Featured listings keep their order but come first. Staff pin a listing
 *  because it matters this week, and burying it under the match score would
 *  defeat the point. */
export function featuredFirst(
  items: OpportunityDetail[],
  index: Map<number, Override>,
): OpportunityDetail[] {
  if (index.size === 0) return items;
  const hit: OpportunityDetail[] = [];
  const rest: OpportunityDetail[] = [];
  for (const it of items) (index.get(it.id)?.featured ? hit : rest).push(it);
  return hit.length ? [...hit, ...rest] : items;
}
