#!/usr/bin/env node
/* Retire rows that _lib_html.js:audienceReject() would now refuse at ingest.
 *
 * db/012 disables opportunity_desk and tags the awarded-record sources, but it
 * cannot sweep the roundup / nationality-locked rows without restating
 * geoLock()'s demonym matrix in SQL. So the sweep lives here and imports the
 * library directly: one implementation, the one with unit tests.
 *
 *   node scripts/sweep-audience.mjs            # dry run, prints what it would delete
 *   node scripts/sweep-audience.mjs --apply    # actually deletes
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { audienceReject } = require(join(root, 'n8n/src/code/_lib_html.js'));

const env = Object.fromEntries(readFileSync(join(root, '.env'), 'utf8')
  .split('\n').filter(l => /^[A-Z]/.test(l))
  .map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const BASE = `${env.SUPABASE_URL}/rest/v1`;
const H = { apikey: env.SUPABASE_SERVICE_KEY,
            Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
            'Content-Type': 'application/json' };

const apply = process.argv.includes('--apply');

/* PostgREST caps a response; page through on the primary key. */
async function* rows() {
  let after = 0;
  for (;;) {
    const u = `${BASE}/raw_items?select=id,source_slug,payload->>title,payload->>summary`
            + `&id=gt.${after}&order=id.asc&limit=1000`;
    const r = await fetch(u, { headers: H });
    if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
    const page = await r.json();
    if (!page.length) return;
    yield* page;
    after = page[page.length - 1].id;
  }
}

const hits = [];
let seen = 0;
for await (const r of rows()) {
  seen++;
  const reason = audienceReject(r.title, r.summary);
  if (reason) hits.push({ id: r.id, source: r.source_slug, reason, title: r.title });
}

const by = {};
for (const h of hits) by[`${h.source} / ${h.reason}`] = (by[`${h.source} / ${h.reason}`] || 0) + 1;
console.log(`scanned ${seen} rows, ${hits.length} fail audienceReject()`);
for (const [k, v] of Object.entries(by).sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(36)}${v}`);
console.log('\nsample:');
for (const h of hits.slice(0, 12)) console.log(`  [${h.reason}] ${h.source} · ${String(h.title).slice(0, 72)}`);

if (!apply) { console.log('\ndry run — pass --apply to delete'); process.exit(0); }

/* Delete in chunks; the URL has a length limit. */
for (let i = 0; i < hits.length; i += 100) {
  const ids = hits.slice(i, i + 100).map(h => h.id);
  const r = await fetch(`${BASE}/raw_items?id=in.(${ids.join(',')})`, { method: 'DELETE', headers: H });
  if (!r.ok) throw new Error(`delete failed: ${r.status} ${await r.text()}`);
  process.stdout.write(`\rdeleted ${Math.min(i + 100, hits.length)}/${hits.length}`);
}
console.log(`\ndeleted ${hits.length} rows`);
