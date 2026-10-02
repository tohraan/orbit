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

console.log("\nall assertions passed");
