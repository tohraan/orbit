/* Rover's tools and its request bounds, against the REAL index.
 *
 * What this can and cannot cover. The model call itself is not exercised here —
 * that needs a key and a network round trip, and an assertion about what a
 * model says is a flaky test, not a useful one. What IS exercised is everything
 * the model's output passes through on its way to a student, which is where the
 * failures that matter live:
 *
 *   - a filter the model asked for means the same thing it means on Explore
 *   - a country the index has never heard of is reported back, not silently
 *     matched against nothing (the model would then tell a student there is
 *     nothing in Germany, which is a different claim)
 *   - `recommend` can only ever show rows that are in the index right now, so
 *     a hallucinated id renders no card and comes back as an error the model
 *     has to correct
 *   - the transcript the browser replays is bounded before a token is spent
 *
 * Run from the repo root:
 *
 *   node --conditions react-server --import ./scripts/ts-resolve.mjs tests/rover.test.mjs
 *
 * Two flags, both about reaching this code from plain node rather than through
 * Next: the hook lets an extensionless relative import resolve (see
 * scripts/ts-resolve.mjs), and `react-server` is the condition under which the
 * `server-only` marker resolves to its empty module instead of throwing.
 */

import assert from "node:assert/strict";
import { getIndex } from "../packages/server/src/source.ts";
import { runTool, toolsForOpenRouter, TOOLS, MAX_CARDS } from "../packages/server/src/rover/tools.ts";
import { parseProfile, parseTurns } from "../packages/server/src/handlers/rover.ts";

const index = await getIndex();
console.log(`index: ${index.items.length} open listings (${index.origin})`);
assert.ok(index.items.length > 50, "index looks too small to test against");

const call = (name, input) => runTool(name, input, index);

/* ------------------------------------------------------------- vocabulary --- */
console.log("\n# index_vocabulary");
{
  const { result } = call("index_vocabulary", {});
  assert.equal(result.total_open_calls, index.items.length, "reports the real corpus size");
  assert.ok(result.type.length > 3, "names the opportunity kinds");
  assert.ok(result.country.some((c) => c.startsWith("online")), "'online' is offered as the remote value");
  assert.match(result.note, /fields_of_study is empty/, "says field of study is unavailable");
  console.log(`  pass  ${result.type.length} kinds, ${result.country.length} countries, with counts`);
}

/* ----------------------------------------------------------------- search --- */
console.log("\n# search_opportunities");
{
  const { result } = call("search_opportunities", { level: ["masters"], funding: ["fully_funded"] });
  assert.ok(result.total > 0, "fully funded master's listings exist");
  assert.ok(result.items.length <= 8, `default limit holds (got ${result.items.length})`);
  assert.equal(result.returned, result.items.length, "`returned` matches what was sent");
  /* The filter has to mean what it means on Explore, or chat and browse
   * disagree about the same word. */
  for (const row of result.items) {
    const full = index.byId.get(row.id);
    assert.ok(full.levels.includes("masters"), `#${row.id} really is a master's listing`);
    assert.match(full.funding ?? "", /fully/i, `#${row.id} really is fully funded`);
  }
  console.log(`  pass  ${result.total} matched, ${result.returned} returned, every row honours both filters`);
}
{
  /* A total above the returned count is how the model knows to narrow rather
   * than ask for more — so the two numbers must be able to differ. */
  const { result } = call("search_opportunities", { limit: 2, level: ["masters"] });
  assert.equal(result.returned, 2, "limit is obeyed");
  assert.ok(result.total > 2, "total reports the whole match, not the page");
  console.log(`  pass  limit 2 of ${result.total} — the model can see what it is not being shown`);
}
{
  const { result } = call("search_opportunities", { limit: 99 });
  assert.ok(result.returned <= 12, `limit is capped (got ${result.returned})`);
  console.log(`  pass  an over-large limit is capped at 12, not honoured`);
}
{
  /* The one that stops a wrong claim reaching a student. */
  const { result } = call("search_opportunities", { country: ["narnia", "usa"] });
  assert.deepEqual(result.ignored_country_values, ["narnia"], "an unknown country is reported back");
  assert.deepEqual(result.applied.country, ["usa"], "the real one is still applied");
  assert.match(result.hint, /index_vocabulary/, "and the model is told where to look it up");
  console.log(`  pass  'narnia' is reported as not-a-value, not treated as an empty result`);
}
{
  const { result } = call("search_opportunities", { q: "this phrase matches nothing at all" });
  assert.equal(result.total, 0, "an impossible query returns nothing");
  assert.equal(result.items.length, 0, "and no rows");
  console.log(`  pass  an empty result is empty — nothing is substituted for it`);
}
{
  /* Rolling listings are the majority of the index, and a deadline window
   * discards all of them. The prompt says so; this proves it is true. */
  const dated = call("search_opportunities", { deadline: "dated", limit: 1 }).result.total;
  const rolling = call("search_opportunities", { deadline: "rolling", limit: 1 }).result.total;
  assert.equal(dated + rolling, index.items.length, "dated + rolling accounts for the whole index");
  assert.ok(rolling > dated, "rolling really is the majority — the prompt tells Rover this");
  console.log(`  pass  ${dated} dated / ${rolling} rolling, and they sum to the corpus`);
}
{
  const { result } = call("search_opportunities", { deadline: "d30", sort: "deadline", limit: 5 });
  const days = result.items.map((i) => i.days_left);
  assert.ok(
    days.every((d) => typeof d === "number" && d >= 0 && d <= 30),
    `every row inside the 30-day window (got ${days.join(", ")})`,
  );
  assert.deepEqual(days, [...days].sort((a, b) => a - b), "sorted soonest first");
  console.log(`  pass  d30 + sort=deadline returns ${days.length} rows in order: ${days.join(", ")} days`);
}
{
  /* Absent-means-unstated: a null must not reach the model as a field it can
   * read as "no deadline". */
  const { result } = call("search_opportunities", { deadline: "rolling", limit: 4 });
  for (const row of result.items) {
    assert.ok(!("days_left" in row), `#${row.id} carries no days_left`);
    assert.ok(!Object.values(row).includes(null), `#${row.id} carries no nulls at all`);
  }
  console.log(`  pass  undated rows carry no null fields to be misread`);
}

/* ------------------------------------------------------------------ detail --- */
console.log("\n# get_opportunity");
{
  const withDetail = index.items.find((o) => o.hasDetail && o.eligibility);
  const { result } = call("get_opportunity", { id: withDetail.id });
  assert.equal(result.id, withDetail.id, "returns the row asked for");
  assert.ok(result.eligibility.length > 40, "carries the eligibility prose");
  assert.ok(result.eligibility.length <= 1200, "trimmed to the ceiling");
  assert.match(result.note, /trimmed/, "and says that it is trimmed");
  console.log(`  pass  #${withDetail.id}: ${result.eligibility.length} chars of eligibility, flagged as trimmed`);
}
{
  const { result, isError } = call("get_opportunity", { id: 999_999_999 });
  assert.equal(isError, true, "an unknown id is an error");
  assert.match(result.message, /Search again/, "and the model is told to search rather than invent");
  console.log(`  pass  an id that is not in the index errors instead of returning a shell`);
}

/* --------------------------------------------------------------- recommend --- */
console.log("\n# recommend");
{
  const picked = index.items.slice(0, 3);
  const outcome = call("recommend", {
    picks: picked.map((o, n) => ({ id: o.id, why: `reason ${n}` })),
  });
  assert.equal(outcome.cards.items.length, 3, "three cards go to the browser");
  assert.deepEqual(
    outcome.cards.items.map((i) => i.id),
    picked.map((o) => o.id),
    "in the order the model ranked them",
  );
  /* The card component needs a summary-shaped row, not a detail one: the prose
   * fields are 60% of the bytes and nothing on a card renders them. */
  for (const item of outcome.cards.items) {
    assert.ok(item.title && item.url && "deadline" in item && "levels" in item, "card-shaped");
    assert.ok(!("eligibility" in item), "and stripped of the detail prose");
  }
  assert.equal(outcome.cards.why[picked[1].id], "reason 1", "each reason stays with its own card");
  console.log(`  pass  3 summary rows out, reasons keyed by id`);
}
{
  /* The hallucination guard: a made-up id must render nothing and be named. */
  const real = index.items[0].id;
  const outcome = call("recommend", {
    picks: [{ id: real, why: "real" }, { id: 888_888_888, why: "invented" }],
  });
  assert.equal(outcome.cards.items.length, 1, "only the real row renders");
  assert.deepEqual(outcome.result.not_shown, [888_888_888], "the invented one is named back to the model");
  console.log(`  pass  an invented id shows no card and is reported, not quietly dropped`);
}
{
  const outcome = call("recommend", { picks: [{ id: 777_777_777, why: "x" }] });
  assert.equal(outcome.isError, true, "all-invented is an error, not an empty success");
  assert.equal(outcome.cards, undefined, "and nothing is pushed to the browser");
  console.log(`  pass  a recommendation of nothing real is an error the model must correct`);
}
{
  const dupe = index.items[0].id;
  const outcome = call("recommend", {
    picks: [{ id: dupe, why: "first" }, { id: dupe, why: "second" }],
  });
  assert.equal(outcome.cards.items.length, 1, "a repeated id renders one card");
  assert.equal(outcome.cards.why[dupe], "first", "first reason wins");
  console.log(`  pass  a repeated id cannot render the same card twice`);
}
{
  const many = index.items.slice(0, MAX_CARDS + 4).map((o) => ({ id: o.id, why: "y" }));
  const outcome = call("recommend", { picks: many });
  assert.equal(outcome.cards.items.length, MAX_CARDS, `capped at ${MAX_CARDS} cards`);
  console.log(`  pass  ${many.length} picks are capped to ${MAX_CARDS}`);
}

/* ------------------------------------------------- what a weak model sends ---
 * The models a free OpenRouter key can run do not honour an enum reliably.
 * This is not hypothetical: the probe that pinned the wire format came back
 * with `funding: ["fully funded"]` against a schema that says `fully_funded`.
 * A strict reader would have dropped it and told the student there was nothing
 * funded in the index, which is a false claim about the data. */
console.log("\n# tolerating a weaker model");
{
  const prose = call("search_opportunities", { funding: ["fully funded"], level: ["masters"] }).result;
  const canonical = call("search_opportunities", { funding: ["fully_funded"], level: ["masters"] }).result;
  assert.equal(prose.total, canonical.total, "'fully funded' and 'fully_funded' mean the same thing");
  assert.ok(prose.total > 0, "and both find rows");
  console.log(`  pass  an enum written in prose still matches (${prose.total} rows either way)`);
}
{
  /* A bare string where the schema says array. */
  const bare = call("search_opportunities", { level: "masters" }).result;
  const array = call("search_opportunities", { level: ["masters"] }).result;
  assert.equal(bare.total, array.total, "a bare string is read as a one-element array");
  console.log(`  pass  a bare string where an array was asked for is coerced, not dropped`);
}
{
  /* Countries hold real spaces, so they must NOT be underscored — but a model
   * that underscores one anyway should still match. */
  const spaced = call("search_opportunities", { country: ["south korea"] }).result;
  const scored = call("search_opportunities", { country: ["south_korea"] }).result;
  assert.ok(spaced.total > 0, "a multi-word country matches");
  assert.equal(scored.total, spaced.total, "and so does the underscored spelling");
  console.log(`  pass  'south korea' and 'south_korea' both match (${spaced.total} rows)`);
}
{
  /* Junk must still be dropped. Tolerance is about spelling, not about
   * inventing a filter the index cannot answer. */
  const { result } = call("search_opportunities", { funding: ["generous"], level: ["masters"] });
  assert.ok(!result.applied.funding, "an unrecognisable funding value is dropped, not guessed at");
  console.log(`  pass  a value that is genuinely not ours is still dropped`);
}
{
  /* Empty strings and padding, which some models add. */
  const { result } = call("search_opportunities", { level: ["masters", "", "  "], type: [] });
  assert.deepEqual(result.applied.level, ["masters"], "padding is stripped");
  assert.ok(!result.applied.type, "an empty array is no filter at all");
  console.log(`  pass  empty strings and empty arrays are stripped`);
}

/* --------------------------------------------------- the schema conversion --- */
console.log("\n# the OpenRouter function shape");
{
  const converted = toolsForOpenRouter(TOOLS);
  assert.equal(converted.length, TOOLS.length, "every tool converts");
  for (const [i, t] of converted.entries()) {
    assert.equal(t.type, "function", `${t.function.name} is a function tool`);
    assert.equal(t.function.name, TOOLS[i].name, "names survive");
    assert.ok(t.function.description.length > 40, `${t.function.name} keeps its description`);
    assert.equal(t.function.parameters, TOOLS[i].input_schema, "input_schema becomes function.parameters");
    assert.ok(!("input_schema" in t.function), "and the Anthropic key is gone");
  }
  const names = converted.map((t) => t.function.name);
  assert.ok(names.includes("recommend"), "recommend is offered");
  assert.ok(names.includes("search_opportunities"), "so is search");
  console.log(`  pass  ${converted.length} tools convert to function shape: ${names.join(", ")}`);
}

/* ------------------------------------------------------------ unknown tool --- */
{
  const outcome = call("delete_everything", {});
  assert.equal(outcome.isError, true, "an unknown tool name is refused");
  assert.equal(outcome.cards, undefined, "and does nothing");
  console.log(`  pass  a tool that does not exist is an error, not a no-op success`);
}

/* ------------------------------------------------------- transcript bounds --- */
console.log("\n# request bounds");
{
  assert.equal(parseTurns([]), null, "an empty transcript is rejected");
  assert.equal(parseTurns("hello"), null, "a non-array is rejected");
  assert.equal(parseTurns([{ role: "assistant", text: "hi" }]), null, "must start with a user turn");
  assert.equal(
    parseTurns([{ role: "user", text: "a" }, { role: "assistant", text: "b" }]),
    null,
    "must end with the turn being answered",
  );
  assert.equal(parseTurns([{ role: "root", text: "a" }]), null, "an invented role is rejected");
  assert.equal(parseTurns([{ role: "user", text: "   " }]), null, "an empty user turn is rejected");
  console.log("  pass  malformed transcripts are rejected before a token is spent");
}
{
  const long = parseTurns([{ role: "user", text: "x".repeat(9000) }]);
  assert.equal(long[0].text.length, 4000, "a turn is clamped to 4,000 characters");

  /* The newest turns are what the next answer depends on, so the window keeps
   * the tail. 81 turns in, oldest first, must leave turn 81 last.
   *
   * The regression this pins: the 40-turn window lands mid-exchange here, so
   * the oldest surviving turn is an ASSISTANT one. Rejecting that — which is
   * what the first version did — broke every conversation past turn 41 with
   * "that conversation could not be read". It is trimmed instead, which is why
   * 39 survive rather than 40. */
  const many = Array.from({ length: 81 }, (_, i) => ({
    role: i % 2 === 0 ? "user" : "assistant",
    text: `turn ${i + 1}`,
  }));
  const windowed = parseTurns(many);
  assert.ok(windowed, "a long conversation is still a valid conversation");
  assert.ok(windowed.length <= 40, `clamped to 40 turns (got ${windowed.length})`);
  assert.equal(windowed[0].role, "user", "and it begins on a user turn, as the model requires");
  assert.equal(windowed[windowed.length - 1].text, "turn 81", "and it is the NEWEST turns that survive");

  const shown = parseTurns([
    { role: "user", text: "a" },
    { role: "assistant", text: "b", shown: [1, 2, "x", -5, 3.5, ...Array(30).fill(9)] },
    { role: "user", text: "c" },
  ]);
  assert.deepEqual(shown[1].shown.slice(0, 2), [1, 2], "only positive integer ids survive");
  assert.ok(shown[1].shown.length <= 12, "and the id list is bounded");

  /* An assistant turn that errored mid-stream has no text. Dropping it lets
   * the student carry on; rejecting the whole transcript would not. */
  const afterError = parseTurns([
    { role: "user", text: "a" },
    { role: "assistant", text: "" },
    { role: "user", text: "b" },
  ]);
  assert.equal(afterError.length, 2, "an empty assistant turn is dropped, not fatal");
  console.log("  pass  turns, characters and id lists are all bounded; a failed turn is survivable");
}
{
  assert.equal(parseProfile(null), null, "no profile is no profile");
  assert.equal(parseProfile({ level: "   " }), null, "a blank profile is no profile");

  const p = parseProfile({
    name: "Aarav Sharma",
    level: "masters",
    fields: "machine learning",
    email: "aarav@example.com",
    phone: "+971500000000",
    year: "2",
    junk: "ignored",
  });
  assert.equal(p.level, "masters", "known fields are kept");
  /* Identity, not fit: an email cannot change which scholarship suits someone,
   * so it has no business in a prompt. */
  assert.ok(!("email" in p), "email is never read into the prompt");
  assert.ok(!("phone" in p), "nor is a phone number");
  assert.ok(!("junk" in p), "and an unknown key is dropped, not forwarded");
  console.log("  pass  the profile is clamped to fit-relevant fields; contact details never reach the model");
}

console.log("\nAll Rover assertions passed.");
