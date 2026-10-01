/* A minimal stand-in for the n8n Code-node runtime, so the real code-node files
 * in n8n/src/code/ can be executed outside n8n -- by the local scrape runner and
 * by the tests. It loads a node exactly as n8n/build.py assembles it, including
 * injecting _lib_html.js into any node whose header declares `* LIB`.
 *
 * Keep the LIB marker regex in step with build.py's LIB_MARKER. */
import { readFileSync } from 'node:fs';

const CODE = new URL('../n8n/src/code/', import.meta.url);
const LIB_SRC = readFileSync(new URL('_lib_html.js', CODE), 'utf8');
const LIB_BODY = LIB_SRC.split('if (typeof module')[0].trimEnd();
const LIB_MARKER = /^\s*\*\s*LIB\s*(?:\*\/)?\s*$/m;

export function loadNode(file) {
  let src = readFileSync(new URL(file, CODE), 'utf8');
  if (LIB_MARKER.test(src)) src = `${LIB_BODY}\n\n${src}`;
  return src;
}

/* Globals plain Node has but the n8n Code sandbox does NOT. Leaving these
 * available made the harness MORE permissive than production: plan_api.js and
 * plan_wp_pages.js passed every local test and then died in n8n with
 * `URLSearchParams is not defined`. They are shadowed with a Proxy that throws
 * on construct/call/property access, so the same mistake now fails here first.
 *
 * Empirically derived -- n8n 2.33.7 confirmed URLSearchParams missing. Add to
 * this list when a node dies in n8n on something Node provides locally. */
const SANDBOX_DENIED = ['URLSearchParams', 'URL', 'fetch', 'require', 'process',
                        'TextEncoder', 'TextDecoder', 'structuredClone'];

function deniedGlobal(name) {
  const boom = () => {
    throw new ReferenceError(
      `${name} is not defined -- it does not exist in the n8n Code sandbox. ` +
      `Use a helper in _lib_html.js instead (see qs()).`);
  };
  return new Proxy(function () {}, { get: boom, apply: boom, construct: boom });
}

/** Run a code node. `nodes` maps a node name to the items $('name') should see. */
export function runNode(src, { json = {}, input = [], nodes = {} } = {}) {
  const $input = { all: () => input, first: () => input[0] };
  const $ = (name) => {
    const items = nodes[name];
    if (!items) throw new Error(`$('${name}') not available in harness`);
    return { first: () => items[0], all: () => items, item: items[0] };
  };
  const fn = new Function(...SANDBOX_DENIED, '$json', '$input', '$', '$now', src);
  const out = fn(...SANDBOX_DENIED.map(deniedGlobal), json, $input, $, new Date());
  // n8n accepts either an array of items or a single {json} item; normalise.
  if (out == null) return [];
  return Array.isArray(out) ? out : [out];
}

/** The two code nodes that build.py declares inline rather than in a file. */
export const INLINE = {
  BUILD_PROBE_URL: `
const s = $json;
const cfg = s.config || {};
const since = s.last_success_at
  ? new Date(new Date(s.last_success_at).getTime() - 36e5).toISOString().slice(0, 19)
  : null;
const qs = new URLSearchParams({ per_page: '1', _fields: 'id', orderby: 'modified', order: 'desc' });
if (since) qs.set('modified_after', since);
if (Array.isArray(cfg.exclude_categories) && cfg.exclude_categories.length)
  qs.set('categories_exclude', cfg.exclude_categories.join(','));
return { json: { source: s, probe_url: \`\${s.base_url}/posts?\${qs.toString()}\` } };`,

  EXPAND_FEEDS: `
const out = [];
for (const item of $input.all()) {
  const s = item.json;
  for (const u of ((s.config || {}).feed_urls || [])) {
    out.push({ json: { source_slug: s.slug, feed_url: u } });
  }
}
return out;`,
};
