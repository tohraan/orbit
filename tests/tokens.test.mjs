/* Every design token a stylesheet asks for must exist in @rof/styles.
 *
 * This is not style policing. An undefined custom property is a SILENT, TOTAL
 * failure of the declaration that uses it: `padding: var(--space-7)
 * var(--space-6)` where --space-7 is not defined is invalid at computed-value
 * time, so the whole shorthand is thrown away and padding falls back to its
 * initial 0 — not to 24px, not to the browser default for a div, to nothing.
 * No console warning, no build error, no failing type.
 *
 * That is exactly what had happened to the desk's sign-in card, which is the
 * first and for a signed-out visitor the ONLY screen that deployment shows.
 * The scale steps 20 → 24 → 32 with no 28, so --space-7 reads like it should
 * exist, and nothing anywhere said it did not.
 *
 * The check is a parse, not a render, so it is cheap enough to live in the
 * verify loop beside the parser tests.
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");

/* The stylesheets that are the product's own. node_modules and generated
 * output are nobody's to fix here. */
const ROOTS = ["web", "admin", "packages/ui"];
const SKIP = new Set(["node_modules", ".next", "dist", "build", ".turbo"]);

function stylesheets(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) stylesheets(full, out);
    else if (entry.endsWith(".css")) out.push(full);
  }
  return out;
}

/* Everything declared in the shared scale, plus the two families a stylesheet
 * legitimately defines for itself: a property set on :root by an app's own
 * globals, and one set inline on an element (`style={{ "--i": n }}`) to drive
 * a stagger. Both are declarations, so both are found by the same pass. */
function declaredIn(css) {
  return new Set([...css.matchAll(/(--[a-z0-9-]+)\s*:/gi)].map((m) => m[1]));
}

/* Comments are prose, and prose discusses the broken token it is explaining —
   two of the comments written in this very change name var(--space-7) while
   describing why it was wrong. Blanking rather than deleting keeps every byte
   offset intact, so reported line numbers still point at the real line. */
function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
}

const tokens = declaredIn(readFileSync(join(root, "packages/styles/globals.css"), "utf8"));

let n = 0;
const test = (name, fn) => { fn(); n++; console.log("  pass", name); };

test("the shared scale is actually loaded", () => {
  assert.ok(tokens.size > 150, `expected a full scale, found ${tokens.size} tokens`);
  /* A spot check that the file parsed rather than merely being non-empty:
     these three sit on a shared line, which a line-oriented reader misses. */
  for (const t of ["--space-2", "--space-6", "--space-8"]) {
    assert.ok(tokens.has(t), `${t} should be in the scale`);
  }
});

test("--space-7 is still absent, so this test is testing something", () => {
  /* If the scale ever gains a 28px step this assertion fails, which is the
     correct outcome: it is the signal to delete this test, not to widen it. */
  assert.ok(!tokens.has("--space-7"), "the scale steps 24 -> 32 with no 28");
});

test("every var() in every stylesheet resolves", () => {
  const broken = [];

  for (const dir of ROOTS) {
    for (const file of stylesheets(join(root, dir))) {
      const css = stripComments(readFileSync(file, "utf8"));
      /* A file may define its own, and a var() may carry a fallback —
         var(--x, 40px) still renders if --x is missing, so it is not a bug. */
      const local = declaredIn(css);
      for (const m of css.matchAll(/var\(\s*(--[a-z0-9-]+)\s*([,)])/g)) {
        const [, name, next] = m;
        if (next === ",") continue;
        if (tokens.has(name) || local.has(name)) continue;
        const line = css.slice(0, m.index).split("\n").length;
        broken.push(`${relative(root, file)}:${line}  ${name}`);
      }
    }
  }

  assert.deepEqual(
    broken,
    [],
    `undefined design tokens — each one silently voids its whole declaration:\n  ${broken.join("\n  ")}\n`,
  );
});

console.log(`\nall ${n} assertions passed`);
