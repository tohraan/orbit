/* The chat grammar, and the link policy that rides on it.
 *
 * This tests web/app/rover/markdown.ts rather than the renderer, because the
 * renderer imports a CSS module and the decisions worth testing are all made
 * before React sees them: what becomes a block, and which hrefs are allowed to
 * become a link at all. The renderer's own contribution is one line — every
 * anchor carries target="_blank" and rel="noopener noreferrer" — and it is
 * asserted against the source at the end, because there is exactly one place
 * that builds an anchor and it must stay that way.
 *
 *   node --conditions react-server --import ./scripts/ts-resolve.mjs \
 *        tests/rover-richtext.test.mjs
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import { parse, inlineTokens, safeHref } from "../web/app/rover/markdown.ts";

let n = 0;
const pass = (m) => {
  n++;
  console.log("  pass", m);
};

const kinds = (src) => parse(src).map((b) => b.kind);
const types = (src) => inlineTokens(src).map((t) => t.t);
const links = (src) => inlineTokens(src).filter((t) => t.t === "link");

/* ------------------------------------------------------------- blocks --- */
console.log("# blocks");
{
  assert.deepEqual(kinds("Just a sentence."), ["p"]);
  assert.deepEqual(kinds("One.\n\nTwo."), ["p", "p"]);
  pass("plain text and blank-line paragraphs");

  /* The shape that started this: a live answer came back as a markdown list
   * and rendered as literal asterisks in the bubble. */
  const list = parse("Here are three:\n- **UNU Internship** – remote\n- **Google Cup** – online\n");
  assert.deepEqual(
    list.map((b) => b.kind),
    ["p", "ul"],
  );
  assert.equal(list[1].items.length, 2, "both bullets land in ONE list, not two");
  pass("consecutive bullets collapse into a single list");

  assert.deepEqual(kinds("1. first\n2. second"), ["ol"]);
  assert.equal(parse("1. first\n2. second")[0].items.length, 2);
  pass("numbered lists too, and they do not merge with bullets");

  assert.deepEqual(kinds("- a\n1. b"), ["ul", "ol"], "a different marker starts a different list");
  pass("a bullet list and a numbered list stay separate");

  assert.deepEqual(kinds("## Heading\nbody"), ["h", "p"]);
  pass("headings are their own block");

  const pre = parse("before\n```\nconst x = 1;\n```\nafter");
  assert.deepEqual(
    pre.map((b) => b.kind),
    ["p", "pre", "p"],
  );
  assert.equal(pre[1].text, "const x = 1;");
  pass("fenced code is lifted out whole");

  /* Every streamed delta re-parses the partial answer, so the closing fence is
   * usually missing. It must still be a code block, not a wall of paragraphs. */
  const partial = parse("here:\n```\nhalf a line");
  assert.deepEqual(
    partial.map((b) => b.kind),
    ["p", "pre"],
  );
  assert.equal(partial[1].text, "half a line");
  pass("an unclosed fence mid-stream still renders as a code block");

  assert.deepEqual(kinds(""), [], "empty text yields nothing at all");
  assert.deepEqual(kinds("\n\n   \n"), []);
  pass("empty and whitespace-only answers produce no empty bubble content");
}

/* ------------------------------------------------------------- inline --- */
console.log("\n# inline");
{
  assert.deepEqual(types("plain"), ["text"]);
  assert.deepEqual(types("a **bold** b"), ["text", "bold", "text"]);
  pass("bold still works, which is the only markdown the prompt asks for");

  assert.deepEqual(types("use `npm run build` now"), ["text", "code", "text"]);
  assert.equal(inlineTokens("`x`")[0].value, "x", "backticks are stripped");
  pass("inline code");

  /* Text inside backticks must not be re-read: the asterisks stay literal. */
  assert.deepEqual(types("`**not bold**`"), ["code"]);
  assert.equal(inlineTokens("`**not bold**`")[0].value, "**not bold**");
  pass("code wins over emphasis, so a snippet is never re-parsed");

  assert.deepEqual(types("line one\nline two"), ["text", "br", "text"]);
  pass("a single newline inside a paragraph becomes a break");
}

/* -------------------------------------------------------------- links --- */
console.log("\n# links");
{
  const md = links("see [the funder](https://example.org/apply) for more");
  assert.equal(md.length, 1);
  assert.equal(md[0].href, "https://example.org/apply");
  assert.equal(md[0].value, "the funder", "the label is what the student reads");
  pass("markdown links carry label and href separately");

  const bare = links("apply at https://example.org/apply today");
  assert.equal(bare.length, 1);
  assert.equal(bare[0].href, "https://example.org/apply");
  pass("a bare URL is linked without being rewritten");

  /* The full stop belongs to the sentence. A link that swallows it is a 404. */
  const stop = inlineTokens("see https://example.org/a.");
  const link = stop.find((t) => t.t === "link");
  assert.equal(link.href, "https://example.org/a", "trailing punctuation is left out of the href");
  assert.ok(
    stop.some((t) => t.t === "text" && t.value === "."),
    "but it is still shown",
  );
  pass("trailing punctuation stays in the sentence, not in the link");

  assert.ok(safeHref("https://x.org"));
  assert.ok(safeHref("http://x.org"));
  assert.ok(safeHref("mailto:a@b.org"));
  assert.ok(safeHref("/explore"), "relative paths stay inside the portal");
  pass("http, https, mailto and in-portal paths are allowed");

  /* A model can write any scheme it likes. None of these may become an href. */
  for (const bad of [
    "javascript:alert(1)",
    "JavaScript:alert(1)",
    "  javascript:alert(1)",
    "data:text/html;base64,PHNjcmlwdD4=",
    "vbscript:msgbox",
    "file:///etc/passwd",
  ]) {
    assert.equal(safeHref(bad), false, `${bad} must not be linkable`);
    const out = inlineTokens(`[click me](${bad})`);
    /* The property that matters: nothing clickable. A scheme the renderer
     * would refuse must not reach it as a `link` token at all. */
    assert.ok(!out.some((t) => t.t === "link"), `${bad} produced a link token`);
    /* And the student still sees the words. Whether the label comes back on
     * its own or inside the literal source depends on whether the form parsed
     * as a link in the first place — `(  javascript:…)` has a space in the
     * parens and so is never a link shape at all — but it is never dropped. */
    assert.ok(
      out
        .filter((t) => t.t === "text")
        .map((t) => t.value)
        .join("")
        .includes("click me"),
      "the label is still shown",
    );
  }
  pass("javascript:, data:, vbscript: and file: render as text, never as a link");
}

/* --------------------------------------------------- the renderer rule --- */
console.log("\n# the renderer's one rule");
{
  const src = fs.readFileSync(new URL("../web/app/rover/RichText.tsx", import.meta.url), "utf8");

  const anchors = src.match(/<a\b/g) ?? [];
  assert.equal(anchors.length, 1, `exactly one <a> is built in the chat (found ${anchors.length})`);
  assert.match(src, /target="_blank"/, "and it opens in a new tab");
  assert.match(src, /rel="noopener noreferrer"/, "with the opener relationship severed");
  pass("one anchor component, always _blank and noopener noreferrer");

  /* Model output is never handed to the DOM as markup. If this ever appears,
   * the sanitising the grammar does by construction has been bypassed. */
  assert.ok(!src.includes("dangerouslySetInnerHTML"), "chat text is never injected as HTML");
  const parser = fs.readFileSync(new URL("../web/app/rover/markdown.ts", import.meta.url), "utf8");
  assert.ok(!parser.includes("dangerouslySetInnerHTML"));
  pass("no path turns a model's text into raw HTML");
}

console.log(`\nall ${n} assertions passed`);
