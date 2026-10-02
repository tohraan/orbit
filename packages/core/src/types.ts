/* The wire shape the browser receives.
 *
 * Deliberately long-named, unlike the one- and two-letter keys in
 * ui/opportunities.json. That file is served whole (738 kB) so its keys were
 * squeezed; this API sends one page of 24 at a time, so readability is free.
 * lib/project.ts owns the translation between the two. */

export type Money = {
  currency: string | null;
  value: number;
  period: string | null;
  raw: string | null;
};

/** What a card needs. Never includes the long detail prose. */
export type OpportunitySummary = {
  id: number;
  title: string;
  url: string;
  /** Source registry slug, e.g. `opportunities_circle`. */
  sourceSlug: string;
  /** The source's own id for this row. Needed to address a college listing
   *  for deletion; null on rows read from the offline snapshot, which does
   *  not carry it. */
  externalId: string | null;
  sourceName: string;
  /** 1 = tier-1 funder, 3 = aggregator. Null when the registry has no tier. */
  sourceTier: number | null;
  /** Bare hostname, www stripped. Shown so the student can judge provenance. */
  host: string | null;
  /** When the source published it. Null for sources that do not say. */
  postedAt: string | null;
  /** When our index first saw it. Always present. */
  indexedAt: string | null;
  deadline: string | null;
  deadlineKind: string | null;
  deadlineNote: string | null;
  type: string | null;
  levels: string[];
  country: string | null;
  funding: string | null;
  duration: string | null;
  /** The headline figure, when the page stated one. */
  amount: Money | null;
  summary: string | null;
  fields: string[];
  hasDetail: boolean;
};

/** Everything on the detail page. */
export type OpportunityDetail = OpportunitySummary & {
  amounts: Money[];
  applyLink: string | null;
  eligibility: string | null;
  benefits: string | null;
  howToApply: string | null;
  documents: string | null;
  image: string | null;
};

export type FacetBucket = { value: string; label: string; count: number };

export type Facets = {
  type: FacetBucket[];
  country: FacetBucket[];
  funding: FacetBucket[];
  level: FacetBucket[];
  source: FacetBucket[];
  field: FacetBucket[];
};

export type ListResponse = {
  items: OpportunitySummary[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  /** `live` = read from Supabase this request; `snapshot` = the committed file. */
  origin: "live" | "snapshot";
  /** ISO timestamp of the newest row in the whole index, for "updated X ago". */
  freshestAt: string | null;
};

export type Stats = {
  total: number;
  withDeadline: number;
  closingIn30: number;
  closingIn7: number;
  withAmount: number;
  rolling: number;
  sources: number;
  origin: "live" | "snapshot";
  freshestAt: string | null;
};
