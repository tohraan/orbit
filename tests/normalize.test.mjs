/* Normaliser tests — run the real code-node files against cached live payloads.
 *
 * Every assertion here corresponds to a shape that actually broke the scrape on
 * 2026-10-01, so a future change cannot silently regress one source while
 * fixing another (PROMPT.md rule 8). Fixtures in tests/fixtures/api/ were
 * captured live; refresh them with scripts/refresh-api-fixtures.sh.
 */
import { readFileSync } from 'node:fs';
import { loadNode, runNode, INLINE } from '../scripts/n8n-shim.mjs';

let fail = 0;
const ok = (c, m) => { if (!c) { fail++; console.log('  FAIL ' + m); } else console.log('  pass ' + m); };
const fx = (f) => JSON.parse(readFileSync(`tests/fixtures/api/${f}`, 'utf8'));

// A source row shaped like the registry, for the branches that read `config`.
const src = (over = {}) => ({ slug: 'x', kind: 'json_api', base_url: 'https://e.test',
                              config: {}, last_success_at: null, ...over });

// ---------------------------------------------------------------- wp_rest
console.log('# normalize_wp — opportunitydesk.org');
{
  const posts = fx('wp_opportunity_desk.json');
  ok(!Array.isArray(posts[0].class_list) && typeof posts[0].class_list === 'object',
     'fixture still carries the object-shaped class_list this guards');

  const source = src({ slug: 'opportunity_desk', kind: 'wp_rest',
    config: { needs_detail: true, category_map: {
      '12': { type: 'job', levels: ['any'] },
      '161': { type: 'internship', levels: ['bachelors', 'masters'] },
      '24': { type: 'fellowship', levels: ['masters', 'phd'] } } } });

  let out;
  // The bug: `class_list` is an object here, so `.filter()` threw and killed the
  // whole run for every other source behind it.
  try { out = runNode(loadNode('normalize_wp.js'),
         { input: [{ json: { body: posts } }], nodes: { 'Loop Sources': [{ json: source }] } }); }
  catch (e) { ok(false, `object class_list must not throw (got: ${e.message})`); out = []; }
  ok(out.length === posts.length, `all ${posts.length} posts normalised (got ${out.length})`);
  ok(out.every(i => i.json.external_id && i.json.url), 'every row has external_id and url');

  // Type must be chosen by precedence, not by category order: a post filed under
  // both Hot Jobs(12) and Internships(161) is an internship.
  const both = runNode(loadNode('normalize_wp.js'), {
    input: [{ json: { body: [{ id: 9, link: 'https://e.test/a', slug: 'a',
                               title: { rendered: 'AfDB Internship Program' },
                               categories: [12, 161], class_list: {} }] } }],
    nodes: { 'Loop Sources': [{ json: source }] } });
  ok(both[0].json.payload.type_hint === 'internship',
     `job+internship resolves to internship (got ${both[0].json.payload.type_hint})`);
}

console.log('\n# Dedupe Batch — the batch must be deduped on the conflict key');
{
  // PostgREST rejects an ENTIRE batch with 500 / 21000 "ON CONFLICT DO UPDATE
  // command cannot affect row a second time" when two rows share a conflict key.
  // scholars4dev returned 227 posts with 226 unique ids (WordPress paginates by
  // `modified`, and ties make the page boundary unstable) and that one duplicate
  // silently cost all 227 rows, because the node is neverError.
  //
  // This MUST be a code node: the identical logic written as an n8n expression
  // evaluated to [] -- the POST returned 201 and inserted nothing. So the test
  // runs the jsCode FROM THE BUILT WORKFLOW rather than a copy of it.
  const wf = JSON.parse(readFileSync('n8n/workflows/W01_scrape_opportunities.json', 'utf8'));
  const node = wf.nodes.find(n => n.name === 'Dedupe Batch');
  ok(!!node, 'Dedupe Batch node exists in the built workflow');
  ok(node.parameters.mode !== 'runOnceForEachItem', 'it runs over the whole batch');

  const rows = [
    { source_slug: 's4d', external_id: '11104', url: 'https://a.test/first' },
    { source_slug: 's4d', external_id: '2191',  url: 'https://a.test/other' },
    { source_slug: 's4d', external_id: '11104', url: 'https://a.test/second' },
    { source_slug: 'oc',  external_id: '11104', url: 'https://a.test/different-source' },
  ];
  const out = runNode(node.parameters.jsCode, { input: rows.map(json => ({ json })) })
                .map(i => i.json);

  ok(out.length === 3, `4 rows with one duplicate key -> 3 kept (got ${out.length})`);
  const keys = out.map(r => `${r.source_slug}|${r.external_id}`);
  ok(new Set(keys).size === keys.length, 'no duplicate conflict key survives');
  ok(keys.includes('oc|11104'),
     'same external_id under a DIFFERENT source is kept (the key is the pair)');
  ok(out.find(r => r.source_slug === 's4d' && r.external_id === '11104').url
       === 'https://a.test/second', 'last occurrence wins');
  ok(runNode(node.parameters.jsCode, { input: [] }).length === 0, 'empty batch stays empty');
}

console.log('\n# plan_wp_pages — page count must come from x-wp-total, not the probe');
{
  // The probe asks for per_page=1, so its x-wp-totalpages IS the item count.
  // Trusting it asked WordPress for pages that do not exist and got 400s back:
  // "The page number requested is larger than the number of pages available."
  const src = { slug: 'oc', base_url: 'https://e.test/wp-json/wp/v2',
                last_success_at: null, config: { per_page: 100, max_pages: 20 } };
  const plan = (total) => runNode(loadNode('plan_wp_pages.js'), {
    input: [{ json: { headers: { 'x-wp-total': String(total), 'x-wp-totalpages': String(total) } } }],
    nodes: { 'Loop Sources': [{ json: src }] } }).filter(i => i.json.url);

  ok(plan(222).length === 3, `222 items @100/page -> 3 pages (got ${plan(222).length})`);
  ok(plan(100).length === 1, `exactly 100 items -> 1 page (got ${plan(100).length})`);
  ok(plan(101).length === 2, `101 items -> 2 pages (got ${plan(101).length})`);
  ok(plan(0).length === 1, 'zero items still plans one page rather than none');
  ok(plan(25469).length === 20, `25,469 items caps at max_pages=20 (got ${plan(25469).length})`);
  const pages = plan(222).map(i => i.json.page);
  ok(JSON.stringify(pages) === '[1,2,3]', `pages are 1-based and contiguous (${pages})`);
  ok(plan(222).every(i => /per_page=100/.test(i.json.url)), 'per_page carried into the page URL');
}

console.log('\n# Expand Feed URLs — fans one source row out into one item per feed');
{
  // This node used to run in each-item mode while returning an array, which n8n
  // rejects with "A 'json' property isn't an object [item 0]".
  const two = runNode(INLINE.EXPAND_FEEDS, { input: [{ json: {
    slug: 'erc', config: { feed_urls: ['https://a.test/rss', 'https://b.test/rss'] } } }] });
  ok(Array.isArray(two) && two.length === 2, `two feeds -> two items (got ${two.length})`);
  ok(two.every(i => i.json && typeof i.json === 'object'), "every item has an object 'json'");
  ok(two.every(i => i.json.source_slug === 'erc'), 'slug carried onto each feed item');
  const none = runNode(INLINE.EXPAND_FEEDS, { input: [{ json: { slug: 'x', config: {} } }] });
  ok(Array.isArray(none) && none.length === 0, 'a source with no feed_urls yields no items');
}

// ---------------------------------------------------------------- json/post APIs
const apiCase = (slug, file, itemPath, assertions) => {
  console.log(`\n# normalize_api — ${slug}`);
  const plans = [{ json: { source_slug: slug, kind: 'json_api', method: 'GET',
                           url: 'https://e.test', item_path: itemPath, body: null } }];
  const out = runNode(loadNode('normalize_api.js'), {
    input: [{ json: { body: fx(file) } }],
    nodes: { 'Plan API Requests': plans } });
  assertions(out.map(i => i.json));
};

apiCase('cordis', 'cordis.json', 'payload.results', (rows) => {
  // item_path was `hits.hits`, which this endpoint does not use -> 0 rows.
  ok(rows.length > 0, `payload.results yields rows (got ${rows.length})`);
  ok(rows.every(r => /^https:\/\/cordis\.europa\.eu\/project\/id\//.test(r.url)),
     'project URL constructed from id');
  ok(rows.every(r => r.payload.title), 'every row has a title');
  // CORDIS serves dates as unresolved templates ("1 {{month_01}} 2014").
  ok(rows.every(r => r.payload.deadline === null && r.payload.deadline_kind === 'rolling'),
     'templated dates are not stored as deadlines');
});

apiCase('openaire', 'openaire.json', 'results', (rows) => {
  const raw = fx('openaire.json').results;
  const junk = raw.filter(r => !r.title || r.title === 'unidentified').length;
  ok(junk > 0, `fixture contains ${junk} placeholder record(s) to drop`);
  ok(rows.length === raw.length - junk,
     `placeholder records dropped (${raw.length} in, ${rows.length} out)`);
  ok(rows.every(r => r.payload.title !== 'unidentified'), 'no "unidentified" title stored');
});

apiCase('daad_programmes', 'daad.json', 'courses', (rows) => {
  // Every row was dropped before: DAAD uses `courseName`, not `title`.
  ok(rows.length > 0, `courses mapped (got ${rows.length})`);
  ok(rows.every(r => r.payload.title), 'courseName mapped to title');
  ok(rows.every(r => /^https:\/\/www2\.daad\.de\//.test(r.url)), 'relative link made absolute');
  ok(rows.every(r => r.payload.deadline || r.payload.deadline_kind === 'varies'),
     'absent deadline is "varies", never a silent null');
  ok(rows.every(r => r.payload.country_hint === 'Germany'), 'country set');
});

apiCase('nsf_awards', 'nsf_awards.json', 'response.award', (rows) => {
  ok(rows.length > 0, `awards mapped (got ${rows.length})`);
  // The response has no URL field at all; the award page is addressable by id.
  ok(rows.every(r => /AWD_ID=\d+/.test(r.url || '')), 'award URL constructed from id');
  const reu = runNode(loadNode('normalize_api.js'), {
    input: [{ json: { body: { response: { award: [
      { id: '1', title: 'REU Site: Microbiology at the host-pathogen interface' }] } } } }],
    nodes: { 'Plan API Requests': [{ json: { source_slug: 'nsf_awards',
             item_path: 'response.award' } }] } })[0].json.payload;
  ok(reu.type_hint === 'research_internship', 'REU site -> research_internship');
  ok(reu.level_hints.includes('bachelors'), 'REU site -> bachelors');
});

// ---------------------------------------------------------------- plan_api
console.log('\n# plan_api — one planner for both API kinds');
{
  const planFor = (row) => runNode(loadNode('plan_api.js'),
    { nodes: { 'Loop Sources': [{ json: row }] } });

  const post = planFor(src({
    slug: 'grants_gov', kind: 'post_api', base_url: 'https://api.grants.gov',
    config: { path: '/v1/api/search2', max_pages: 1,
              body_template: { oppStatuses: 'posted' }, keyword_matrix: ['fellowship'] },
  }));
  ok(post.length === 1 && post[0].json.method === 'POST', 'post_api plans a POST');
  ok(post[0].json.body && post[0].json.body.keyword === 'fellowship',
     'keyword goes into the body for post_api');
  ok(!post[0].json.url.includes('?'), 'no query string on the POST url');

  const get = planFor(src({
    slug: 'cordis', kind: 'json_api', base_url: 'https://cordis.europa.eu/api',
    config: { paths: ['/search/results'], max_pages: 1, page_param: 'p',
              query: { format: 'json' }, keyword_matrix: ['phd'] },
  }));
  ok(get.length === 1 && get[0].json.method === 'GET', 'json_api plans a GET');
  ok(get[0].json.body === null, 'no body on a GET');
  ok(get[0].json.url.includes('p=1'), 'CORDIS page param is 1-based');
  ok(/q=contenttype/.test(decodeURIComponent(get[0].json.url)), 'keyword folded into CORDIS q');
}

console.log(fail ? `\n${fail} FAILURE(S)` : '\nall assertions passed');
process.exit(fail ? 1 : 0);
