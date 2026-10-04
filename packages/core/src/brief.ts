/* The AI brief: one opportunity, as facts plus an instruction, on a clipboard.
 *
 * WHY THIS EXISTS. Students already paste these pages into an AI and ask "is
 * this for me?". What they paste is a scraped web page — navigation, cookie
 * banner, sixteen cards for other opportunities — and what they get back is a
 * confident answer built partly on the wrong listing. The index already holds
 * this one parsed and separated. Handing over the parsed version, with its
 * gaps named, is strictly better than letting them hand over the page.
 *
 * It is deliberately NOT Rover. Rover answers inside the portal, on our key,
 * against the whole index. This is for the student who is already in a chat
 * with their own AI and is not going to move. Those are different moments and
 * the same student has both.
 *
 * THE THREE RULES THE PROMPT ENFORCES, and why each is here:
 *
 *   1. Say what is missing. §105 forbids implying data that does not exist. An
 *      LLM handed a record with no eligibility section will write a plausible
 *      eligibility section, and the student cannot tell which sentence was
 *      invented. So absent fields are listed BY NAME as unknown rather than
 *      omitted — an omitted field looks like one that was never relevant.
 *   2. Interview before advising. The whole question is "is this for ME", which
 *      is unanswerable without knowing the person. If the student has filled in
 *      a profile here, it is included. If they have not, the prompt makes the
 *      AI ask first and names the questions worth asking, so it asks about
 *      eligibility and timing rather than their hobbies.
 *   3. Send them to the source. This index is a scraper, and scrapers are
 *      wrong sometimes — 122 listings here once carried another programme's
 *      application instructions. The brief carries the official URL and says
 *      the page wins on any conflict.
 *
 * Pure and dependency-free so it can be unit-tested and so the desk could
 * preview exactly what a student copies.
 */

import type { OpportunityDetail } from "./types";
import { countryLabel, formatMoney, titleCase } from "./format";

/** What the portal knows about the student. Every field optional: the profile
 *  is skippable by design, and a half-filled one is still worth sending. */
export type BriefProfile = {
  level?: string;
  fields?: string;
  countries?: string;
  funding?: string;
  graduation?: string;
  degree?: string;
  course?: string;
  year?: string;
};

export type BriefOptions = {
  /** Today, ISO. Passed in rather than read, so the output is testable. */
  today?: string;
  /** The canonical URL of this listing on the portal. */
  permalink?: string;
};

const LABEL: Record<string, string> = {
  fully_funded: "Fully funded",
  partially_funded: "Partially funded",
  unfunded: "Unfunded",
  unknown: "Not stated",
};

const DEADLINE_KIND: Record<string, string> = {
  fixed: "a fixed date",
  rolling: "rolling — applications are accepted continuously",
  varies: "varies by stream or country",
  unknown: "not stated on the page",
};

function daysBetween(fromISO: string, toISO: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fromISO) || !/^\d{4}-\d{2}-\d{2}$/.test(toISO)) return null;
  const a = Date.UTC(+fromISO.slice(0, 4), +fromISO.slice(5, 7) - 1, +fromISO.slice(8, 10));
  const b = Date.UTC(+toISO.slice(0, 4), +toISO.slice(5, 7) - 1, +toISO.slice(8, 10));
  return Math.round((b - a) / 86_400_000);
}

/* A section of prose off a scraped page. Collapsed, trimmed and capped: the
 * whole brief has to survive being pasted into a chat box, and a 9,000-word
 * eligibility page helps nobody. The cap is marked when it bites, because
 * silently truncated text is a fact the reader cannot see is partial. */
function prose(value: string | null | undefined, limit = 1200): string | null {
  if (!value) return null;
  const clean = value.replace(/\s+/g, " ").trim();
  if (!clean) return null;
  return clean.length <= limit ? clean : `${clean.slice(0, limit).trimEnd()}… [truncated]`;
}

/** The facts half: what the index holds, labelled, with nothing inferred. */
export function briefFacts(o: OpportunityDetail, options: BriefOptions = {}): string {
  const lines: string[] = [];
  const missing: string[] = [];

  const add = (key: string, value: string | null | undefined) => {
    if (value) lines.push(`- ${key}: ${value}`);
    else missing.push(key);
  };

  lines.push(`- Title: ${o.title}`);
  add("Type", titleCase(o.type));
  add("Study level", o.levels.length ? o.levels.map((l) => titleCase(l)).filter(Boolean).join(", ") : null);
  add("Field", o.fields.length ? o.fields.map((f) => titleCase(f)).filter(Boolean).join(", ") : null);
  /* countryLabel, not titleCase: the index stores "usa" and "uk", and a
     brief that says "Usa" reads as machine output nobody checked. */
  add("Country / location", o.country ? countryLabel(o.country) : null);
  add("Duration", o.duration);

  /* Funding is two facts that are easy to conflate: the KIND (is it funded at
     all) and the AMOUNT (how much). A listing often states one and not the
     other, and "Fully funded" with no figure is not the same claim as
     "EUR 2,500 per month". */
  add("Funding", o.funding ? (LABEL[o.funding] ?? titleCase(o.funding) ?? null) : null);
  const amounts = (o.amounts?.length ? o.amounts : o.amount ? [o.amount] : [])
    .map((m) => formatMoney(m))
    .filter((x): x is string => Boolean(x));
  add("Stated amount", amounts.length ? amounts.join("; ") : null);

  if (o.deadline) {
    const kind = DEADLINE_KIND[o.deadlineKind ?? "unknown"] ?? o.deadlineKind;
    const days = options.today ? daysBetween(options.today, o.deadline) : null;
    const left =
      days == null ? "" : days < 0 ? " — ALREADY PASSED" : days === 0 ? " — closes today" : ` — ${days} days away`;
    lines.push(`- Deadline: ${o.deadline} (${kind})${left}`);
  } else {
    const kind = o.deadlineKind && o.deadlineKind !== "unknown" ? DEADLINE_KIND[o.deadlineKind] : null;
    if (kind) lines.push(`- Deadline: no single date — ${kind}`);
    else missing.push("Deadline");
  }
  if (o.deadlineNote) lines.push(`- Deadline note: ${o.deadlineNote}`);

  lines.push(`- Source: ${o.sourceName}${o.host ? ` (${o.host})` : ""}`);
  lines.push(`- Official page: ${o.applyLink || o.url}`);
  if (options.permalink) lines.push(`- Portal listing: ${options.permalink}`);

  const sections: [string, string | null][] = [
    ["Summary", prose(o.summary, 600)],
    ["Eligibility", prose(o.eligibility)],
    ["What it covers", prose(o.benefits)],
    ["How to apply", prose(o.howToApply)],
    ["Documents needed", prose(o.documents)],
  ];

  let out = `## The opportunity\n\n${lines.join("\n")}`;

  for (const [heading, body] of sections) {
    if (body) out += `\n\n### ${heading}\n${body}`;
    else missing.push(heading);
  }

  /* Named, not omitted. This is the line that stops the model inventing an
     eligibility rule and the student believing it. */
  if (missing.length) {
    out += `\n\n### Not known\nThe index has no value for these, because the source page did not state them in a form that could be read: ${missing.join(
      ", ",
    )}. Treat each as unknown. Do not guess what they would say.`;
  }

  return out;
}

/** The student half: what we know about them, or an instruction to find out. */
export function briefProfile(p: BriefProfile | null | undefined): string {
  const rows: string[] = [];
  const push = (k: string, v?: string) => {
    const t = (v ?? "").trim();
    if (t) rows.push(`- ${k}: ${t}`);
  };

  push("Degree level", titleCase(p?.level) ?? "");
  push("Programme", [p?.degree, p?.course].filter((x) => (x ?? "").trim()).join(" — "));
  push("Year of study", p?.year);
  push("Expected graduation", p?.graduation);
  push("Fields of interest", p?.fields);
  push("Preferred countries", p?.countries);
  push("Funding needed", titleCase(p?.funding) ?? "");

  if (!rows.length) {
    return (
      "## About me\n\n" +
      "Nothing has been shared about me yet, so you do not know whether this fits.\n" +
      "Do not assume. Start by asking me the questions in step 1."
    );
  }

  return (
    "## About me\n\n" +
    `${rows.join("\n")}\n\n` +
    "This came from a short profile and is almost certainly incomplete. " +
    "Ask about anything in step 1 that it does not already answer."
  );
}

/* The instruction. Written as the student's own words to the assistant,
 * because that is what it is: text they paste and send as their message.
 *
 * The order is load-bearing — interview, then verdict, then plan. An assistant
 * that answers first and asks afterwards has already anchored the student on a
 * verdict it had no basis for. */
export const BRIEF_INSTRUCTION = `## What I want from you

I am deciding whether to spend my time applying to this. Work in three steps and do not skip step 1.

**Step 1 — interview me first.** Ask me the questions below that the "About me" section does not already answer. Ask them in one message, numbered, and then stop and wait for my reply. Do not give a verdict yet.

1. Eligibility: my nationality, where I study now, my degree level and year, and my grades — do I actually qualify?
2. Timing: what else is due around the deadline, and how many hours I realistically have before it.
3. Materials: what this application is likely to require and whether I already have it — especially anything that needs another person (references, transcripts, a supervisor's agreement). If the documents are not listed above, say what applications like this normally ask for and mark it clearly as your expectation, not as a fact from the listing.
4. Money: whether the funding stated here would actually cover my costs, and what I would have to find elsewhere.
5. Intent: what I want out of this — the money, the institution, the research, the move abroad, the line on my CV — and what I would turn down to take it.

**Step 2 — then give me a straight verdict.** One of: strong fit, worth applying, weak fit, or not eligible. Lead with that, then give me your three strongest reasons. If something in my answers rules me out, say so plainly in the first line and do not soften it — a clear no now is worth more to me than a maybe.

**Step 3 — if it is worth applying, give me the plan.** A checklist of what to prepare, in the order I should do it, with dates counted back from the deadline. Flag anything that depends on another person first, because that is what runs out of time.

Rules for all three steps:
- Use only the facts above. Anything under "Not known" is genuinely unknown — say so rather than filling it in. If a fact would change your verdict, ask me to check the official page for it.
- The official page wins over anything here. This came from an automated index and it can be out of date or wrong.
- Do not pad. I would rather have six honest sentences than two pages.`;

/** The whole thing: facts, student, instruction. */
export function buildBrief(
  o: OpportunityDetail,
  profile: BriefProfile | null | undefined,
  options: BriefOptions = {},
): string {
  return [
    `# ${o.title}`,
    "",
    briefFacts(o, options),
    "",
    briefProfile(profile),
    "",
    BRIEF_INSTRUCTION,
  ].join("\n");
}
