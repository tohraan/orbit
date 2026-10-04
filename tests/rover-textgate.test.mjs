/* The gate that stops a model's tool-call scaffolding reaching the student.
 *
 * Every case here is either something a model actually emitted on a live run
 * or the same shape from another model family. Run from the repo root:
 *
 *   node --import ./scripts/ts-resolve.mjs tests/rover-textgate.test.mjs
 */

import assert from "node:assert/strict";
import { TextGate } from "../packages/server/src/rover/textgate.ts";

let n = 0;
const pass = (m) => {
  n++;
  console.log("  pass", m);
};

/** Feed text through in chunks, as a stream would. */
function run(chunks) {
  const gate = new TextGate();
  let out = "";
  for (const c of chunks) out += gate.push(c);
  out += gate.flush();
  return { out, cut: gate.cut, shown: gate.shown };
}

/* An ordinary answer must pass through byte for byte. */
{
  const answer =
    "These three are fully funded and open to Indian nationals. The Chevening deadline is the " +
    "nearest, so start there.";
  const whole = run([answer]);
  assert.equal(whole.out, answer, "a plain answer is unchanged");
  assert.equal(whole.cut, false, "and nothing is reported as cut");

  /* Chunked the way a stream arrives, including one character at a time. */
  const perToken = run(answer.split(/(?= )/));
  assert.equal(perToken.out, answer, "chunking does not change the text");
  const perChar = run([...answer]);
  assert.equal(perChar.out, answer, "nor does one character at a time");
  pass("ordinary prose passes through untouched, however it is chunked");
}

/* The exact shape seen on a live run: the whole reply is a tool call. */
{
  const leak =
    "<tool_call>\n<function=search_opportunities>\n<parameter=level>\n[\"masters\"]\n" +
    "</parameter>\n</function>\n</tool_call>";
  const r = run([leak]);
  assert.equal(r.out, "", "nothing is shown");
  assert.equal(r.cut, true, "it is reported as cut");
  assert.equal(r.shown, false, "and nothing was ever shown, so the caller can say the answer garbled");
  pass("a reply that is entirely a tool call shows nothing at all");
}

/* Split across chunks so the marker straddles a boundary — the case a naive
 * per-chunk check misses. */
{
  const r = run(["<tool", "_call>", "<function=", "recommend>"]);
  assert.equal(r.out, "", "a marker split across chunks is still caught");
  assert.equal(r.cut, true, "and reported");
  pass("a marker split across chunk boundaries is still caught");
}

/* Prose first, then scaffolding. The prose was a real answer and is kept; the
 * scaffolding is cut at the marker. */
{
  const r = run(["Here are three that fit. ", "<tool_call>", "<function=recommend>"]);
  assert.equal(r.out, "Here are three that fit. ", "the real sentence survives");
  assert.equal(r.cut, true, "the rest is cut");
  assert.equal(r.shown, true, "and the caller can tell an answer WAS shown");
  pass("prose before a marker is kept; everything after it is dropped");
}

/* Other model families' surface forms. */
{
  for (const marker of ["<|python_tag|>", "[TOOL_CALL]", '{"name":"recommend"', "<function_call>"]) {
    const r = run([`${marker} whatever follows`]);
    assert.equal(r.out, "", `${marker} is suppressed`);
    assert.equal(r.cut, true, `${marker} is reported`);
  }
  pass("the other common tool-call surface forms are covered too");
}

/* The gate latches: once shut it stays shut for the rest of the turn, so a
 * model that writes scaffolding and then more scaffolding cannot sneak the
 * second batch through. */
{
  const gate = new TextGate();
  gate.push("<tool_call><function=recommend>............");
  const after = gate.push("and now some words that look innocent");
  assert.equal(after, "", "nothing passes after the gate has shut");
  assert.equal(gate.flush(), "", "and the flush is empty too");
  pass("the gate latches shut for the rest of the turn");
}

/* A short answer — shorter than the lookahead — must still be delivered. The
 * bug this guards: holding back text waiting for 24 characters that never
 * arrive, and showing an empty bubble. */
{
  const r = run(["Yes."]);
  assert.equal(r.out, "Yes.", "a four-character answer is still shown");
  assert.equal(r.shown, true, "and counts as shown");
  pass("an answer shorter than the lookahead is delivered on flush");
}

/* Angle brackets that are not a tool call. The markers are specific shapes,
 * and an ordinary sentence must not trip them. */
{
  const text = "Funding under <5,000 USD is rare, and 3 < 4 > 2 is not a tool call.";
  const r = run([text]);
  assert.equal(r.out, text, "ordinary angle brackets are left alone");
  assert.equal(r.cut, false, "and nothing is cut");
  pass("stray angle brackets in real prose do not trip the gate");
}

console.log(`\nall ${n} assertions passed`);
