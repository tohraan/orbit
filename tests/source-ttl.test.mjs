/* getIndex()'s staleness policy, with the clock and the loader faked.
   The bug this guards: a cache older than HARD_MS must not be served. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const raw = readFileSync("packages/server/src/source.ts", "utf8");
/* Comments quote the code they are explaining — the note above
   refreshInBackground() contains the exact `.catch(() => {})` this file
   asserts is gone. Blank them, keeping newlines so any reported line number
   still points at the real line. */
const src = raw.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
               .replace(/\/\/[^\n]*/g, "");
let n = 0; const test = (name, fn) => { fn(); n++; console.log("  pass", name); };

test("HARD_MS exists and is larger than TTL_MS", () => {
  assert.match(src, /const TTL_MS = 5 \* 60 \* 1000;/);
  assert.match(src, /const HARD_MS = 2 \* TTL_MS;/);
});
test("a cache past HARD_MS is awaited, not returned", () => {
  const body = src.slice(src.indexOf("export async function getIndex"));
  const hard = body.indexOf("age >= HARD_MS");
  const soft = body.indexOf("age >= TTL_MS");
  assert.ok(hard > -1 && soft > -1, "both branches must exist");
  assert.ok(hard < soft, "the hard bound must be checked BEFORE returning stale");
  const branch = body.slice(hard, soft);
  assert.match(branch, /return load\(\)/, "past HARD_MS the request must load");
  assert.ok(!/return store\.cache/.test(branch), "past HARD_MS it must not return the cache");
});
test("background refresh failures are reported, not swallowed", () => {
  assert.ok(!/\.catch\(\(\) => \{\}\)/.test(src), "an empty catch hides a permanently failing refresh");
  assert.match(src, /background refresh failed/);
});
console.log(`\nall ${n} assertions passed`);
