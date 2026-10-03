/* withInterest: the threshold and the double-counting guard. */
import assert from "node:assert/strict";
import { withInterest, MIN_VISIBLE } from "../packages/server/src/interest.ts";

const item = (id) => ({ id, title: `#${id}` });
const counts = new Map([
  [1, { saved: 12, tracked: 4 }],
  [2, { saved: 2, tracked: 0 }],   // below the floor
  [3, { saved: 0, tracked: 0 }],
  [4, { saved: 3, tracked: 9 }],   // tracked is the larger
  [5, { saved: 3, tracked: 3 }],   // same people, counted once
]);

const out = withInterest([1, 2, 3, 4, 5, 6].map(item), counts);
const by = Object.fromEntries(out.map((o) => [o.id, o.interest]));

assert.equal(by[1], 12, "headline should be the larger of saved/tracked");
assert.equal(by[2], null, `${MIN_VISIBLE - 1} is below the floor and must be withheld`);
assert.equal(by[3], null, "zero is withheld");
assert.equal(by[4], 9, "tracked can be the larger one");
assert.equal(
  by[5],
  3,
  "saved and tracked overlap — a student usually saves before tracking — so summing them double-counts one person",
);
assert.equal(by[6], null, "an id with no row is withheld, not zero");

/* The floor must actually be enforced, whatever it is set to. */
assert.ok(MIN_VISIBLE >= 3, "a floor below 3 can identify an individual on one campus");
const edge = withInterest([item(9)], new Map([[9, { saved: MIN_VISIBLE, tracked: 0 }]]));
assert.equal(edge[0].interest, MIN_VISIBLE, "exactly at the floor should show");

/* The original item must survive intact — withInterest adds, never replaces. */
assert.equal(out[0].title, "#1");

console.log(`all assertions passed (MIN_VISIBLE = ${MIN_VISIBLE})`);
