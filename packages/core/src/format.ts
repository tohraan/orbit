/* Presentation helpers. Shared by server and client, so nothing here touches
 * the filesystem, the network, or process.env. */

import type { Money, OpportunitySummary } from "./types";

/* ---------------------------------------------------------------- dates ---
 * A deadline is a plain calendar date ("2026-10-18"), not an instant. Turning
 * it into a Date and subtracting is how you get an off-by-one for every viewer
 * whose clock is not UTC -- which is every intended viewer, since the campus is
 * in Dubai (UTC+4). So both sides are reduced to a day number first: the
 * deadline from its own digits, today from the viewer's LOCAL calendar. */

const dayNumber = (y: number, m: number, d: number) => Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);

export function todayDayNumber(now: Date = new Date()): number {
  return dayNumber(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

export function deadlineDayNumber(iso: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return null;
  return dayNumber(Number(m[1]), Number(m[2]), Number(m[3]));
}

/** Whole days from the viewer's today to the deadline. Negative = past. */
export function daysUntil(iso: string | null, now?: Date): number | null {
  if (!iso) return null;
  const d = deadlineDayNumber(iso);
  if (d == null) return null;
  return d - todayDayNumber(now);
}

export type DeadlineTone = "urgent" | "soon" | "normal" | "expired" | "rolling" | "unknown";

export type DeadlineState = {
  tone: DeadlineTone;
  /** Short form for a card chip: "3 days left", "Oct 18", "Rolling". */
  label: string;
  /** Long form for a detail page: "Thursday, 18 October 2026". */
  full: string | null;
  days: number | null;
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function shortDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const [, y, mo, d] = m;
  const thisYear = new Date().getFullYear();
  const label = `${MONTHS[Number(mo) - 1]} ${Number(d)}`;
  return Number(y) === thisYear ? label : `${label} ${y}`;
}

function longDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  /* Noon UTC, so no timezone can roll the weekday back a day. */
  const dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12));
  return dt.toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/* Urgency bands. The design system says not to shout red at every approaching
 * date (design-ieee.md §33): danger is for genuinely urgent or expired only. */
export function deadlineState(o: Pick<OpportunitySummary, "deadline" | "deadlineKind">, now?: Date): DeadlineState {
  if (!o.deadline) {
    const rolling = o.deadlineKind === "rolling" || o.deadlineKind === "open";
    return rolling
      ? { tone: "rolling", label: "Rolling", full: null, days: null }
      : { tone: "unknown", label: "Deadline not specified", full: null, days: null };
  }
  const days = daysUntil(o.deadline, now);
  const full = longDate(o.deadline);
  if (days == null) return { tone: "unknown", label: "Deadline not specified", full: null, days: null };
  if (days < 0) return { tone: "expired", label: "Expired", full, days };
  if (days === 0) return { tone: "urgent", label: "Closes today", full, days };
  if (days === 1) return { tone: "urgent", label: "1 day left", full, days };
  if (days <= 7) return { tone: "urgent", label: `${days} days left`, full, days };
  if (days <= 30) return { tone: "soon", label: `${days} days left`, full, days };
  return { tone: "normal", label: shortDate(o.deadline), full, days };
}

/** "Updated 2 days ago". design-ieee.md §72: freshness only where it decides. */
export function relativeTime(iso: string | null, now: Date = new Date()): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const mins = Math.round((now.getTime() - t) / 60_000);
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins} minutes ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? "" : "s"} ago`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  const mo = Math.round(days / 30);
  if (mo < 12) return `${mo} month${mo === 1 ? "" : "s"} ago`;
  return `${Math.round(mo / 12)} year${mo < 24 ? "" : "s"} ago`;
}

/* --------------------------------------------------------------- labels ---
 * The database stores lowercase snake_case hints straight off the source page
 * ("research_internship", "fully_funded", "usa"). None of it is display copy. */

export function titleCase(v: string | null | undefined): string | null {
  if (!v) return null;
  return v
    .replace(/[_-]+/g, " ")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\b([a-z])/g, (_, c: string) => c.toUpperCase());
}

const COUNTRY_OVERRIDES: Record<string, string> = {
  usa: "United States",
  us: "United States",
  uk: "United Kingdom",
  uae: "United Arab Emirates",
  "south korea": "South Korea",
  "new zealand": "New Zealand",
  "saudi arabia": "Saudi Arabia",
  "hong kong": "Hong Kong",
};

export function countryLabel(v: string | null): string {
  if (!v) return "Location not specified";
  const key = v.replace(/[_-]+/g, " ").trim().toLowerCase();
  return COUNTRY_OVERRIDES[key] ?? (titleCase(v) as string);
}

const LEVEL_LABELS: Record<string, string> = {
  bachelors: "Bachelor's",
  masters: "Master's",
  phd: "PhD",
  postdoc: "Postdoc",
  any: "Any level",
};

export const levelLabel = (v: string) => LEVEL_LABELS[v] ?? (titleCase(v) as string);

export const typeLabel = (v: string | null) => titleCase(v) ?? "Opportunity";

export const fundingLabel = (v: string | null) => titleCase(v) ?? "Funding not specified";

/** Tier badge copy. The registry's authority_tier is 1 (funder) to 3 (aggregator). */
export function tierLabel(tier: number | null): string | null {
  if (tier === 1) return "Primary funder";
  if (tier === 2) return "National agency";
  if (tier === 3) return "Aggregator";
  return null;
}

/* --------------------------------------------------------------- money ---- */

export function formatMoney(m: Money | null, currency = m?.currency ?? null, value = m?.value ?? null): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  const code = (currency ?? "").toUpperCase();
  const digits = value >= 1000 ? 0 : 2;
  const num = value.toLocaleString(undefined, {
    minimumFractionDigits: value % 1 === 0 ? 0 : digits,
    maximumFractionDigits: digits,
  });
  const body = code ? `${code} ${num}` : num;
  const per = m?.period ? periodSuffix(m.period) : null;
  return per ? `${body} ${per}` : body;
}

function periodSuffix(period: string): string | null {
  const p = period.toLowerCase();
  if (/month/.test(p)) return "/ month";
  if (/year|annum|annual/.test(p)) return "/ year";
  if (/week/.test(p)) return "/ week";
  if (/total|once|one.?off/.test(p)) return "total";
  return null;
}
