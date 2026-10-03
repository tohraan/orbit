/* The Dossier extractor, against the LIVE index.
 *
 * The point of these assertions is the rule the module exists for: a term is
 * only offered when it can actually change a ranking. So reach is computed
 * from the real corpus, not a fixture — a vocabulary that drifts away from
 * what the sources publish should fail here rather than ship quietly. */
import assert from "node:assert/strict";
import { extract, reachIndex, mergeFields, DOC_KINDS } from "../packages/core/src/dossier.ts";

const API = process.env.API ?? "http://localhost:3101";
let items = [];
for (let page = 1; page <= 5; page++) {
  const r = await fetch(`${API}/api/opportunities?pageSize=120&sort=deadline&page=${page}`);
  const d = await r.json();
  items.push(...d.items);
  if (items.length >= d.total) break;
}
console.log(`corpus: ${items.length} listings`);

const reach = reachIndex(items);
const reachable = [...reach.entries()].filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
console.log(`vocabulary terms with reach > 0: ${reachable.length}/${reach.size}`);
for (const [t, n] of reachable.slice(0, 12)) console.log(`   ${String(n).padStart(4)}  ${t}`);

assert.ok(reachable.length >= 8, `only ${reachable.length} terms reach anything — vocabulary has drifted from the corpus`);

/* --- a realistic CV --- */
const CV = `
TOHRAAN KHAN
f20250304@dubai.bits-pilani.ac.in

EDUCATION
BITS Pilani Dubai Campus — B.E. Computer Science, expected graduation 2028. CGPA 8.7.

EXPERIENCE
Research assistant in the robotics lab, working on autonomous systems and
machine learning for grasp planning. Built a renewable energy dashboard for
campus solar output.

PROJECTS
Applied deep learning to materials discovery, published at a student symposium.
Volunteered on a public health data collection drive.

SKILLS
Python, PyTorch, Kubernetes, Figma, Verilog
`;

const got = extract(CV, reach);
console.log(`\nextracted ${got.terms.length} terms, level=${got.level?.value}, graduation=${got.graduation}`);
for (const t of got.terms) console.log(`   ${t.term}  (reach ${t.reach}, matched "${t.matched}")`);

assert.ok(got.terms.length > 0, "found nothing in a CV that plainly names several subjects");
assert.equal(got.level?.value, "bachelors", "B.E. should read as bachelors");
assert.equal(got.graduation, "2028");
assert.ok(got.terms.every((t) => t.reach > 0), "a term with zero reach was offered");
assert.ok(got.terms.every((t) => t.evidence.length > 0), "a term was offered without the sentence it came from");
assert.ok(!got.terms.some((t) => /kubernetes|figma|verilog/i.test(t.term)), "a tool leaked in as a subject");
/* Ordering is the product promise: most reach first. */
for (let i = 1; i < got.terms.length; i++) assert.ok(got.terms[i - 1].reach >= got.terms[i].reach, "not sorted by reach");

/* --- section headers are not claims.
 * Regression: every CV has an "EDUCATION" line, "education" is a real term
 * with real reach, and without header stripping every document reported that
 * the student studies Education — sorted to the top, because the term is
 * common in the corpus. */
const headerOnly = extract("EDUCATION\nBITS Pilani Dubai, B.E. 2028.\n\nSKILLS\nPython", reach);
assert.ok(
  !headerOnly.terms.some((t) => t.term === "education"),
  "a bare section header was read as a subject",
);
/* But a document that genuinely concerns the subject still reports it. */
const realSubject = extract("I teach and research education policy in rural schools.", reach);
assert.ok(
  realSubject.terms.some((t) => t.term === "education"),
  "header stripping swallowed a real mention",
);

/* --- highest degree wins --- */
const both = extract("B.E. Computer Science, 2024. Currently an M.Sc. candidate in robotics.", reach);
assert.equal(both.level?.value, "masters", "a CV naming BE and MSc is a master's student");

/* --- empty and junk input must not throw --- */
for (const bad of ["", "   ", "\u0000\u0000", "aaaa ".repeat(5000)]) {
  const r = extract(bad, reach);
  assert.ok(Array.isArray(r.terms));
}

/* --- graduation must reject implausible years --- */
assert.equal(extract("Graduated 1997.", reach).graduation, null, "a 1997 graduation is not an expectation");

/* --- mergeFields is case-insensitive and order-preserving --- */
assert.equal(mergeFields("Robotics, AI", ["robotics", "materials"]), "Robotics, AI, materials");
assert.equal(mergeFields("", ["robotics"]), "robotics");
assert.equal(mergeFields("Robotics", []), "Robotics");

assert.equal(new Set(DOC_KINDS).size, DOC_KINDS.length, "duplicate doc kind");

/* --------------------------------------------------- a real PDF, end to end
 *
 * The synthetic strings above all use \n between sections, which is NOT what a
 * PDF gives you: pdf.js returns positioned fragments, and joining them with
 * spaces flattens the page onto one line. That flattening is invisible until
 * you run a real file through it, and it broke two things at once — section
 * headers stopped being strippable (so every CV reported "education" as its
 * top subject) and the quoted evidence became whatever happened to surround
 * the match, which for the first hit on a page is the name and email line.
 *
 * tests/fixtures/dossier/sample-cv.pdf is a real PDF printed by Chrome, with a real
 * text layer. Regenerate it from dossier/sample-cv.html if it ever needs changing. */
{
  const { readFileSync } = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  const here = fileURLToPath(new URL(".", import.meta.url));
  const pdfjs = await import(here + "../node_modules/pdfjs-dist/legacy/build/pdf.mjs");
  const { textFromItems } = await import("../packages/core/src/dossier.ts");

  const data = new Uint8Array(readFileSync(here + "fixtures/dossier/sample-cv.pdf"));
  const doc = await pdfjs.getDocument({ data, isEvalSupported: false }).promise;
  let text = "";
  for (let i = 1; i <= doc.numPages; i++) {
    text += textFromItems((await (await doc.getPage(i)).getTextContent()).items) + "\n";
  }

  assert.ok(text.includes("\n"), "pdf text came back flattened — textFromItems is not reconstructing lines");
  assert.ok(/^EDUCATION$/m.test(text), "the section header is not on its own line");

  const r = extract(text, reach);
  console.log(`\nreal PDF: ${doc.numPages} page, ${text.length} chars, ${r.terms.length} terms`);
  for (const t of r.terms) console.log(`   ${t.term} (reach ${t.reach}) — "${t.evidence.slice(0, 70)}"`);

  assert.ok(!r.terms.some((t) => t.term === "education"), "the EDUCATION header leaked back in from a real PDF");
  assert.ok(r.terms.some((t) => t.term === "computer science"), "missed the subject the CV plainly states");
  assert.equal(r.level?.value, "bachelors");
  assert.equal(r.graduation, "2028");
  /* Evidence must be a claim about the work, not the contact line. */
  assert.ok(!/@dubai\.bits-pilani/.test(r.level?.evidence ?? ""), "level evidence quoted the email line");
  for (const t of r.terms) {
    assert.ok(t.evidence.length > 10, `evidence for ${t.term} is too short to judge`);
    assert.ok(!/@dubai\.bits-pilani/.test(t.evidence), `evidence for ${t.term} quoted the contact line`);
  }
}

/* ------------------------------------------- the bugs real CVs exposed ----
 *
 * Every assertion below is a regression. The synthetic CV above passed while
 * all of these were broken, because it was written by the same person as the
 * extractor and used the vocabulary the extractor already knew. Five real CVs
 * from one student found two terms between them. */
{
  /* 1. SHORT FORMS. One real CV said "AI" 13 times, "LLM" 4 and "NLP" once,
   *    and never wrote "artificial intelligence" or "machine learning" — so
   *    the loudest thing on the page was invisible. */
  const ai = extract("Building production-grade AI systems and LLM routing pipelines.", reach);
  assert.ok(
    ai.terms.some((t) => t.term === "artificial intelligence"),
    "a CV that only ever writes the short form must still be read",
  );

  /* 2. WHOLE WORDS. "Designing market signal pipelines" reported Design as a
   *    finding — from a verb. And a two-letter alias under substring matching
   *    would match Dubai, email, detail. */
  const verb = extract("Designing market signal pipelines and real-time data architecture.", reach);
  assert.ok(!verb.terms.some((t) => t.term === "design"), "a verb was read as a discipline");
  const dubai = extract("Contact me in Dubai for retail email detail.", reach);
  assert.ok(
    !dubai.terms.some((t) => t.term === "artificial intelligence"),
    "the 'ai' alias matched inside another word",
  );
  const real = extract("Research in human-computer interaction and product design.", reach);
  assert.ok(real.terms.some((t) => t.term === "design"), "a genuine mention of the discipline was lost");

  /* 3. DEGREE ABBREVIATIONS. /\bb\.?\s?e\b/ cannot match "B.Eng." — the \b
   *    after "e" fails with "n" following — so three of five real CVs
   *    reported no level while stating one on line four. */
  for (const [text, want] of [
    ["B.Eng. Computer Science, BITS Pilani", "bachelors"],
    ["B.Tech in Mechanical Engineering", "bachelors"],
    ["M.Sc. Data Science", "masters"],
    ["M.Eng. Robotics", "masters"],
    ["Ph.D. candidate", "phd"],
  ]) {
    assert.equal(extract(text, reach).level?.value, want, `degree not read from "${text}"`);
  }

  /* 4. GRADUATION. Two separate failures, both from real layouts.
   *    (a) "Aug 2024 - May 2027 (Expected)" — the combined cue+year pattern
   *        matched starting at 2024, SWALLOWING 2027, so the one plausible
   *        year on the page never got its own turn.
   *    (b) Four of five CVs never write "Expected" at all; they put a range on
   *        the education line and leave it to the reader. */
  assert.equal(
    extract("BITS Pilani, Dubai Campus Aug 2024 – May 2027 (Expected)", reach).graduation,
    "2027",
    "the later year in a range was swallowed by the earlier one",
  );
  assert.equal(
    extract("B.Eng. Computer Science\nBITS Pilani, Dubai Campus Aug 2024 – May 2027", reach).graduation,
    "2027",
    "a range on an education line, with no cue word, should still be read",
  );
  /* But a project range must NOT become a graduation date. */
  assert.equal(
    extract("Trading Edge – Retail Terminal 2024 – 2027\nBuilt a platform.", reach).graduation,
    null,
    "a project date range was mistaken for a graduation",
  );

  /* 5. THE SPELLING REPORTED BACK. A CV saying "AI" 13 times and "agentic"
   *    twice is about AI; naming it "agentic" because that string is longer
   *    describes the document back to the student incorrectly. */
  const dom = extract("AI. AI. AI. AI. Agentic systems.", reach);
  const hit = dom.terms.find((t) => t.term === "artificial intelligence");
  assert.equal(hit?.matched, "ai", "reported the longest spelling rather than the one actually leaned on");
  assert.ok(hit.hits >= 5, "occurrences across spellings were not totalled");

  /* 6. EVIDENCE IS NEVER THE CONTACT LINE. */
  const ev = extract(
    "tohraan@gmail.com | +971 58 571 8144 | linkedin.com/in/x\nResearch in public health policy across three states.",
    reach,
  );
  for (const t of ev.terms) assert.ok(!/@|linkedin|\+971/.test(t.evidence), "quoted the contact line as evidence");
}

/* --------------------------------------------- the promise must be kept ----
 *
 * The Dossier tells a student "artificial intelligence — N listings", having
 * counted listings that say "AI" or "LLM". If the matcher looked for the
 * literal string instead, the student would have been told a number we do not
 * honour. Both sides must run the same expansion.
 *
 * match.ts cannot be imported here — it has extensionless relative imports
 * that node's type stripping will not resolve — so this asserts the two halves
 * another way: that reach and the matcher's own field expression agree on real
 * data, and that match.ts is in fact calling the shared primitive rather than
 * substring matching. The second guard is what stops the first from becoming a
 * test of a copy. */
{
  const { mentions, listingHaystack } = await import("../packages/core/src/dossier.ts");
  const { readFileSync } = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  const here = fileURLToPath(new URL(".", import.meta.url));

  const src = readFileSync(here + "../packages/core/src/match.ts", "utf8");
  assert.ok(
    /import \{[^}]*\bmentions\b[^}]*\} from "\.\/dossier"/.test(src),
    "match.ts no longer imports mentions() — field scoring has drifted from the reach the Dossier promises",
  );
  assert.ok(
    /mine\.filter\(\(t\) => mentions\(hay, t\)\)/.test(src),
    "match.ts field scoring is not using mentions()",
  );

  for (const term of ["artificial intelligence", "computer science", "design"]) {
    const promised = reach.get(term) ?? 0;
    const delivered = items.filter((o) => mentions(listingHaystack(o), term)).length;
    assert.equal(delivered, promised, `reach promises ${promised} for "${term}" but matching finds ${delivered}`);
  }
  console.log("\npromise check: reach and the matcher agree on every term tried");
}

/* -------------------------------------------------- a real CV, end to end
 *
 * Modelled on the genuine BITS Pilani Dubai résumé that exposed all of the
 * above — the first version read two things out of it, one of which was wrong.
 * Contact details are replaced; the LAYOUT is what this fixture is for (a
 * dense one page, contact header, shouted section headings, bulleted project
 * entries, a skills table), not whose CV it is.
 * Asserted as a FLOOR rather than an exact list, so the vocabulary can keep
 * growing without the test becoming a chore to update — but it can never
 * quietly collapse back to two again. */
{
  const { readFileSync } = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  const here = fileURLToPath(new URL(".", import.meta.url));
  const pdfjs = await import(here + "../node_modules/pdfjs-dist/legacy/build/pdf.mjs");
  const { textFromItems } = await import("../packages/core/src/dossier.ts");

  const data = new Uint8Array(readFileSync(here + "fixtures/dossier/real-cv.pdf"));
  const doc = await pdfjs.getDocument({ data, isEvalSupported: false }).promise;
  let text = "";
  for (let i = 1; i <= doc.numPages; i++) {
    text += textFromItems((await (await doc.getPage(i)).getTextContent()).items) + "\n";
  }

  const r = extract(text, reach);
  console.log(`\nreal CV: ${text.length} chars -> ${r.terms.length} terms, level=${r.level?.value}, grad=${r.graduation}`);

  assert.ok(r.terms.length >= 6, `only ${r.terms.length} terms from a dense real CV — it used to find 2`);
  assert.equal(r.level?.value, "bachelors", "B.Eng. on line four was not read");
  assert.equal(r.graduation, "2027");
  assert.ok(
    r.terms.some((t) => t.term === "artificial intelligence"),
    "a CV about AI, saying so 30+ times, did not report AI",
  );
  assert.ok(r.terms.some((t) => t.term === "computer science"));
  /* The original false positive: Design, from the verb "Designing". It may
   * legitimately appear now via "interface design", but never alone from a
   * verb — so if it is present it must carry evidence that is not the verb. */
  const design = r.terms.find((t) => t.term === "design");
  if (design) assert.ok(!/^Designing/.test(design.evidence), "Design is still coming from the verb");
  for (const t of r.terms) {
    assert.ok(t.reach > 0, `${t.term} offered with no reach`);
    assert.ok(t.hits > 0, `${t.term} offered with no occurrences`);
  }
}

console.log("\nall assertions passed");
