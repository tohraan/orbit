#!/usr/bin/env node
/* Build ui/opportunities.json -- the finder's data file.
 *
 * Only `record_kind = 'open_call'` sources are included. nsf_awards,
 * nih_reporter, openaire and cordis are registers of money ALREADY GRANTED
 * (db/012): valuable for finding a lab to write to, wrong for an apply-now
 * list, and actively misleading next to a deadline and a dollar figure.
 *
 * Keys are one or two letters because the file is served whole to the browser
 * and the long names tripled its size. The map is right here:
 *
 *   i  id            t  title          u  url            s  source slug
 *   sn source name   st source tier    d  deadline       dk deadline kind
 *   ty type          lv levels         c  country        f  funding kind
 *   du duration      a  amount {c,v,p} g  summary        fs fields of study
 *   ap apply link    el eligibility    cv funding covers
 *
 *   node scripts/build-ui-data.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const env = Object.fromEntries(readFileSync(join(root, '.env'), 'utf8')
  .split('\n').filter(l => /^[A-Z]/.test(l))
  .map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const BASE = `${env.SUPABASE_URL}/rest/v1`;
const H = { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}` };

const get = async (path) => {
  const r = await fetch(`${BASE}/${path}`, { headers: H });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json();
};

const sources = await get('sources?select=slug,name,authority_tier,config');
const openCall = new Set(sources
  .filter(s => (s.config || {}).record_kind !== 'awarded')
  .map(s => s.slug));
const meta = Object.fromEntries(sources.map(s => [s.slug, s]));

const rows = [];
let after = 0;
for (;;) {
  const page = await get('raw_items?select=id,source_slug,url,payload,detail,deadline,deadline_kind'
                       + `&id=gt.${after}&order=id.asc&limit=500`);
  if (!page.length) break;
  rows.push(...page);
  after = page[page.length - 1].id;
}

const str = (v, n) => (v == null ? null : String(v).replace(/\s+/g, ' ').trim().slice(0, n) || null);
const out = [];
for (const r of rows) {
  if (!openCall.has(r.source_slug)) continue;
  const p = r.payload || {};
  const d = r.detail || {};
  const src = meta[r.source_slug] || {};
  out.push({
    i: r.id,
    t: str(p.title, 240),
    u: r.url || p.url,
    s: r.source_slug,
    sn: src.name || r.source_slug,
    st: src.authority_tier ?? null,
    d: r.deadline || null,
    dk: r.deadline_kind || p.deadline_kind || null,
    ty: p.type_hint || null,
    lv: p.level_hints || [],
    c: p.country_hint || p.city || null,
    f: d.funding_kind || p.funding_hint || null,
    du: str(d.duration || p.duration, 60),
    a: d.stipend || p.amount || null,
    g: str(d.description || p.plain_summary || p.summary, 400),
    fs: p.fields_of_study || [],
    ap: d.apply_link || null,
    el: str(d.eligibility, 600),
    cv: d.funding_covers || [],
  });
}

// Soonest real deadline first, undated last -- the order a student wants.
out.sort((a, b) => (a.d ? 0 : 1) - (b.d ? 0 : 1) || String(a.d).localeCompare(String(b.d)));

const dest = join(root, 'ui/opportunities.json');
writeFileSync(dest, JSON.stringify(out));
const bySrc = {};
for (const o of out) bySrc[o.s] = (bySrc[o.s] || 0) + 1;
console.log(`wrote ${out.length} open calls to ui/opportunities.json `
          + `(${(readFileSync(dest).length / 1024).toFixed(0)} kB)`);
for (const [k, v] of Object.entries(bySrc).sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(22)}${v}`);
console.log(`  ${'with a deadline'.padEnd(22)}${out.filter(o => o.d).length}`);
console.log(`  ${'detail-enriched'.padEnd(22)}${out.filter(o => o.el || o.ap).length}`);
console.log(`excluded ${rows.length - out.length} awarded-record rows `
          + `(${sources.filter(s => (s.config || {}).record_kind === 'awarded').map(s => s.slug).join(', ')})`);
