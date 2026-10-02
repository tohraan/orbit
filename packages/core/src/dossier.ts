/* The Dossier's reading half: turning a document's text into claims a student
 * can accept or reject.
 *
 * THE RULE THIS FILE EXISTS TO ENFORCE. A term is only worth showing if it can
 * change a result. The matcher scores `fields` against each listing's title and
 * summary (match.ts), and in this corpus `fieldsOfStudy` is empty on every
 * record — so a term extracted from a CV that appears in NO listing cannot move
 * a single ranking, however impressive it looks on screen. Extracting
 * "Kubernetes" from a resume and showing it back is theatre.
 *
 * So every candidate is scored for REACH against the live index before it is
 * offered, the reach is shown next to it, and a term with no reach is not
 * offered at all. That is also why the vocabulary is curated rather than
 * harvested from the documents themselves: free-text n-grams out of a CV
 * produce "university", "experience" and "project" — terms that match
 * everything and therefore rank nothing.
 *
 * Nothing here touches the DOM or the filesystem, so it is testable in node.
 */

/* ---------------------------------------------------------------- kinds --- */

export const DOC_KINDS = ["cv", "transcript", "certificate", "sop", "reference", "identity", "other"] as const;
export type DocKind = (typeof DOC_KINDS)[number];

export const DOC_KIND_LABELS: Record<DocKind, string> = {
  cv: "CV or résumé",
  transcript: "Transcript or marksheet",
  certificate: "Certificate",
  sop: "Statement of purpose",
  reference: "Reference letter",
  identity: "Passport or ID",
  other: "Other",
};

/* What each kind is usually asked for, so the empty state can tell a student
 * what to gather rather than presenting an empty box and a plus sign. */
export const DOC_KIND_WHY: Record<DocKind, string> = {
  cv: "Asked for by almost every scholarship and fellowship.",
  transcript: "Nearly always required, and the slowest to obtain from admin.",
  certificate: "Proof of the awards and courses a CV only claims.",
  sop: "Usually rewritten per application — keep the strongest version here.",
  reference: "Often needed in a sealed or signed form; start early.",
  identity: "Needed for visas and for most international applications.",
  other: "Anything else an application has asked you for.",
};

export type ParseStatus = "pending" | "parsed" | "no_text" | "unsupported" | "failed" | "stored";

/* ----------------------------------------------------------- vocabulary --- */

/* Curated, and deliberately about SUBJECTS rather than skills: the corpus is
 * scholarship and fellowship prose, which names disciplines ("engineering",
 * "public health") and not tools ("React", "SPSS"). Aliases exist so a CV
 * saying "ML" or "A.I." reaches the same term the listings use. */
type Entry = { term: string; aliases: string[] };

const VOCAB: Entry[] = [
  { term: "artificial intelligence", aliases: ["a.i.", "machine learning", "deep learning", "neural network"] },
  { term: "computer science", aliases: ["computing", "software engineering", "computer engineering"] },
  { term: "data science", aliases: ["data analytics", "big data", "data engineering"] },
  { term: "robotics", aliases: ["mechatronics", "autonomous systems"] },
  { term: "engineering", aliases: [] },
  { term: "mechanical engineering", aliases: ["thermodynamics", "fluid mechanics"] },
  { term: "electrical engineering", aliases: ["electronics", "power systems", "vlsi", "embedded systems"] },
  { term: "civil engineering", aliases: ["structural engineering", "geotechnical"] },
  { term: "chemical engineering", aliases: ["process engineering"] },
  { term: "biotechnology", aliases: ["bioengineering", "biomedical", "genomics", "bioinformatics"] },
  { term: "materials", aliases: ["materials science", "nanotechnology", "metallurgy", "polymer"] },
  { term: "renewable energy", aliases: ["solar", "photovoltaic", "wind energy", "clean energy"] },
  { term: "sustainability", aliases: ["sustainable development", "circular economy"] },
  { term: "climate", aliases: ["climate change", "environmental science", "decarbonisation", "decarbonization"] },
  { term: "physics", aliases: ["astrophysics", "quantum", "photonics", "optics"] },
  { term: "chemistry", aliases: ["biochemistry", "organic chemistry"] },
  { term: "mathematics", aliases: ["applied mathematics", "statistics", "mathematical modelling"] },
  { term: "medicine", aliases: ["clinical", "medical sciences", "pharmacology"] },
  { term: "public health", aliases: ["epidemiology", "global health"] },
  { term: "economics", aliases: ["econometrics", "development economics"] },
  { term: "business", aliases: ["management", "entrepreneurship", "finance", "marketing"] },
  { term: "law", aliases: ["legal studies", "human rights law"] },
  { term: "education", aliases: ["pedagogy", "teaching"] },
  { term: "agriculture", aliases: ["agronomy", "food security", "crop science"] },
  { term: "water", aliases: ["hydrology", "water resources", "sanitation"] },
  { term: "architecture", aliases: ["urban planning", "built environment"] },
  { term: "social sciences", aliases: ["sociology", "anthropology", "political science"] },
  { term: "psychology", aliases: ["cognitive science", "behavioural science", "behavioral science"] },
  { term: "design", aliases: ["industrial design", "human-computer interaction"] },
  { term: "journalism", aliases: ["media studies", "communications"] },
];

/* ------------------------------------------------------- pdf text items --- */

/* Rebuilding lines from a PDF's text items.
 *
 * pdf.js hands back a flat array of positioned fragments, and the obvious
 * thing — join them with spaces — produces one enormous line. That quietly
 * breaks two things at once: section headers stop being their own line, so
 * "EDUCATION" is no longer strippable and every CV reports Education as its
 * strongest subject; and the sentence quoted back as evidence becomes whatever
 * 160 characters happen to surround the match, which for the first item on the
 * page is the student's name and email rather than a claim about their work.
 *
 * Every item carries `hasEOL`, which is exactly the signal needed. This lives
 * in core rather than in the browser reader so the same code that ships is the
 * code the tests run against a real PDF.
 */
export type PdfTextItem = { str?: string; hasEOL?: boolean };

export function textFromItems(items: PdfTextItem[]): string {
  let out = "";
  for (const it of items) {
    out += it.str ?? "";
    if (it.hasEOL) out += "\n";
    else if (!/\s$/.test(out)) out += " ";
  }
  return out
    .split("\n")
    .map((l) => l.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");
}

/** The haystack the matcher itself scores against — kept identical on purpose. */
export function listingHaystack(item: { title?: string | null; summary?: string | null; fields?: string[] }): string {
  return `${item.title ?? ""} ${item.summary ?? ""} ${(item.fields ?? []).join(" ")}`.toLowerCase();
}

/**
 * How many listings each vocabulary term actually reaches.
 *
 * Computed from the live index rather than hardcoded, because reach is a
 * property of today's corpus: a term that reached forty listings last term may
 * reach none now, and showing a stale number would be worse than showing none.
 */
export function reachIndex(items: { title?: string | null; summary?: string | null; fields?: string[] }[]): Map<string, number> {
  const hay = items.map(listingHaystack);
  const out = new Map<string, number>();
  for (const { term } of VOCAB) {
    let n = 0;
    for (const h of hay) if (h.includes(term)) n++;
    out.set(term, n);
  }
  return out;
}

/* ----------------------------------------------------------- extraction --- */

export type TermHit = {
  term: string;
  /** The sentence it was found in, so the student can judge the claim. */
  evidence: string;
  /** Listings this term currently appears in. 0 means it cannot change a rank. */
  reach: number;
  /** Which spelling actually appeared, when it was an alias rather than the term. */
  matched: string;
};

export type LevelHit = { value: string; evidence: string };

export type Extraction = {
  terms: TermHit[];
  level: LevelHit | null;
  graduation: string | null;
  chars: number;
};

/* Sentence splitting that does not break on "M.Sc." or "Ph.D." — the two
 * abbreviations most likely to appear in exactly the sentence we want to quote.
 * Shares its intent with ScanText's splitter but not its code: that one is a
 * React renderer, this one returns strings. */
function sentences(text: string): string[] {
  const guarded = text
    .replace(/\b([A-Z])\.(?=[A-Z]\.)/g, "$1\u0001")
    .replace(/\b(M|B|Ph|D|Sc|Tech|Eng|St|Mr|Mrs|Ms|Dr|Prof|vs|etc|e\.g|i\.e)\.(?=\s)/gi, "$1\u0001");
  return guarded
    .split(/(?<=[.!?])\s+|\n+/)
    .map((x) => x.replace(/\u0001/g, ".").replace(/\s+/g, " ").trim())
    .filter((x) => x.length > 1);
}

/* Section headers are not claims.
 *
 * Every CV ever written has a line reading "EDUCATION", and "education" is a
 * real subject in the vocabulary with real reach — so without this, every
 * single document would report that the student studies Education, sorted to
 * the top because the term is common in the corpus. The same trap waits for
 * "DESIGN", "BUSINESS" and "LANGUAGES".
 *
 * A header is a short line that names a section rather than saying something:
 * few words, no sentence-ending punctuation, and either shouted or followed by
 * a colon. Dropping those lines from the haystack costs nothing — a document
 * that genuinely concerns education says so in a sentence somewhere too.
 */
function stripHeaders(text: string): string {
  return text
    .split(/\n/)
    .filter((line) => {
      const t = line.trim();
      if (!t || t.length > 40) return true;
      const words = t.replace(/[:\u2014-]+$/, "").trim().split(/\s+/);
      if (words.length > 4) return true;
      if (/[.!?,;]$/.test(t)) return true;
      const letters = t.replace(/[^A-Za-z]/g, "");
      const shouted = letters.length > 1 && letters === letters.toUpperCase();
      return !(shouted || /:$/.test(t));
    })
    .join("\n");
}

/** A quotable fragment: long enough to judge, short enough to read. */
function snippet(sentence: string, max = 160): string {
  const s = sentence.trim();
  return s.length <= max ? s : `${s.slice(0, max - 1).replace(/\s+\S*$/, "")}…`;
}

const LEVELS: { value: string; patterns: RegExp[] }[] = [
  { value: "phd", patterns: [/\bph\.?\s?d\b/i, /\bdoctoral\b/i, /\bdoctorate\b/i] },
  { value: "masters", patterns: [/\bm\.?\s?sc\b/i, /\bm\.?\s?tech\b/i, /\bmaster'?s?\b/i, /\bm\.?\s?eng\b/i, /\bmba\b/i, /\bm\.?\s?a\b/i] },
  { value: "bachelors", patterns: [/\bb\.?\s?e\b/i, /\bb\.?\s?tech\b/i, /\bbachelor'?s?\b/i, /\bb\.?\s?sc\b/i, /\bbba\b/i, /\bundergraduate\b/i] },
];

/**
 * Read a document's text into reviewable claims.
 *
 * `reach` decides what is worth offering, so the caller passes the index built
 * from the live corpus. A term the corpus never mentions is dropped here rather
 * than filtered in the UI — if it cannot change a result, it is not a finding.
 */
export function extract(text: string, reach: Map<string, number>): Extraction {
  const clean = text.replace(/\u0000/g, " ").replace(/[ \t]+/g, " ");
  /* Subject terms are matched against the prose only. The level and date
   * patterns below still read `clean`, because "EDUCATION" as a header is
   * noise but "B.E. Computer Science" under it is exactly what we want. */
  const prose = stripHeaders(clean);
  const lower = prose.toLowerCase();
  const sents = sentences(prose);
  const allSents = sentences(clean);

  /* --- subject terms --- */
  const terms: TermHit[] = [];
  for (const { term, aliases } of VOCAB) {
    const r = reach.get(term) ?? 0;
    /* Cannot move a ranking, so it is not offered. Showing it would be a
     * promise the matcher cannot keep. */
    if (r === 0) continue;

    const needles = [term, ...aliases];
    const found = needles.find((n) => lower.includes(n));
    if (!found) continue;

    const ev = sents.find((x) => x.toLowerCase().includes(found));
    terms.push({ term, matched: found, reach: r, evidence: ev ? snippet(ev) : "" });
  }
  /* Most reach first: the terms likeliest to change what the student sees. */
  terms.sort((a, b) => b.reach - a.reach || a.term.localeCompare(b.term));

  /* --- degree level. Highest wins: a CV naming both a BE and an MSc is a
   * master's student, and ranking them as an undergraduate would be wrong. */
  let level: LevelHit | null = null;
  for (const { value, patterns } of LEVELS) {
    const p = patterns.find((re) => re.test(clean));
    if (!p) continue;
    const ev = allSents.find((x) => p.test(x));
    level = { value, evidence: ev ? snippet(ev) : "" };
    break;
  }

  /* --- expected graduation. Only a plausible year, and only in the future or
   * the recent past; a CV is full of dates and most of them are not this. */
  let graduation: string | null = null;
  const now = new Date().getFullYear();
  const m = clean.match(/\b(?:expected|graduat\w*|completion)\b[^.\n]{0,40}?\b(20\d{2})\b/i);
  if (m) {
    const y = Number(m[1]);
    if (y >= now - 1 && y <= now + 8) graduation = m[1];
  }

  return { terms, level, graduation, chars: clean.length };
}

/** Merge confirmed terms into the profile's comma-separated `fields`. */
export function mergeFields(existing: string, add: string[]): string {
  const have = existing
    .split(",")
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
  const out = existing.trim() ? existing.split(",").map((x) => x.trim()).filter(Boolean) : [];
  for (const t of add) if (!have.includes(t.toLowerCase())) out.push(t);
  return out.join(", ");
}
