/* Row -> wire-shape projection.
 *
 * Two inputs end up as the same OpportunityDetail:
 *
 *   fromRawItem()  a Supabase `raw_items` row joined to its `sources` entry.
 *   fromSnapshot() a record out of ../ui/opportunities.json, whose keys are
 *                  one or two letters (see scripts/build-ui-data.mjs).
 *
 * Keep the two in step. They are the only places in the app that know about
 * the database's column names, so everything downstream reads one shape. */

import type { Money, OpportunityDetail } from "./types";

const clean = (v: unknown, n: number): string | null => {
  if (v == null) return null;
  const s = String(v).replace(/\s+/g, " ").trim().slice(0, n);
  return s || null;
};

/* _lib_html.js:extractAmounts() emits {raw, amount, period, currency}. Anything
 * that reads {c, v, p} instead silently renders blank -- that shipped once and
 * hid a figure on 95 of 431 rows. Both spellings are accepted here on purpose. */
export function money(m: unknown): Money | null {
  if (!m || typeof m !== "object") return null;
  const o = m as Record<string, unknown>;
  const value = Number(o.amount ?? o.v);
  if (!Number.isFinite(value) || value <= 0) return null;
  return {
    currency: (o.currency ?? o.c ?? null) as string | null,
    value,
    period: (o.period ?? o.p ?? null) as string | null,
    raw: clean(o.raw, 40),
  };
}

const host = (u: string | null): string | null => {
  if (!u) return null;
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
};

const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && !!x.trim()) : [];

export type RawItem = {
  id: number;
  source_slug: string;
  external_id?: string | null;
  url: string | null;
  payload: Record<string, unknown> | null;
  detail: Record<string, unknown> | null;
  deadline: string | null;
  deadline_kind: string | null;
  first_seen_at: string | null;
};

export type SourceRow = {
  slug: string;
  name: string | null;
  authority_tier: number | null;
  config: Record<string, unknown> | null;
};

export function fromRawItem(r: RawItem, src: SourceRow | undefined): OpportunityDetail {
  const p = r.payload ?? {};
  const d = r.detail ?? {};
  const url = r.url ?? (p.url as string) ?? "";
  const amounts = (Array.isArray(d.amounts) ? d.amounts : []).map(money).filter((m): m is Money => !!m);
  const eligibility = clean(d.eligibility, 4000);
  const applyLink = (d.apply_link as string) ?? null;
  return {
    id: r.id,
    title: clean(p.title, 240) ?? "Untitled opportunity",
    url,
    sourceSlug: r.source_slug,
    externalId: r.external_id ?? null,
    sourceName: src?.name ?? r.source_slug,
    sourceTier: src?.authority_tier ?? null,
    host: host(url),
    postedAt: (p.source_published_at as string) ?? null,
    indexedAt: r.first_seen_at ?? null,
    deadline: r.deadline ?? null,
    deadlineKind: r.deadline_kind ?? (p.deadline_kind as string) ?? null,
    deadlineNote: clean(d.deadline_note ?? p.deadline_note, 160),
    type: (p.type_hint as string) ?? null,
    levels: strings(p.level_hints),
    country: (p.country_hint as string) ?? (p.city as string) ?? null,
    funding: (d.funding_kind as string) ?? (p.funding_hint as string) ?? null,
    duration: clean(d.duration ?? p.duration, 60),
    amount: money(d.stipend) ?? money(p.amount) ?? amounts[0] ?? null,
    amounts: amounts.slice(0, 6),
    summary: clean(d.description ?? p.plain_summary ?? p.summary, 400),
    fields: strings(p.fields_of_study),
    applyLink,
    eligibility,
    benefits: clean(d.benefits, 4000),
    howToApply: clean(d.how_to_apply, 4000),
    documents: clean(d.documents, 2000),
    image: (d.image_url as string) ?? (p.image_url as string) ?? null,
    hasDetail: Boolean(eligibility || applyLink),
  };
}

export type SnapshotRecord = Record<string, unknown>;

export function fromSnapshot(r: SnapshotRecord): OpportunityDetail {
  const amounts = (Array.isArray(r.am) ? r.am : []).map(money).filter((m): m is Money => !!m);
  const eligibility = clean(r.el, 4000);
  const applyLink = (r.ap as string) ?? null;
  return {
    id: Number(r.i),
    title: clean(r.t, 240) ?? "Untitled opportunity",
    url: (r.u as string) ?? "",
    sourceSlug: (r.s as string) ?? "unknown",
    externalId: (r.x as string) ?? null,
    sourceName: (r.sn as string) ?? (r.s as string) ?? "Unknown source",
    sourceTier: typeof r.st === "number" ? r.st : null,
    host: (r.h as string) ?? host((r.u as string) ?? null),
    postedAt: (r.pa as string) ?? null,
    indexedAt: (r.fi as string) ?? null,
    deadline: (r.d as string) ?? null,
    deadlineKind: (r.dk as string) ?? null,
    deadlineNote: clean(r.dn, 160),
    type: (r.ty as string) ?? null,
    levels: strings(r.lv),
    country: (r.c as string) ?? null,
    funding: (r.f as string) ?? null,
    duration: clean(r.du, 60),
    amount: money(r.a) ?? amounts[0] ?? null,
    amounts: amounts.slice(0, 6),
    summary: clean(r.g, 400),
    fields: strings(r.fs),
    applyLink,
    eligibility,
    benefits: clean(r.bn, 4000),
    howToApply: clean(r.ht, 4000),
    documents: clean(r.dc, 2000),
    image: (r.im as string) ?? null,
    hasDetail: Boolean(eligibility || applyLink),
  };
}

/** Drop the long prose: a card never needs it, and 431 of them is 700 kB. */
export function toSummary(o: OpportunityDetail) {
  const {
    amounts: _amounts,
    applyLink: _applyLink,
    eligibility: _eligibility,
    benefits: _benefits,
    howToApply: _howToApply,
    documents: _documents,
    image: _image,
    ...summary
  } = o;
  return summary;
}
