/* The AI brief: what it must say, and what it must never let a model invent.
 *
 * The output is prose, so most of it is not worth asserting on — the wording
 * will change. What IS worth asserting is the handful of properties the whole
 * feature rests on, because each of them fails silently: a missing field that
 * is quietly omitted looks exactly like a field that did not matter, and a
 * passed deadline presented as a date looks exactly like a live one.
 *
 * Needs the resolver hook, because brief.ts imports ./format and the source
 * here is written for bundlers that do not want an extension:
 *
 *   node --import ./scripts/ts-resolve.mjs tests/brief.test.mjs
 */
import assert from "node:assert/strict";
import { buildBrief, briefFacts, briefProfile } from "../packages/core/src/brief.ts";

let n = 0;
const test = (name, fn) => { fn(); n++; console.log("  pass", name); };

const full = {
  id: 1, title: "DAAD WISE Summer Internship 2027",
  url: "https://example.org/daad", applyLink: "https://example.org/daad/apply",
  sourceSlug: "daad", externalId: "9", sourceName: "DAAD", sourceTier: 1,
  host: "daad.de", postedAt: null, indexedAt: null,
  deadline: "2027-03-15", deadlineKind: "fixed", deadlineNote: null,
  type: "internship", levels: ["undergraduate"], country: "germany",
  funding: "fully_funded", duration: "3 months",
  amount: { currency: "EUR", value: 2500, period: "per month", raw: null },
  amounts: [{ currency: "EUR", value: 2500, period: "per month", raw: null }],
  summary: "A funded summer research placement at a German university.",
  fields: ["engineering"], hasDetail: true,
  eligibility: "Enrolled undergraduates in their third year or later.",
  benefits: "Monthly stipend, travel allowance, health insurance.",
  howToApply: "Apply through the DAAD portal with a supervisor's letter.",
  documents: "CV, transcript, letter of motivation.",
  image: null,
};

const bare = {
  ...full, title: "Mystery Grant",
  deadline: null, deadlineKind: null, type: null, levels: [], country: null,
  funding: null, duration: null, amount: null, amounts: [], fields: [],
  summary: null, eligibility: null, benefits: null, howToApply: null, documents: null,
  applyLink: null,
};

test("a complete listing reports every field it has", () => {
  const out = briefFacts(full, { today: "2027-03-01" });
  assert.match(out, /Type: Internship/);
  assert.match(out, /Study level: Undergraduate/);
  assert.match(out, /Funding: Fully funded/);
  assert.match(out, /EUR 2,500 \/ month/);
  assert.match(out, /Duration: 3 months/);
  assert.match(out, /Country \/ location: Germany/);
  assert.match(out, /Eligibility\n/);
  assert.ok(!out.includes("### Not known"), "nothing should be reported missing");
});

test("missing fields are named as unknown, never omitted", () => {
  const out = briefFacts(bare, { today: "2027-03-01" });
  const notKnown = out.slice(out.indexOf("### Not known"));
  /* The point of the whole section: an LLM handed a record with no eligibility
     will write one. Each of these has to appear BY NAME. */
  for (const field of ["Type", "Study level", "Country", "Funding", "Duration",
                       "Deadline", "Eligibility", "What it covers", "How to apply"]) {
    assert.ok(notKnown.includes(field), `"${field}" must be listed as not known`);
  }
  assert.match(notKnown, /Do not guess/);
});

test("funding kind and stated amount stay separate claims", () => {
  /* "Fully funded" with no figure is not the same claim as a figure. A listing
     that states the kind and not the amount must say so. */
  const out = briefFacts({ ...full, amount: null, amounts: [] }, { today: "2027-03-01" });
  assert.match(out, /Funding: Fully funded/);
  assert.ok(!out.includes("Stated amount:"), "no amount line when none was published");
  assert.match(out.slice(out.indexOf("### Not known")), /Stated amount/);
});

test("a passed deadline is shouted, not merely dated", () => {
  const out = briefFacts(full, { today: "2027-04-01" });
  assert.match(out, /ALREADY PASSED/);
});

test("days remaining are counted from the day passed in", () => {
  assert.match(briefFacts(full, { today: "2027-03-01" }), /14 days away/);
  assert.match(briefFacts(full, { today: "2027-03-15" }), /closes today/);
  /* No `today` means no claim about time, rather than a wrong one. */
  const out = briefFacts(full, {});
  assert.ok(!/days away|closes today|ALREADY PASSED/.test(out));
});

test("a rolling deadline is described, not reported as missing", () => {
  const out = briefFacts({ ...bare, deadlineKind: "rolling" }, { today: "2027-03-01" });
  assert.match(out, /rolling/);
  assert.ok(!out.slice(out.indexOf("### Not known")).includes("Deadline"));
});

test("the official page is always present and named as authoritative", () => {
  assert.match(briefFacts(full, {}), /Official page: https:\/\/example\.org\/daad\/apply/);
  /* Falls back to the listing URL when there is no explicit apply link —
     there is always SOMEWHERE to verify against. */
  assert.match(briefFacts(bare, {}), /Official page: https:\/\/example\.org\/daad/);
  assert.match(buildBrief(full, null, {}), /official page wins/i);
});

test("long prose is capped and the cut is declared", () => {
  const out = briefFacts({ ...full, eligibility: "x".repeat(4000) }, {});
  assert.match(out, /\[truncated\]/);
  assert.ok(out.length < 4000, "the brief must stay pasteable");
});

test("an empty profile makes the model interview rather than assume", () => {
  const out = briefProfile(null);
  assert.match(out, /Nothing has been shared about me/);
  assert.match(out, /Do not assume/);
});

test("a partial profile is sent, and still asks about the rest", () => {
  const out = briefProfile({ level: "undergraduate", fields: "robotics" });
  assert.match(out, /Degree level: Undergraduate/);
  assert.match(out, /Fields of interest: robotics/);
  assert.ok(!out.includes("Preferred countries"), "an empty field is not sent as blank");
  assert.match(out, /almost certainly incomplete/);
});

test("the instruction interviews BEFORE it gives a verdict", () => {
  const out = buildBrief(full, null, { today: "2027-03-01" });
  const step1 = out.indexOf("Step 1");
  const step2 = out.indexOf("Step 2");
  const step3 = out.indexOf("Step 3");
  assert.ok(step1 > -1 && step2 > step1 && step3 > step2, "the three steps must be in order");
  assert.match(out.slice(step1, step2), /stop and wait/);
  assert.match(out.slice(step1, step2), /Do not give a verdict yet/);
});

test("the brief is one pasteable block that leads with the title", () => {
  const out = buildBrief(full, { level: "undergraduate" }, { today: "2027-03-01" });
  assert.ok(out.startsWith("# DAAD WISE Summer Internship 2027"));
  assert.ok(out.includes("## The opportunity"));
  assert.ok(out.includes("## About me"));
  assert.ok(out.includes("## What I want from you"));
  assert.ok(out.length < 9000, `brief should stay chat-sized, was ${out.length}`);
});

console.log(`\nall ${n} assertions passed`);
