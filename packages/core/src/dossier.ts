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

/* Aliases are not a nicety here, they are the whole mechanism.
 *
 * A real CV from this campus said "AI" thirteen times, "LLM" four and "NLP"
 * once, and never once wrote "artificial intelligence" or "machine learning".
 * Against the old list it matched neither — the single loudest thing on the
 * page was invisible. People write the short form; the corpus often writes the
 * long one; the vocabulary has to span both or it reads nothing.
 */
const VOCAB: Entry[] = [
  { term: "artificial intelligence", aliases: ["ai", "a.i.", "machine learning", "ml", "deep learning", "neural network", "llm", "large language model", "generative ai", "genai", "nlp", "natural language processing", "computer vision", "agentic"] },
  { term: "computer science", aliases: ["computing", "software engineering", "computer engineering", "software development", "programming", "algorithms", "data structures", "computer architecture", "operating systems", "compilers"] },
  { term: "data science", aliases: ["data analytics", "big data", "data engineering", "data mining", "analytics", "statistical modelling", "statistical modeling"] },
  { term: "software", aliases: ["saas", "web development", "full stack", "fullstack", "backend", "front end", "frontend", "api", "rest api", "microservices", "devops", "cloud computing"] },
  { term: "cybersecurity", aliases: ["cyber security", "cryptography", "information security", "infosec", "penetration testing", "network security"] },
  { term: "robotics", aliases: ["mechatronics", "autonomous systems", "control systems", "embedded systems"] },
  { term: "engineering", aliases: [] },
  { term: "mechanical engineering", aliases: ["thermodynamics", "fluid mechanics", "cad", "manufacturing", "mechanical design"] },
  { term: "electrical engineering", aliases: ["electronics", "power systems", "vlsi", "signal processing", "circuits", "microelectronics"] },
  { term: "civil engineering", aliases: ["structural engineering", "geotechnical", "construction"] },
  { term: "chemical engineering", aliases: ["process engineering", "petrochemical"] },
  { term: "biotechnology", aliases: ["bioengineering", "biomedical", "genomics", "bioinformatics", "molecular biology", "biology"] },
  { term: "materials", aliases: ["materials science", "nanotechnology", "metallurgy", "polymer", "composites", "semiconductor"] },
  { term: "renewable energy", aliases: ["solar", "photovoltaic", "wind energy", "clean energy", "energy storage", "hydrogen"] },
  { term: "sustainability", aliases: ["sustainable development", "circular economy", "net zero", "esg"] },
  { term: "climate", aliases: ["climate change", "environmental science", "decarbonisation", "decarbonization", "emissions"] },
  { term: "physics", aliases: ["astrophysics", "quantum", "photonics", "optics", "astronomy"] },
  { term: "chemistry", aliases: ["biochemistry", "organic chemistry", "analytical chemistry"] },
  { term: "mathematics", aliases: ["applied mathematics", "statistics", "mathematical modelling", "discrete mathematics", "linear algebra", "optimisation", "optimization"] },
  { term: "medicine", aliases: ["clinical", "medical sciences", "pharmacology", "healthcare", "nursing"] },
  { term: "public health", aliases: ["epidemiology", "global health", "health policy"] },
  { term: "economics", aliases: ["econometrics", "development economics", "macroeconomics"] },
  { term: "finance", aliases: ["fintech", "trading", "investment", "banking", "financial modelling", "accounting", "capital markets"] },
  { term: "business", aliases: ["management", "entrepreneurship", "marketing", "consulting", "entrepreneurship", "startup", "b2b", "crm"] },
  { term: "law", aliases: ["legal studies", "human rights law", "jurisprudence"] },
  { term: "education", aliases: ["pedagogy", "teaching", "curriculum"] },
  { term: "agriculture", aliases: ["agronomy", "food security", "crop science", "aquaculture"] },
  { term: "water", aliases: ["hydrology", "water resources", "sanitation"] },
  { term: "architecture", aliases: ["urban planning", "built environment", "urban design"] },
  { term: "social sciences", aliases: ["sociology", "anthropology", "political science", "international relations"] },
  { term: "psychology", aliases: ["cognitive science", "behavioural science", "behavioral science", "neuroscience"] },
  { term: "design", aliases: ["industrial design", "human-computer interaction", "user experience", "ux", "ui design", "product design", "graphic design"] },
  { term: "journalism", aliases: ["media studies", "communications", "public relations"] },
];

/* Whole words, never substrings.
 *
 * `"Designing market signal pipelines".includes("design")` is true, which is
 * how a CV that never mentions the discipline reported Design as one of its
 * two findings — from a verb. Substring matching is also what makes a short
 * alias impossible: "ai" would match email, detail, chair, Dubai.
 *
 * So every surface form becomes a word-bounded pattern. Internal spaces and
 * hyphens are interchangeable ("machine learning" / "machine-learning") and
 * dots are optional ("a.i." / "ai"), because documents vary and the student
 * should not lose a match to punctuation.
 */
const escape = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function pattern(form: string): RegExp {
  const body = escape(form)
    .replace(/\\\./g, "\\.?")        // "a.i." also matches "ai"
    .replace(/[ ]+/g, "[\\s-]+");      // space also matches a hyphen
  /* \b is wrong at a non-word edge (a form ending in "."), so the boundary is
   * asserted with lookarounds on word characters instead. */
  return new RegExp(`(?<![a-z0-9])${body}(?![a-z0-9])`, "gi");
}

type Compiled = { term: string; forms: { form: string; re: RegExp }[] };
const COMPILED: Compiled[] = VOCAB.map(({ term, aliases }) => ({
  term,
  forms: [term, ...aliases].map((form) => ({ form, re: pattern(form) })),
}));

/** Every surface form of a term — what the matcher must also look for. */
export function surfaceForms(term: string): string[] {
  const v = VOCAB.find((x) => x.term === term.trim().toLowerCase());
  return v ? [v.term, ...v.aliases] : [term];
}

/** Does this text mention the term, under any of its spellings? */
export function mentions(text: string, term: string): boolean {
  const c = COMPILED.find((x) => x.term === term.trim().toLowerCase());
  if (!c) {
    const re = pattern(term.trim().toLowerCase());
    re.lastIndex = 0;
    return re.test(text);
  }
  return c.forms.some(({ re }) => {
    re.lastIndex = 0;
    return re.test(text);
  });
}

/* ------------------------------------------------------- pdf text items --- */

/* Rebuilding lines from a PDF's text items.
 *
 * pdf.js hands back a flat array of positioned fragments, and the obvious
 * thing — join them with spaces — produces one enormous line. That quietly
 * breaks two things at once: section headers stop being their own line, so
 * "EDUCATION" is no longer strippable and every CV reports Education as its
 * strongest subject; and the sentence quoted back as evidence becomes whatever
 * 160 characters happen to surround the match.
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
  for (const { term, forms } of COMPILED) {
    let n = 0;
    for (const h of hay) {
      if (
        forms.some(({ re }) => {
          re.lastIndex = 0;
          return re.test(h);
        })
      ) {
        n++;
      }
    }
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
  /** How many times the document says it, across every spelling. */
  hits: number;
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

/* The sentence most worth quoting back.
 *
 * Not simply the first match: on a CV the first line is the contact block, so
 * "first" reliably produced the student's own email as the evidence for their
 * degree. A sentence that says something is one with enough words to be a
 * claim, so short fragments are ranked below longer ones, and anything that
 * looks like a contact line is excluded outright. */
const CONTACT = /@|https?:|www\.|linkedin|\+\d[\d\s-]{7}/i;

function bestEvidence(sentences: string[], term: string): string {
  const hits = sentences.filter((x) => mentions(x, term) && !CONTACT.test(x));
  if (!hits.length) {
    const any = sentences.find((x) => mentions(x, term));
    return any ? snippet(any) : "";
  }
  /* Long enough to carry meaning, not so long it is a paragraph. */
  const scored = hits.map((x) => ({ x, s: Math.min(x.length, 150) - (x.length > 220 ? 60 : 0) }));
  scored.sort((a, b) => b.s - a.s);
  return snippet(scored[0].x);
}

/** A quotable fragment: long enough to judge, short enough to read. */
function snippet(sentence: string, max = 160): string {
  const s = sentence.trim();
  return s.length <= max ? s : `${s.slice(0, max - 1).replace(/\s+\S*$/, "")}…`;
}

/* The forms a BITS Pilani Dubai CV actually uses.
 *
 * The first version matched /\bb\.?\s?e\b/ for a bachelor's, which fails on
 * "B.Eng." — the \b after "e" cannot match with "n" following — so three of
 * five real CVs reported no degree level at all while plainly stating one on
 * line four. Degree abbreviations take too many shapes to guess at; these are
 * taken from the documents. */
const LEVELS: { value: string; patterns: RegExp[] }[] = [
  { value: "phd", patterns: [/\bph\.?\s?d\b/i, /\bdoctoral\b/i, /\bdoctorate\b/i, /\bd\.?phil\b/i] },
  {
    value: "masters",
    patterns: [
      /\bm\.?\s?(sc|tech|eng|phil|res|a|s|ba|com)\b\.?/i,
      /\bmaster'?s?\b/i,
      /\bmba\b/i,
      /\bpost\s?graduate\b/i,
    ],
  },
  {
    value: "bachelors",
    patterns: [
      /\bb\.?\s?(e|eng|tech|sc|a|s|ba|com)\b\.?/i,
      /\bbachelor'?s?\b/i,
      /\bbba\b/i,
      /\bundergraduate\b/i,
    ],
  },
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
  for (const { term, forms } of COMPILED) {
    const r = reach.get(term) ?? 0;
    /* Cannot move a ranking, so it is not offered. Showing it would be a
     * promise the matcher cannot keep. */
    if (r === 0) continue;

    let hits = 0;
    let matched = "";
    let best = 0;
    for (const { form, re } of forms) {
      re.lastIndex = 0;
      const found = lower.match(re);
      if (!found) continue;
      hits += found.length;
      /* The spelling the document actually leans on, not the longest one that
       * happens to appear. A CV saying "AI" thirteen times and "agentic" twice
       * is about AI; reporting it as "agentic" because that string is longer
       * describes the document back to the student incorrectly. */
      if (found.length > best) {
        best = found.length;
        matched = form;
      }
    }
    if (!hits) continue;

    terms.push({ term, matched, reach: r, hits, evidence: bestEvidence(sents, term) });
  }
  /* Most reach first — the terms likeliest to change what the student sees —
   * then by how often the document says it, which is the better tiebreak than
   * alphabetical: a CV that says "AI" thirteen times is making a claim, one
   * that says it once is mentioning it. */
  terms.sort((a, b) => b.reach - a.reach || b.hits - a.hits || a.term.localeCompare(b.term));

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

  /* --- expected graduation.
   *
   * The cue can sit on either side of the year: CVs write "expected 2027" and
   * "Aug 2024 – May 2027 (Expected)" about equally often, and matching only
   * the first missed every date range — which is the commoner layout. Only a
   * plausible year is accepted; a CV is full of dates and most are not this. */
  const now = new Date().getFullYear();

  /* Scan the YEARS, then look around each one for a cue — rather than matching
   * cue-and-year together.
   *
   * A combined pattern consumes what it matches, so in "Aug 2024 - May 2027
   * (Expected)" the match starting at 2024 swallowed 2027, which then never
   * got its own turn: the one plausible year on the page was unreachable. A
   * degree range always opens with the year you started, so the latest
   * plausible year sitting near a cue is the one being expected. */
  const CUE = /(?:expected|graduat\w*|completion|conferral)/i;
  const years: string[] = [];
  for (const m of clean.matchAll(/\b(20\d{2})\b/g)) {
    const y = Number(m[1]);
    if (y < now - 1 || y > now + 8) continue;
    const at = m.index ?? 0;
    /* A window either side, stopping at a line break so a cue two entries down
     * the page cannot vouch for an unrelated date. */
    const around = clean.slice(Math.max(0, at - 40), at + 40);
    const line = around.split("\n").find((l) => l.includes(m[1])) ?? around;
    if (CUE.test(line)) years.push(m[1]);
  }
  /* Second strategy: a date RANGE on an education line.
   *
   * Only one of five real CVs wrote the word "Expected". The other four said
   * "BITS Pilani, Dubai Campus  Aug 2024 - May 2027" and left the reader to
   * work it out — which is the commoner layout, so a cue-only rule reads none
   * of them.
   *
   * The end year of a range is only taken when the line also names a degree or
   * an institution. Project entries carry ranges too ("2024 - 2025"), and
   * without that guard a side project finishing next year becomes the
   * student's graduation date. */
  const SCHOOLING =
    /\b(?:universit|campus|college|institute|school|bachelor|master|b\.?\s?(?:e|eng|tech|sc)|m\.?\s?(?:e|eng|tech|sc)|degree|pilani)/i;
  if (!years.length) {
    for (const line of clean.split("\n")) {
      if (!SCHOOLING.test(line)) continue;
      /* The month is optional on either side: real CVs write both "2024 - 2027"
       * and "Aug 2024 - May 2027", and requiring the years to be adjacent read
       * neither of the latter. */
      for (const m of line.matchAll(
        /\b20\d{2}\s*(?:[–—-]|to)\s*(?:[A-Za-z]{3,9}\.?\s+)?(20\d{2})\b/gi,
      )) {
        const y = Number(m[1]);
        if (y >= now && y <= now + 8) years.push(m[1]);
      }
    }
  }

  const graduation = years.length ? years.sort().at(-1)! : null;

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
