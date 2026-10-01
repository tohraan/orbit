#!/usr/bin/env node
/* Build ui/opportunities.json -- the finder's data file.
 *
 * Only `record_kind = 'open_call'` sources are included. The other three kinds
 * each answer a real question, but none of them is "what can I apply to":
 *
 *   awarded        nsf_awards, nih_reporter, openaire, cordis -- money ALREADY
 *                  granted. Good for finding a lab to write to; misleading
 *                  next to a deadline and a dollar figure (db/012).
 *   institutional  grants_gov -- NIH/NSF/DoD mechanisms whose applicant is a
 *                  university or a faculty PI (db/013).
 *   programme      daad_programmes -- a course catalogue you enrol in and pay
 *                  for, with an admissions date, not a funding one (db/013).
 *
 * Keys are one or two letters because the file is served whole to the browser
 * and the long names tripled its size. The map is right here:
 *
 *   i  id            t  title           u  url           s  source slug
 *   sn source name   st source tier     h  host domain   pa posted at (source)
 *   fi first indexed d  deadline        dk deadline kind dn deadline note
 *   ty type          lv levels          c  country       f  funding kind
 *   du duration      a  headline amount am all amounts   cv funding covers
 *   g  summary       fs fields of study ap apply link    el eligibility
 *   bn benefits      ht how to apply    dc documents     im image
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
/* ALLOWLIST, not a blocklist: db/013 added `programme` and `institutional`
 * alongside `awarded`, and a kind invented later must stay out of the student
 * finder until someone decides it belongs, rather than leak in by default. */
const openCall = new Set(sources
  .filter(s => ((s.config || {}).record_kind || 'open_call') === 'open_call')
  .map(s => s.slug));
const meta = Object.fromEntries(sources.map(s => [s.slug, s]));

const rows = [];
let after = 0;
for (;;) {
  const page = await get('raw_items?select=id,source_slug,url,payload,detail,deadline,deadline_kind,first_seen_at'
                       + `&id=gt.${after}&order=id.asc&limit=500`);
  if (!page.length) break;
  rows.push(...page);
  after = page[page.length - 1].id;
}

const str = (v, n) => (v == null ? null : String(v).replace(/\s+/g, ' ').trim().slice(0, n) || null);

/* _lib_html.js:extractAmounts() emits {raw, amount, period, currency}. The
 * finder reads {c, v, p}. Without this mapping every amount rendered blank --
 * 95 rows carried a figure and none of them ever showed it. */
const money = (m) => {
  if (!m || typeof m !== 'object') return null;
  const v = Number(m.amount);
  if (!Number.isFinite(v) || v <= 0) return null;
  return { c: m.currency || null, v, p: m.period || null, raw: str(m.raw, 40) };
};
const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return null; } };
const out = [];
for (const r of rows) {
  if (!openCall.has(r.source_slug)) continue;
  const p = r.payload || {};
  const d = r.detail || {};
  const src = meta[r.source_slug] || {};
  const amounts = (Array.isArray(d.amounts) ? d.amounts : []).map(money).filter(Boolean);
  out.push({
    i: r.id,
    t: str(p.title, 240),
    u: r.url || p.url,
    s: r.source_slug,
    sn: src.name || r.source_slug,
    st: src.authority_tier ?? null,
    h: host(r.url || p.url),
    pa: p.source_published_at || null,
    fi: r.first_seen_at || null,
    d: r.deadline || null,
    dk: r.deadline_kind || p.deadline_kind || null,
    dn: str(d.deadline_note || p.deadline_note, 160),
    ty: p.type_hint || null,
    lv: p.level_hints || [],
    c: p.country_hint || p.city || null,
    f: d.funding_kind || p.funding_hint || null,
    du: str(d.duration || p.duration, 60),
    a: money(d.stipend) || money(p.amount) || amounts[0] || null,
    am: amounts.slice(0, 6),
    g: str(d.description || p.plain_summary || p.summary, 400),
    fs: p.fields_of_study || [],
    ap: d.apply_link || null,
    el: str(d.eligibility, 900),
    bn: str(d.benefits, 900),
    ht: str(d.how_to_apply, 900),
    dc: str(d.documents, 500),
    im: d.image_url || p.image_url || null,
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
console.log(`  ${'with an amount'.padEnd(22)}${out.filter(o => o.a).length}`);
const curs = {};
for (const o of out) for (const m of [o.a, ...o.am]) if (m && m.c) curs[m.c] = (curs[m.c] || 0) + 1;
console.log(`  ${'currencies'.padEnd(22)}${JSON.stringify(curs)}`);
const byKind = {};
for (const s of sources) {
  const k = (s.config || {}).record_kind || 'open_call';
  if (k !== 'open_call') (byKind[k] = byKind[k] || []).push(s.slug);
}
console.log(`excluded ${rows.length - out.length} rows not open to a student:`);
for (const [k, slugs] of Object.entries(byKind)) console.log(`  ${k.padEnd(14)}${slugs.join(', ')}`);
