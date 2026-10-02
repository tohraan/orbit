/* Query validation, filtering, sorting, faceting.
 *
 * Filtering happens in memory over a 431-row array, so there is no SQL and no
 * injection surface -- but every parameter is still whitelisted and bounded,
 * because the remaining risk is a caller asking for work: an unbounded
 * pageSize, a 2 MB search string, a thousand repeated filter values. Anything
 * unrecognised is dropped silently rather than echoed back.
 *
 * It also normalises the source data's vocabulary. The scrapers record funding
 * exactly as the page wrote it, so the index holds "fully_funded" AND
 * "fully funded", "partial funded" AND "partially_funded". A student filtering
 * for fully funded opportunities must get all 155 of them, not the 96 that
 * happened to use an underscore. */

import { daysUntil, countryLabel, levelLabel, titleCase, typeLabel } from "./format";
import { toAed } from "./fx";
import { hashSeed, mixedOrder } from "./shuffle";
import type { Facets, OpportunityDetail, OpportunitySummary } from "./types";

/* 120 rather than 48 so the Deadlines screen can fetch a whole range in one
 * request: the timeline band and the list below it are rendered from the SAME
 * response, which is what guarantees they cannot disagree about what falls in
 * the window. Only 111 listings carry a date at all, so this is a ceiling the
 * data cannot exceed, and a summary row is ~700 bytes -- a full page is ~80 kB.
 * The Explore grid still pages in CHUNK-sized batches. */
export const MAX_PAGE_SIZE = 120;
/* 12, not 24: the grid is three columns, so a chunk is four rows — about one
 * screen — and the next chunk arrives before the student reaches the bottom.
 * The whole index is 431 rows and ~740 kB; sending it at once was the single
 * biggest thing standing between a cold visit and a usable page. */
export const DEFAULT_PAGE_SIZE = 12;
const MAX_QUERY_CHARS = 120;
const MAX_VALUES_PER_FILTER = 12;

export const SORTS = ["deadline", "newest", "updated", "relevance", "amount", "mixed"] as const;
export type Sort = (typeof SORTS)[number];

export const DEADLINE_WINDOWS = ["any", "d7", "d30", "d90", "d180", "dated", "rolling"] as const;
export type DeadlineWindow = (typeof DEADLINE_WINDOWS)[number];

export const REQUIREMENTS = ["detail", "amount", "apply"] as const;
export type Requirement = (typeof REQUIREMENTS)[number];

/** Canonical funding buckets. The raw values are messier than this. */
export const FUNDING_BUCKETS = [
  "fully_funded",
  "partially_funded",
  "tuition_waiver",
  "stipend",
  "paid",
  "unspecified",
] as const;
export type FundingBucket = (typeof FUNDING_BUCKETS)[number];

export function fundingBucket(raw: string | null): FundingBucket {
  if (!raw) return "unspecified";
  const v = raw.toLowerCase().replace(/[_-]+/g, " ").trim();
  if (v === "unknown" || !v) return "unspecified";
  if (/^fully\s*funded/.test(v)) return "fully_funded";
  if (/partial/.test(v)) return "partially_funded";
  if (/tuition/.test(v)) return "tuition_waiver";
  if (/stipend/.test(v)) return "stipend";
  if (/paid/.test(v)) return "paid";
  return "unspecified";
}

export const FUNDING_LABELS: Record<FundingBucket, string> = {
  fully_funded: "Fully funded",
  partially_funded: "Partially funded",
  tuition_waiver: "Tuition covered",
  stipend: "Stipend",
  paid: "Paid",
  unspecified: "Funding not specified",
};

export type Query = {
  q: string;
  /** An explicit id set, for the Saved / Compare / Applications screens. */
  ids: number[];
  type: string[];
  country: string[];
  funding: FundingBucket[];
  level: string[];
  source: string[];
  tier: number[];
  deadline: DeadlineWindow;
  requires: Requirement[];
  sort: Sort;
  /** Stabilises `sort=mixed` for one visitor. Not a secret and not an identity. */
  seed: string;
  page: number;
  pageSize: number;
};

/* ------------------------------------------------------------- parsing --- */

const list = (sp: URLSearchParams, key: string): string[] => {
  const seen = new Set<string>();
  for (const raw of sp.getAll(key)) {
    for (const part of raw.split(",")) {
      const v = part.trim().toLowerCase();
      /* Bound the alphabet as well as the length: these values only ever come
       * from our own facet lists, so anything with punctuation is not ours. */
      if (v && v.length <= 48 && /^[a-z0-9 _.-]+$/.test(v)) seen.add(v);
      if (seen.size >= MAX_VALUES_PER_FILTER) break;
    }
  }
  return [...seen];
};

const int = (sp: URLSearchParams, key: string, fallback: number, min: number, max: number): number => {
  const n = Number.parseInt(sp.get(key) ?? "", 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
};

const oneOf = <T extends string>(sp: URLSearchParams, key: string, allowed: readonly T[], fallback: T): T => {
  const v = (sp.get(key) ?? "").trim().toLowerCase() as T;
  return allowed.includes(v) ? v : fallback;
};

export function parseQuery(sp: URLSearchParams): Query {
  return {
    q: (sp.get("q") ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_QUERY_CHARS),
    /* `ids` lets a screen resolve a stored selection in one request instead of
     * paging the whole index looking for four rows. Bounded at 60: the saved
     * list is capped at 500 client-side, and a screen that needs more than a
     * page of them should be paginating, not asking for all of them at once. */
    ids: (sp.get("ids") ?? "")
      .split(",")
      .map((v) => Number.parseInt(v.trim(), 10))
      .filter((n) => Number.isInteger(n) && n > 0)
      .slice(0, 60),
    type: list(sp, "type"),
    country: list(sp, "country"),
    funding: list(sp, "funding").filter((v): v is FundingBucket =>
      (FUNDING_BUCKETS as readonly string[]).includes(v),
    ),
    level: list(sp, "level"),
    source: list(sp, "source"),
    tier: list(sp, "tier")
      .map((v) => Number.parseInt(v, 10))
      .filter((n) => n === 1 || n === 2 || n === 3),
    deadline: oneOf(sp, "deadline", DEADLINE_WINDOWS, "any"),
    requires: list(sp, "requires").filter((v): v is Requirement =>
      (REQUIREMENTS as readonly string[]).includes(v),
    ),
    sort: oneOf(sp, "sort", SORTS, "deadline"),
    /* Opaque to the server: it is hashed, never stored, never logged, and the
     * client generates it per browser session. Bounded and alphabet-checked
     * like every other parameter. */
    seed: (sp.get("seed") ?? "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64),
    page: int(sp, "page", 1, 1, 500),
    pageSize: int(sp, "pageSize", DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE),
  };
}

/* ------------------------------------------------------------ filtering --- */

const haystack = (o: OpportunityDetail): string =>
  [o.title, o.summary, o.country, o.type, o.sourceName, o.host, o.funding, ...o.levels, ...o.fields]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

/** Every word in the query must appear somewhere. AND, not OR -- two words
 *  narrowing to nothing is a clearer answer than ranking 300 loose matches. */
function matchesText(o: OpportunityDetail, terms: string[]): boolean {
  if (!terms.length) return true;
  const hay = haystack(o);
  return terms.every((t) => hay.includes(t));
}

function matchesWindow(o: OpportunityDetail, w: DeadlineWindow): boolean {
  if (w === "any") return true;
  if (w === "rolling") return !o.deadline;
  if (w === "dated") return !!o.deadline;
  const days = daysUntil(o.deadline);
  if (days == null || days < 0) return false;
  if (w === "d7") return days <= 7;
  if (w === "d30") return days <= 30;
  if (w === "d90") return days <= 90;
  /* d180 covers the whole dated index: the furthest deadline is 164 days out. */
  return days <= 180;
}

function matchesRequirement(o: OpportunityDetail, r: Requirement): boolean {
  if (r === "detail") return o.hasDetail;
  if (r === "amount") return !!o.amount;
  return !!o.applyLink;
}

export function filter(items: OpportunityDetail[], q: Query): OpportunityDetail[] {
  const terms = q.q ? q.q.toLowerCase().split(" ").filter(Boolean) : [];
  const typeSet = new Set(q.type);
  const countrySet = new Set(q.country);
  const fundingSet = new Set<string>(q.funding);
  const levelSet = new Set(q.level);
  const sourceSet = new Set(q.source);
  const tierSet = new Set(q.tier);

  const idSet = q.ids.length ? new Set(q.ids) : null;

  return items.filter((o) => {
    if (idSet && !idSet.has(o.id)) return false;
    if (typeSet.size && !(o.type && typeSet.has(o.type.toLowerCase()))) return false;
    if (countrySet.size && !(o.country && countrySet.has(o.country.toLowerCase()))) return false;
    if (fundingSet.size && !fundingSet.has(fundingBucket(o.funding))) return false;
    if (levelSet.size && !o.levels.some((l) => levelSet.has(l.toLowerCase()))) return false;
    if (sourceSet.size && !sourceSet.has(o.sourceSlug.toLowerCase())) return false;
    if (tierSet.size && !(o.sourceTier != null && tierSet.has(o.sourceTier))) return false;
    if (!matchesWindow(o, q.deadline)) return false;
    for (const r of q.requires) if (!matchesRequirement(o, r)) return false;
    return matchesText(o, terms);
  });
}

/* -------------------------------------------------------------- sorting --- */

const time = (iso: string | null): number => (iso ? Date.parse(iso) || 0 : 0);

/* Amounts are only comparable on one scale, so sorting by size means sorting
 * by dirhams. A figure in a currency the rate table does not carry sorts as 0
 * rather than being guessed at. */
const aed = (o: OpportunityDetail): number =>
  o.amount ? (toAed(o.amount.value, o.amount.currency) ?? 0) : 0;

/** Relevance: title hits beat body hits, then the soonest deadline wins. */
function relevanceScore(o: OpportunityDetail, terms: string[]): number {
  if (!terms.length) return 0;
  const title = (o.title ?? "").toLowerCase();
  let score = 0;
  for (const t of terms) {
    if (title.startsWith(t)) score += 6;
    else if (title.includes(t)) score += 4;
    else if ((o.summary ?? "").toLowerCase().includes(t)) score += 1;
  }
  return score;
}

export function sort(items: OpportunityDetail[], q: Query): OpportunityDetail[] {
  const out = [...items];
  const terms = q.q ? q.q.toLowerCase().split(" ").filter(Boolean) : [];
  const byDeadline = (a: OpportunityDetail, b: OpportunityDetail) =>
    (a.deadline ? 0 : 1) - (b.deadline ? 0 : 1) || String(a.deadline).localeCompare(String(b.deadline));

  /* `mixed` reorders the whole result set rather than the current page, so
   * chunk 2 can never repeat a card from chunk 1. See lib/shuffle.ts. */
  if (q.sort === "mixed") return mixedOrder(out, (o) => daysUntil(o.deadline), hashSeed(q.seed || "anonymous"));

  if (q.sort === "newest") out.sort((a, b) => time(b.postedAt) - time(a.postedAt) || byDeadline(a, b));
  else if (q.sort === "updated") out.sort((a, b) => time(b.indexedAt) - time(a.indexedAt) || byDeadline(a, b));
  else if (q.sort === "amount") out.sort((a, b) => aed(b) - aed(a) || byDeadline(a, b));
  else if (q.sort === "relevance")
    out.sort((a, b) => relevanceScore(b, terms) - relevanceScore(a, terms) || byDeadline(a, b));
  else out.sort(byDeadline);

  return out;
}

/* ------------------------------------------------------------- faceting --- */

function bucketCounts(
  items: OpportunityDetail[],
  pick: (o: OpportunityDetail) => (string | null)[],
  label: (v: string) => string,
  limit = 40,
) {
  const counts = new Map<string, number>();
  for (const o of items) {
    for (const v of pick(o)) {
      if (!v) continue;
      const key = v.toLowerCase();
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([value, count]) => ({ value, label: label(value), count }));
}

/* Facets are counted over the WHOLE index, not the filtered result. Counting
 * them post-filter zeroes every option the student has not already chosen,
 * which reads as "there is nothing else" when there are 400 other rows. */
export function facets(items: OpportunityDetail[]): Facets {
  return {
    type: bucketCounts(items, (o) => [o.type], (v) => typeLabel(v)),
    country: bucketCounts(items, (o) => [o.country], (v) => countryLabel(v)),
    funding: FUNDING_BUCKETS.map((b) => ({
      value: b,
      label: FUNDING_LABELS[b],
      count: items.filter((o) => fundingBucket(o.funding) === b).length,
    })).filter((b) => b.count > 0),
    level: bucketCounts(items, (o) => o.levels, (v) => levelLabel(v), 12),
    source: bucketCounts(items, (o) => [o.sourceSlug], (v) => {
      const hit = items.find((o) => o.sourceSlug.toLowerCase() === v);
      return hit?.sourceName ?? (titleCase(v) as string);
    }, 20),
    /* fields_of_study is populated by none of the six live sources. An empty
     * facet list is how the UI knows to leave the control out entirely,
     * rather than offering a filter that can only ever return nothing. */
    field: bucketCounts(items, (o) => o.fields, (v) => titleCase(v) as string, 20),
  };
}

export function page<T>(items: T[], q: Query) {
  const pageCount = Math.max(1, Math.ceil(items.length / q.pageSize));
  const current = Math.min(q.page, pageCount);
  const start = (current - 1) * q.pageSize;
  return { slice: items.slice(start, start + q.pageSize), page: current, pageCount };
}

/** Does this query actually constrain anything? Drives the empty-state copy. */
export function isFiltered(q: Query): boolean {
  return Boolean(
    q.q ||
      q.ids.length ||
      q.type.length ||
      q.country.length ||
      q.funding.length ||
      q.level.length ||
      q.source.length ||
      q.tier.length ||
      q.requires.length ||
      q.deadline !== "any",
  );
}

export type { OpportunitySummary };
