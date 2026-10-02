/* Matching a student to opportunities.
 *
 * WHAT THIS IS, PLAINLY. A transparent weighted scorer, not a trained model.
 * There is no labelled data here — nobody has recorded which students applied
 * to what, let alone which applications succeeded — so there is nothing to
 * train on and nothing to validate against. Calling it "trained" or
 * "battle-tested" would be a claim this repository cannot support.
 *
 * What it is instead is EXPLAINABLE and AUDITABLE: every point a listing
 * scores is attributable to one rule, the UI shows the student exactly which
 * rules fired, and the weights are in one table that can be argued with. For
 * a few hundred listings and a six-field profile that is a better product than
 * an opaque score, and it is honest about its own limits.
 *
 * It also knows what it does NOT know. `gaps()` reports the facts missing from
 * the profile that would most improve the match, so the UI can ask for them
 * rather than silently scoring badly. That is the "minimum KPIs" idea: a score
 * below CONFIDENCE_FLOOR is reported as low-confidence, not dressed up as a
 * recommendation.
 *
 * Two honest limits in the DATA, not the algorithm:
 *   - no source publishes a field of study, so subject matching works off the
 *     title and summary text, which is weaker than it looks
 *   - more than half the listings name no country, so a country preference
 *     can only ever reward a match, never penalise a blank
 */

import { daysUntil } from "./format";
import { fundingBucket } from "./query";
import type { OpportunitySummary } from "./types";

export type StudentProfile = {
  level: string;
  fields: string;
  countries: string;
  funding: string;
  graduation: string;
  /* Collected at onboarding. Not used by the scorer — they identify the
   * student and address them, they do not predict fit — but they are here so
   * one type describes the whole profile. */
  name?: string;
  degree?: string;
  course?: string;
  phone?: string;
  email?: string;
  year?: string;
};

/* The weights. One table, deliberately summing to 100 so a score reads as a
 * percentage without a second normalisation step that would hide the shape. */
export const WEIGHTS = {
  level: 34,
  field: 26,
  funding: 18,
  country: 12,
  timing: 10,
} as const;

/** Below this, the UI must present the result as uncertain rather than as a fit. */
export const CONFIDENCE_FLOOR = 0.5;

export type Reason = {
  factor: keyof typeof WEIGHTS;
  label: string;
  /** Points awarded out of that factor's weight. */
  points: number;
  of: number;
  /** True when the listing simply did not say, rather than disagreeing. */
  unknown?: boolean;
};

export type MatchResult = {
  /** 0–100. */
  score: number;
  reasons: Reason[];
  /** Share of the weight that could actually be judged, 0–1. */
  confidence: number;
};

const words = (v: string | undefined): string[] =>
  (v ?? "")
    .toLowerCase()
    .split(/[,;/|]+|\s{2,}/)
    .map((x) => x.trim())
    .filter((x) => x.length > 2);

const LEVEL_ORDER = ["bachelors", "masters", "phd", "postdoc"];

export function score(item: OpportunitySummary, profile: StudentProfile): MatchResult {
  const reasons: Reason[] = [];
  let judged = 0;

  /* --- degree level. The hardest constraint: a PhD fellowship is not a
   * near-miss for an undergraduate, it is a wrong answer. */
  {
    const w = WEIGHTS.level;
    const mine = profile.level;
    const theirs = item.levels.map((l) => l.toLowerCase());
    if (!mine) {
      reasons.push({ factor: "level", label: "Your degree level is not set", points: 0, of: w, unknown: true });
    } else if (!theirs.length) {
      /* Half credit, not zero: an unstated level usually means open to all,
       * and penalising silence would bury listings for having less metadata. */
      judged += w * 0.5;
      reasons.push({ factor: "level", label: "Level not stated by the source", points: Math.round(w * 0.5), of: w, unknown: true });
    } else if (theirs.includes(mine) || theirs.includes("any")) {
      judged += w;
      reasons.push({ factor: "level", label: `Open to ${mine === "any" ? "any level" : mine}`, points: w, of: w });
    } else {
      /* One step up is worth something to a final-year student; two is not. */
      const mineAt = LEVEL_ORDER.indexOf(mine);
      const near = theirs.some((t) => Math.abs(LEVEL_ORDER.indexOf(t) - mineAt) === 1 && mineAt >= 0);
      const pts = near ? Math.round(w * 0.3) : 0;
      judged += pts;
      reasons.push({
        factor: "level",
        label: near ? "One level above you — worth a look if you are graduating" : "Not open to your level",
        points: pts,
        of: w,
      });
    }
  }

  /* --- field of study. Text matching, because no source publishes a field. */
  {
    const w = WEIGHTS.field;
    const mine = words(profile.fields);
    if (!mine.length) {
      reasons.push({ factor: "field", label: "Your fields are not set", points: 0, of: w, unknown: true });
    } else {
      const hay = `${item.title ?? ""} ${item.summary ?? ""} ${item.fields.join(" ")}`.toLowerCase();
      const hits = mine.filter((t) => hay.includes(t));
      if (hits.length) {
        /* Diminishing returns: two matching terms is much better than one,
         * four is not twice as good as two. */
        const pts = Math.round(w * Math.min(1, 0.6 + 0.4 * (hits.length - 1)));
        judged += pts;
        reasons.push({ factor: "field", label: `Mentions ${hits.slice(0, 3).join(", ")}`, points: pts, of: w });
      } else {
        reasons.push({ factor: "field", label: "No mention of your fields", points: 0, of: w });
      }
    }
  }

  /* --- funding. */
  {
    const w = WEIGHTS.funding;
    const want = profile.funding;
    const got = fundingBucket(item.funding);
    if (!want) {
      reasons.push({ factor: "funding", label: "No funding preference set", points: 0, of: w, unknown: true });
    } else if (got === "unspecified") {
      judged += w * 0.4;
      reasons.push({ factor: "funding", label: "Funding not stated by the source", points: Math.round(w * 0.4), of: w, unknown: true });
    } else if (want === got) {
      judged += w;
      reasons.push({ factor: "funding", label: "Matches the funding you need", points: w, of: w });
    } else if (want === "partially_funded" || got === "fully_funded") {
      /* Fully funded always clears a lesser requirement. */
      judged += w;
      reasons.push({ factor: "funding", label: "Fully funded — clears your requirement", points: w, of: w });
    } else {
      judged += Math.round(w * 0.25);
      reasons.push({ factor: "funding", label: "Some funding, but not what you asked for", points: Math.round(w * 0.25), of: w });
    }
  }

  /* --- country. Rewards a match; never penalises a listing for not saying,
   * because 243 of 431 do not. */
  {
    const w = WEIGHTS.country;
    const mine = words(profile.countries);
    if (!mine.length) {
      reasons.push({ factor: "country", label: "No country preference set", points: 0, of: w, unknown: true });
    } else if (!item.country) {
      judged += w * 0.5;
      reasons.push({ factor: "country", label: "Country not stated by the source", points: Math.round(w * 0.5), of: w, unknown: true });
    } else {
      const c = item.country.toLowerCase();
      const hit = mine.some((m) => c.includes(m) || m.includes(c));
      const pts = hit ? w : 0;
      judged += pts;
      reasons.push({
        factor: "country",
        label: hit ? `In ${item.country}` : `In ${item.country}, which is not on your list`,
        points: pts,
        of: w,
      });
    }
  }

  /* --- timing. Enough runway to actually apply. A deadline in three days is
   * a worse match than the same listing a month out, for the same student. */
  {
    const w = WEIGHTS.timing;
    const d = daysUntil(item.deadline);
    if (d == null) {
      judged += w * 0.7;
      reasons.push({ factor: "timing", label: "Rolling — apply when you are ready", points: Math.round(w * 0.7), of: w });
    } else if (d >= 21) {
      judged += w;
      reasons.push({ factor: "timing", label: `${d} days to prepare`, points: w, of: w });
    } else if (d >= 7) {
      judged += Math.round(w * 0.6);
      reasons.push({ factor: "timing", label: `Only ${d} days to prepare`, points: Math.round(w * 0.6), of: w });
    } else {
      judged += Math.round(w * 0.2);
      reasons.push({ factor: "timing", label: `Closing in ${d} day${d === 1 ? "" : "s"}`, points: Math.round(w * 0.2), of: w });
    }
  }

  /* Confidence is the share of the weight the profile let us judge at all —
   * so a sparse profile produces a low-confidence score rather than a
   * confidently wrong one. */
  const answerable = reasons.filter((r) => !(r.unknown && r.points === 0)).reduce((n, r) => n + r.of, 0);
  const total = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);

  return {
    score: Math.round(judged),
    reasons: reasons.sort((a, b) => b.points - a.points),
    confidence: answerable / total,
  };
}

export type Gap = { field: keyof StudentProfile; label: string; worth: number; why: string };

/** What is missing, worst first — the "minimum we need from you" prompt. */
export function gaps(profile: StudentProfile): Gap[] {
  const out: Gap[] = [];
  if (!profile.level)
    out.push({
      field: "level",
      label: "Your degree level",
      worth: WEIGHTS.level,
      why: "The single biggest factor. Without it we cannot tell a PhD fellowship from an undergraduate internship.",
    });
  if (!profile.fields.trim())
    out.push({
      field: "fields",
      label: "The fields you work in",
      worth: WEIGHTS.field,
      why: "Matched against each listing's title and description, since no source publishes a field of study.",
    });
  if (!profile.funding)
    out.push({
      field: "funding",
      label: "The funding you need",
      worth: WEIGHTS.funding,
      why: "Separates fully funded places from ones that expect you to cover living costs.",
    });
  if (!profile.countries.trim())
    out.push({
      field: "countries",
      label: "Countries you would go to",
      worth: WEIGHTS.country,
      why: "Only ever used to promote a match — a listing is never penalised for not naming a country.",
    });
  return out.sort((a, b) => b.worth - a.worth);
}

/** Weight of everything still unanswered, as a share of the total. */
export function missingWeight(profile: StudentProfile): number {
  const total = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);
  return gaps(profile).reduce((n, g) => n + g.worth, 0) / total;
}

export function rank(items: OpportunitySummary[], profile: StudentProfile) {
  return items
    .map((item) => ({ item, ...score(item, profile) }))
    .sort((a, b) => b.score - a.score || (a.item.deadline ?? "9").localeCompare(b.item.deadline ?? "9"));
}
