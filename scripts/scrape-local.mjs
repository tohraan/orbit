/* Run the W01 scrape pipeline locally, against live sources, with no n8n and no
 * Supabase. It loads the SAME code-node files the workflow embeds (including the
 * injected _lib_html.js) and drives them through a small shim for n8n's $json /
 * $input / $() globals, so a green run here means the scrape logic itself works.
 *
 * What this does NOT prove: n8n's own node behaviour (its RSS reader, the
 * Supabase upsert round-trip, loop semantics). Those need the real import.
 *
 *   node scripts/scrape-local.mjs                 # all enabled sources
 *   node scripts/scrape-local.mjs --only rss      # one kind
 *   node scripts/scrape-local.mjs --only opportunities_circle --detail 3
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { loadNode, runNode, INLINE } from './n8n-shim.mjs';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';
const argv = process.argv.slice(2);
const arg = (f, d) => { const i = argv.indexOf(f); return i < 0 ? d : argv[i + 1]; };
const ONLY = arg('--only', null);
const DETAIL_N = parseInt(arg('--detail', '0'), 10);

// ---- HTTP shim mirroring the n8n HTTP Request node (fullResponse) -----------
async function http(url, { method = 'GET', headers = {}, body = null, text = false, timeout = 60000 } = {}) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeout);
  try {
    const res = await fetch(url, {
      method, signal: ctl.signal, redirect: 'follow',
      headers: { 'User-Agent': UA, ...headers },
      ...(body ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}),
    });
    const h = {}; res.headers.forEach((v, k) => { h[k.toLowerCase()] = v; });
    const raw = await res.text();
    let parsed = raw;
    if (!text) { try { parsed = JSON.parse(raw); } catch { /* leave as text */ } }
    return { statusCode: res.status, headers: h, body: parsed, ok: res.ok };
  } catch (e) {
    return { statusCode: 0, headers: {}, body: null, ok: false, error: String(e.message || e) };
  } finally { clearTimeout(t); }
}

// ---- minimal feed parser (stands in for n8n's rssFeedRead node) -------------
function parseFeed(xml) {
  if (typeof xml !== 'string') return [];
  const blocks = [...xml.matchAll(/<(item|entry)\b[\s\S]*?<\/\1>/gi)].map(m => m[0]);
  const tag = (s, t) => {
    const m = s.match(new RegExp(`<${t}\\b[^>]*>([\\s\\S]*?)</${t}>`, 'i'));
    if (!m) return null;
    return m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim();
  };
  return blocks.map(b => {
    let link = tag(b, 'link');
    if (!link) { const m = b.match(/<link[^>]*href=["']([^"']+)["']/i); link = m ? m[1] : null; }
    return {
      title: tag(b, 'title'),
      link,
      guid: tag(b, 'guid') || tag(b, 'id') || link,
      description: tag(b, 'description'),
      content: tag(b, 'content:encoded') || tag(b, 'content'),
      contentSnippet: tag(b, 'summary') || tag(b, 'description'),
      pubDate: tag(b, 'pubDate') || tag(b, 'published') || tag(b, 'updated'),
      isoDate: tag(b, 'pubDate') || tag(b, 'published') || tag(b, 'updated'),
      categories: [...b.matchAll(/<category[^>]*>([\s\S]*?)<\/category>/gi)].map(m => m[1].trim()),
    };
  });
}

// ---- the pipeline, branch by branch ----------------------------------------
// wp_rest needs the inline "Build Probe URL" node, which lives in build.py.
const { BUILD_PROBE_URL, EXPAND_FEEDS } = INLINE;

async function runSource(src) {
  const nodes = { 'Loop Sources': [{ json: src }] };
  const t0 = Date.now();
  let items = [], meta = {};

  if (src.kind === 'wp_rest') {
    const probe = runNode(BUILD_PROBE_URL, { json: src, nodes })[0];
    const probeRes = await http(probe.json.probe_url, { headers: { Accept: 'application/json' }, timeout: 30000 });
    meta.total = probeRes.headers['x-wp-total'];
    meta.totalPages = probeRes.headers['x-wp-totalpages'];
    const plans = runNode(loadNode('plan_wp_pages.js'), { input: [{ json: probeRes }], nodes });
    const pages = plans.filter(p => p.json.url).slice(0, 2);          // cap for a harness run
    const fetched = [];
    for (const p of pages) fetched.push({ json: await http(p.json.url, { headers: { Accept: 'application/json' } }) });
    items = runNode(loadNode('normalize_wp.js'), { input: fetched, nodes });

  } else if (src.kind === 'rss') {
    const feeds = runNode(EXPAND_FEEDS, { json: src, nodes });
    const read = [];
    for (const f of feeds) {
      const res = await http(f.json.feed_url, { headers: { Accept: 'application/rss+xml, application/xml' }, text: true, timeout: 45000 });
      for (const e of parseFeed(res.body)) read.push({ json: e });
    }
    items = runNode(loadNode('normalize_rss.js'), { input: read, nodes });

  } else if (src.kind === 'post_api' || src.kind === 'json_api') {
    const plans = runNode(loadNode('plan_api.js'), { json: src, nodes });
    const capped = plans.slice(0, 2);                                  // cap for a harness run
    nodes['Plan API Requests'] = capped;
    const responses = [];
    for (const p of capped) {
      responses.push({ json: await http(p.json.url, {
        method: p.json.method,
        headers: p.json.method === 'POST'
          ? { 'Content-Type': 'application/json', Accept: 'application/json' }
          : { Accept: 'application/json' },
        body: p.json.body,
      }) });
    }
    meta.status = responses.map(r => r.json.statusCode).join(',');
    items = runNode(loadNode('normalize_api.js'), { input: responses, nodes });
  }

  return { items, meta, ms: Date.now() - t0 };
}

// ---- main ------------------------------------------------------------------
// Prefer the live registry once the migrations are applied -- that is the config
// the real workflow reads. Fall back to the seed file when Supabase is absent.
async function loadRegistry() {
  const env = Object.fromEntries(readFileSync('.env', 'utf8').split('\n')
    .filter(l => /^[A-Z]/.test(l)).map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
  if (env.SUPABASE_SERVICE_KEY && env.SUPABASE_URL) {
    const r = await fetch(`${env.SUPABASE_URL}/rest/v1/sources?select=*&order=kind,slug`, {
      headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}` },
    });
    if (r.ok) {
      const rows = await r.json();
      if (Array.isArray(rows) && rows.length) {
        console.log(`registry: ${rows.length} rows from Supabase (live)`);
        return rows;
      }
    }
    console.log('registry: Supabase unavailable, falling back to db/003_seed.sql');
  }
  return JSON.parse(execFileSync('python3', ['scripts/seed-to-json.py'], { encoding: 'utf8' }));
}
const registry = await loadRegistry();
const targets = registry.filter(s => s.enabled && (!ONLY || s.kind === ONLY || s.slug === ONLY));

console.log(`\nscraping ${targets.length} source(s)\n${'='.repeat(78)}`);
const all = [];
const summary = [];
for (const src of targets) {
  process.stdout.write(`  ${src.slug.padEnd(22)} ${src.kind.padEnd(9)} `);
  let r;
  try { r = await runSource(src); }
  catch (e) { console.log(`ERROR  ${e.message}`); summary.push({ slug: src.slug, kind: src.kind, n: 0, err: e.message }); continue; }
  const n = r.items.length;
  const extra = r.meta.total ? ` (x-wp-total=${r.meta.total}, pages=${r.meta.totalPages})`
              : r.meta.status ? ` (http ${r.meta.status})` : '';
  console.log(`${String(n).padStart(4)} items  ${String(r.ms).padStart(5)}ms${extra}`);
  summary.push({ slug: src.slug, kind: src.kind, n, ...r.meta });
  all.push(...r.items.map(i => i.json));
}

console.log('='.repeat(78));
const okCount = summary.filter(s => s.n > 0).length;
console.log(`${okCount}/${targets.length} sources returned items; ${all.length} raw_items total\n`);

// ---- optional: prove the detail parser against live pages ------------------
if (DETAIL_N > 0) {
  const queue = all.filter(i => i.needs_detail).slice(0, DETAIL_N);
  console.log(`detail fetch: ${queue.length} page(s)\n${'-'.repeat(78)}`);
  for (const q of queue) {
    const res = await http(q.url, { headers: { Accept: 'text/html,application/xhtml+xml' }, text: true, timeout: 45000 });
    const nodes = { 'Loop Detail Queue': [{ json: { id: q.external_id, url: q.url, source_slug: q.source_slug } }] };
    const [out] = runNode(loadNode('parse_detail.js'), { input: [{ json: res }], nodes });
    const d = out.json.detail || {};
    console.log(`  ${q.url}`);
    console.log(`    deadline=${d.deadline ?? '—'} kind=${d.deadline_kind ?? '—'}  ` +
                `eligibility=${(d.eligibility || '').length}ch benefits=${(d.benefits || '').length}ch ` +
                `how_to_apply=${(d.how_to_apply || '').length}ch`);
    console.log(`    apply_link=${d.apply_link ?? '—'}`);
    q.detail = d;
    await new Promise(r => setTimeout(r, 2000));   // same 2s throttle as the workflow
  }
  console.log();
}

mkdirSync('.local', { recursive: true });
writeFileSync('.local/scrape-output.json', JSON.stringify({ summary, items: all }, null, 2));
console.log(`wrote .local/scrape-output.json  (${all.length} items)\n`);
