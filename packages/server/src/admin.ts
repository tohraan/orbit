/* Validating and shaping a desk-written listing, on its way into raw_items.
 *
 * The name is now the only thing left of the old shared-token admin route.
 * What survives is the part that was never about authentication: turning a
 * staff member's form into a row the index can hold, with every field checked
 * here rather than trusted from the browser.
 *
 * Two of the three guards that used to be listed here still apply and still
 * matter:
 *
 *   1. Writes are pinned to source_slug = 'college_desk'. The caller cannot
 *      name a source, so this path cannot forge a row attributed to UKRI or
 *      overwrite a scraped listing.
 *   2. Every field is validated and length-bounded here, not in the form,
 *      because the form is not the only thing that can call this.
 *
 * The third was a bearer token compared in constant time, and it is gone with
 * the route it guarded. Authentication is requireStaff() in staff.ts now,
 * which asks the database who the caller is — the thing a shared string could
 * never answer, and the reason the desk replaced it.
 */

import "server-only";

export type AdminInput = {
  title: string;
  url: string;
  summary?: string;
  deadline?: string | null;
  type?: string | null;
  levels?: string[];
  country?: string | null;
  funding?: string | null;
  duration?: string | null;
  amountValue?: number | null;
  amountCurrency?: string | null;
  eligibility?: string;
  benefits?: string;
  howToApply?: string;
  documents?: string;
  applyLink?: string | null;
  addedBy?: string;
};

export type AdminError = { field: string; message: string };

const LEVELS = new Set(["bachelors", "masters", "phd", "postdoc", "any"]);
const TYPES = new Set([
  "scholarship", "fellowship", "internship", "research_internship", "grant",
  "summer_school", "competition", "award", "training", "exchange",
  "assistantship", "conference", "other",
]);
const CURRENCIES = /^[A-Z]{3}$/;

const text = (v: unknown, n: number): string | null => {
  if (typeof v !== "string") return null;
  const t = v.replace(/\s+/g, " ").trim().slice(0, n);
  return t || null;
};

/** Only http(s), and never a javascript: or data: URL dressed as a link. */
function safeUrl(v: unknown): string | null {
  const raw = text(v, 2000);
  if (!raw) return null;
  try {
    const u = new URL(raw);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

/** A real calendar date, and not one in the past — db/014 rows follow the same
 *  rule as every other listing: expired means gone. */
function validDeadline(v: unknown): { value: string | null; error?: string } {
  const raw = text(v, 10);
  if (!raw) return { value: null };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return { value: null, error: "Use the format YYYY-MM-DD." };
  const [y, m, d] = raw.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) {
    return { value: null, error: "That date does not exist." };
  }
  const today = new Date();
  const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  if (dt.getTime() < todayUtc) return { value: null, error: "That deadline has already passed." };
  return { value: raw };
}

export function validate(body: unknown): { input: AdminInput; errors: AdminError[] } {
  const b = (body ?? {}) as Record<string, unknown>;
  const errors: AdminError[] = [];

  const title = text(b.title, 240);
  if (!title) errors.push({ field: "title", message: "A title is required." });
  if (title && title.length < 6) errors.push({ field: "title", message: "That title is too short to be useful." });

  const url = safeUrl(b.url);
  if (!url) errors.push({ field: "url", message: "A valid http(s) link to the official page is required." });

  const dl = validDeadline(b.deadline);
  if (dl.error) errors.push({ field: "deadline", message: dl.error });

  const type = text(b.type, 40)?.toLowerCase() ?? null;
  if (type && !TYPES.has(type)) errors.push({ field: "type", message: "Unknown opportunity type." });

  const levels = Array.isArray(b.levels)
    ? [...new Set(b.levels.filter((l): l is string => typeof l === "string" && LEVELS.has(l)))]
    : [];

  const amountCurrency = text(b.amountCurrency, 3)?.toUpperCase() ?? null;
  if (amountCurrency && !CURRENCIES.test(amountCurrency)) {
    errors.push({ field: "amountCurrency", message: "Use a three-letter code such as USD or AED." });
  }
  const amountValue =
    b.amountValue == null || b.amountValue === "" ? null : Number(b.amountValue);
  if (amountValue != null && (!Number.isFinite(amountValue) || amountValue <= 0)) {
    errors.push({ field: "amountValue", message: "An amount must be a positive number." });
  }
  if (amountValue != null && !amountCurrency) {
    errors.push({ field: "amountCurrency", message: "An amount needs a currency." });
  }

  const applyLink = b.applyLink ? safeUrl(b.applyLink) : null;
  if (b.applyLink && !applyLink) errors.push({ field: "applyLink", message: "That is not a valid http(s) link." });

  return {
    input: {
      title: title ?? "",
      url: url ?? "",
      summary: text(b.summary, 400) ?? undefined,
      deadline: dl.value,
      type,
      levels,
      country: text(b.country, 60)?.toLowerCase() ?? null,
      funding: text(b.funding, 40)?.toLowerCase() ?? null,
      duration: text(b.duration, 60),
      amountValue,
      amountCurrency,
      eligibility: text(b.eligibility, 4000) ?? undefined,
      benefits: text(b.benefits, 4000) ?? undefined,
      howToApply: text(b.howToApply, 4000) ?? undefined,
      documents: text(b.documents, 2000) ?? undefined,
      applyLink,
      addedBy: text(b.addedBy, 80) ?? undefined,
    },
    errors,
  };
}

/** The raw_items row shape, so packages/core's projection reads it unchanged. */
export function toRow(input: AdminInput, externalId: string) {
  const now = new Date().toISOString();
  return {
    source_slug: "college_desk",
    external_id: externalId,
    url: input.url,
    payload: {
      title: input.title,
      url: input.url,
      summary: input.summary ?? null,
      plain_summary: input.summary ?? null,
      type_hint: input.type,
      level_hints: input.levels ?? [],
      country_hint: input.country,
      funding_hint: input.funding,
      duration: input.duration,
      deadline_kind: input.deadline ? "fixed" : "unknown",
      source_published_at: now,
      source_name: "BITS Pilani Dubai",
      /* Recorded for the audit trail. A shared token means this is whatever the
       * person typed, not a verified identity — see the note at the top. */
      added_by: input.addedBy ?? "staff",
      added_at: now,
    },
    detail: {
      eligibility: input.eligibility ?? null,
      benefits: input.benefits ?? null,
      how_to_apply: input.howToApply ?? null,
      documents: input.documents ?? null,
      apply_link: input.applyLink,
      duration: input.duration,
      funding_kind: input.funding,
      amounts:
        input.amountValue && input.amountCurrency
          ? [{ amount: input.amountValue, currency: input.amountCurrency, period: null, raw: null }]
          : [],
    },
    deadline: input.deadline ?? null,
    deadline_kind: input.deadline ? "fixed" : "unknown",
    content_hash: externalId,
    needs_detail: false,
    detail_fetched_at: now,
    last_seen_at: now,
  };
}

/* authorised() lived here: a constant-time bearer check against ADMIN_TOKEN.
   It went with handlers/admin.ts. Every write now goes through requireStaff()
   in staff.ts, which asks the database who the caller is instead of whether
   they hold a shared string — the whole point of the desk replacing it. */

/** Idempotent upsert, per CLAUDE.md: on_conflict + merge-duplicates. */
export async function writeRow(row: ReturnType<typeof toRow>): Promise<void> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error("supabase not configured");
  const res = await fetch(
    `${url.replace(/\/+$/, "")}/rest/v1/raw_items?on_conflict=source_slug,external_id`,
    {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "content-type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify([row]),
      cache: "no-store",
    },
  );
  if (!res.ok) throw new Error(`supabase write ${res.status}`);
}

/* deleteRow() lived here. It was the old screen's "remove", which deleted the
   raw_items row outright — and W01 would re-upsert it on the next scrape, so a
   deletion lasted until the scraper next ran and then silently came back. The
   desk suppresses instead (db/020), which is why that function has no caller
   left to serve. */
