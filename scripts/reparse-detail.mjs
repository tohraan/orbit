#!/usr/bin/env node
/* Re-parse stored detail pages with the current parser.
 *
 * WHY THIS IS NOT A RE-SCRAPE. raw_items holds the verbatim payload precisely
 * so a parser fix can be applied to what was already collected (CONTEXT §3,
 * "why a landing zone"). The detail HTML itself is not stored, though — only
 * the parsed result — so the page is re-fetched and re-parsed. Everything else
 * about the row is left exactly as it is.
 *
 * It exists because of the contamination found on 2026-10-04: sections() ran
 * over the whole document, so 78 of 135 rows carried a DIFFERENT opportunity's
 * application instructions. Fixing the parser does not fix the rows that were
 * already written with it.
 *
 *   node scripts/reparse-detail.mjs            # dry run, reports what changes
 *   node scripts/reparse-detail.mjs --write    # patch raw_items.detail
 *   node scripts/reparse-detail.mjs --write --only opportunities_circle
 */
import { readFileSync } from 'node:fs';
import { loadNode, runNode } from './n8n-shim.mjs';

const argv = process.argv.slice(2);
const WRITE = argv.includes('--write');
/* `indexOf` returns -1 when the flag is absent, and -1 + 1 is 0 — so the naive
 * form silently reads argv[0] as the value. A run of `--write` alone therefore
 * filtered on the source slug "--write" and matched nothing, reporting a clean
 * 0/0/0 that looked like success. */
const flag = (name) => { const i = argv.indexOf(name); return i === -1 ? null : argv[i + 1] ?? null; };
const ONLY = flag('--only');
const LIMIT = parseInt(flag('--limit') || '0', 10) || Infinity;

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';
const env = Object.fromEntries(readFileSync('.env', 'utf8').split('\n')
  .filter(l => /^[A-Z]/.test(l)).map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const BASE = `${env.SUPABASE_URL}/rest/v1`;
const H = { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}` };

const q = `raw_items?select=id,source_slug,url,detail&detail=not.is.null`
        + (ONLY ? `&source_slug=eq.${ONLY}` : '') + `&order=id.asc&limit=1000`;
const rows = await (await fetch(`${BASE}/${q}`, { headers: H })).json();
console.log(`${rows.length} rows with stored detail${ONLY ? ` (${ONLY})` : ''}\n${'='.repeat(78)}`);

const node = loadNode('parse_detail.js');
let changed = 0, failed = 0, same = 0, n = 0;

for (const r of rows) {
  if (++n > LIMIT) break;
  let html = '';
  try {
    const res = await fetch(r.url, { headers: { 'User-Agent': UA, Accept: 'text/html' }, redirect: 'follow' });
    html = await res.text();
  } catch (e) {
    console.log(`  fetch FAIL  ${r.id}  ${String(e.message).slice(0, 50)}`);
    failed++; continue;
  }

  let out;
  try {
    [out] = runNode(node, {
      input: [{ json: { body: html } }],
      nodes: { 'Loop Detail Queue': [{ json: { id: r.id, url: r.url, source_slug: r.source_slug } }] },
    });
  } catch (e) {
    console.log(`  parse FAIL  ${r.id}  ${String(e.message).slice(0, 60)}`);
    failed++; continue;
  }

  const next = out.json.detail;
  if (!next) { failed++; continue; }
  const before = (r.detail || {}).how_to_apply || '';
  const after = next.how_to_apply || '';

  if (before.trim() === after.trim()) { same++; continue; }
  changed++;
  console.log(`  ${String(r.id).padStart(5)}  ${r.source_slug.slice(0, 20).padEnd(20)} `
            + `how ${String(before.length).padStart(5)} -> ${String(after.length).padStart(5)}  `
            + `${after.slice(0, 54).replace(/\s+/g, ' ')}`);

  if (WRITE) {
    const res = await fetch(`${BASE}/raw_items?id=eq.${r.id}`, {
      method: 'PATCH',
      headers: { ...H, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ detail: next, deadline: next.deadline ?? null,
                             deadline_kind: next.deadline_kind ?? null }),
    });
    if (!res.ok) console.log(`    PATCH failed ${res.status} ${(await res.text()).slice(0, 80)}`);
  }
  // Same 1.2s courtesy the workflow uses. These are other people's servers.
  await new Promise(s => setTimeout(s, 1200));
}

console.log('='.repeat(78));
console.log(`${changed} changed, ${same} unchanged, ${failed} failed`);
console.log(WRITE ? 'written to raw_items.' : 'DRY RUN — re-run with --write to patch.');
