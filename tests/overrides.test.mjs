/* Overrides: the layer that keeps a staff correction alive across a re-scrape.
 *
 * The thing actually being tested is the failure these exist to prevent — a
 * listing being re-fetched and quietly reverting — so the re-scrape is
 * simulated rather than assumed. */
import assert from "node:assert/strict";
import {
  applyOverride, applyOverrides, cleanPatch, overrideIndex, suppressedIds,
  featuredFirst, PATCHABLE,
} from "../packages/core/src/overrides.ts";

let n = 0;
const test = (name, fn) => { fn(); n++; console.log("  pass", name); };

const listing = (id, over = {}) => ({
  id, title: `Listing ${id}`, url: "https://example.org/x", sourceSlug: "ukri",
  externalId: String(id), sourceName: "UKRI", sourceTier: 1, host: "example.org",
  postedAt: null, indexedAt: null, deadline: "2026-12-01", deadlineKind: "fixed",
  deadlineNote: null, type: "fellowship", levels: [], country: "UK",
  funding: "fully_funded", duration: null, amount: null, amounts: [],
  summary: "As the source wrote it.", fields: [], applyLink: null,
  eligibility: null, benefits: null, howToApply: null, documents: null,
  image: null, hasDetail: false, ...over,
});

test("a patch replaces only the keys it names", () => {
  const out = applyOverride(listing(1), {
    rawItemId: 1, suppressed: false, featured: false,
    patch: { summary: "What staff corrected it to." },
  });
  assert.equal(out.summary, "What staff corrected it to.");
  assert.equal(out.deadline, "2026-12-01", "an unpatched field must still track the source");
  assert.equal(out.title, "Listing 1");
});

test("no override and an empty patch both return the listing untouched", () => {
  const l = listing(1);
  assert.equal(applyOverride(l, undefined), l);
  assert.equal(applyOverride(l, { rawItemId: 1, suppressed: false, featured: false, patch: {} }), l);
});

test("A RE-SCRAPE CANNOT UNDO A CORRECTION", () => {
  /* The whole point. Staff fix a garbled summary; W01 then re-fetches the
   * listing and writes the source's words back into raw_items, moving the
   * deadline too. The correction must survive and the new deadline must land. */
  const index = overrideIndex([{ raw_item_id: 7, patch: { summary: "Corrected by staff." } }]);

  const before = applyOverrides([listing(7)], index)[0];
  assert.equal(before.summary, "Corrected by staff.");

  const rescraped = listing(7, { summary: "As the source wrote it.", deadline: "2027-02-15" });
  const after = applyOverrides([rescraped], index)[0];
  assert.equal(after.summary, "Corrected by staff.", "the correction was lost on re-scrape");
  assert.equal(after.deadline, "2027-02-15", "an unpatched field must still follow the source");
});

test("null clears a field; undefined is just an absent key", () => {
  const out = applyOverride(listing(1, { eligibility: "Wrong text." }), {
    rawItemId: 1, suppressed: false, featured: false,
    patch: cleanPatch({ eligibility: null, benefits: undefined }),
  });
  assert.equal(out.eligibility, null);
  assert.equal(out.benefits, null, "benefits was already null and must stay so");
  assert.ok(!("benefits" in cleanPatch({ benefits: undefined })));
});

test("identity fields cannot be patched", () => {
  for (const k of ["id", "sourceSlug", "sourceName", "sourceTier", "host", "externalId"]) {
    assert.ok(!PATCHABLE.includes(k), `${k} must not be patchable`);
  }
  const p = cleanPatch({ sourceName: "UKRI", summary: "ok", nonsense: 1 });
  assert.deepEqual(p, { summary: "ok" });
});

test("suppressed listings leave the feed but keep their row", () => {
  const index = overrideIndex([
    { raw_item_id: 2, suppressed: true },
    { raw_item_id: 3, suppressed: false },
  ]);
  const out = applyOverrides([listing(1), listing(2), listing(3)], index);
  assert.deepEqual(out.map((o) => o.id), [1, 3]);
  assert.deepEqual(suppressedIds(index), [2]);
});

test("a suppressed listing stays suppressed when the scraper finds it again", () => {
  const index = overrideIndex([{ raw_item_id: 5, suppressed: true }]);
  assert.equal(applyOverrides([listing(5)], index).length, 0);
  assert.equal(applyOverrides([listing(5, { deadline: "2028-01-01" })], index).length, 0);
});

test("featured listings come first and keep their relative order", () => {
  const index = overrideIndex([{ raw_item_id: 3, featured: true }, { raw_item_id: 1, featured: true }]);
  const out = featuredFirst([listing(1), listing(2), listing(3)], index);
  assert.deepEqual(out.map((o) => o.id), [1, 3, 2]);
});

test("no overrides at all is a no-op on every path", () => {
  const empty = overrideIndex([]);
  const items = [listing(1), listing(2)];
  assert.equal(applyOverrides(items, empty), items);
  assert.equal(featuredFirst(items, empty), items);
  assert.deepEqual(suppressedIds(empty), []);
});

test("malformed override rows are ignored rather than throwing", () => {
  const index = overrideIndex([null, undefined, {}, { raw_item_id: "4" }, { raw_item_id: 4, patch: "nope" }]);
  assert.equal(index.size, 1);
  assert.deepEqual(index.get(4).patch, {});
});

console.log(`\nall ${n} assertions passed`);
