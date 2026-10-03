/* The draft a staff member is editing, and the few helpers the preview needs.
 *
 * Every field is a string because every field is an input; `levels` is the one
 * multi-select and is kept as an array. The same shape goes to /api/desk/publish,
 * so what is previewed is what is published. */

export type Draft = {
  title: string; url: string; summary: string; deadline: string; deadlineKind: string;
  type: string; country: string; funding: string; duration: string;
  amountValue: string; amountCurrency: string;
  eligibility: string; benefits: string; howToApply: string; documents: string; applyLink: string;
  levels: string[];
};

export const BLANK: Draft = {
  title: "", url: "", summary: "", deadline: "", deadlineKind: "", type: "", country: "",
  funding: "", duration: "", amountValue: "", amountCurrency: "", eligibility: "", benefits: "",
  howToApply: "", documents: "", applyLink: "", levels: [],
};

export const TYPES = [
  "scholarship", "fellowship", "internship", "research_internship", "grant", "summer_school",
  "competition", "award", "training", "exchange", "other",
];
export const LEVELS = [
  { value: "bachelors", label: "Bachelor's" },
  { value: "masters", label: "Master's" },
  { value: "phd", label: "PhD" },
  { value: "postdoc", label: "Postdoc" },
  { value: "any", label: "Any level" },
];
export const FUNDING = ["fully_funded", "partially_funded", "tuition_waiver", "stipend", "paid"];

export function typeLabel(t: string): string {
  if (!t) return "";
  return t.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

/* Dates are compared as YYYY-MM-DD STRINGS, never as Date objects.
 *
 * The portal renders for Dubai and runs on UTC, so a Date round-trip moves the
 * day by one for four hours out of every twenty-four — which is how a deadline
 * ends up reading "closes today" on the day after it closed. The desk shares
 * that hazard and therefore shares the rule. */
export function todayInDubai(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai" }).format(new Date());
}

export function deadlineState(deadline: string): { label: string | null; soon: boolean; urgent: boolean } {
  const d = (deadline ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return { label: null, soon: false, urgent: false };
  const today = todayInDubai();
  if (d < today) return { label: "Closed", soon: false, urgent: true };
  if (d === today) return { label: "Closes today", soon: false, urgent: true };
  /* Day difference from the string parts, so no Date and no timezone. */
  const days = Math.round(
    (Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) -
      Date.UTC(+today.slice(0, 4), +today.slice(5, 7) - 1, +today.slice(8, 10))) / 86_400_000,
  );
  if (days <= 7) return { label: `${days} day${days === 1 ? "" : "s"} left`, soon: false, urgent: true };
  if (days <= 30) return { label: `${days} days left`, soon: true, urgent: false };
  return { label: `Closes ${d}`, soon: false, urgent: false };
}
