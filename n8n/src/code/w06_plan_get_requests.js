/* W06 · GET JSON API ingest — expand one `sources` row into concrete GET URLs.
 * Each registered source only differs by query params and page parameter, so
 * adding NSF / CORDIS / OpenAIRE / DAAD is an INSERT into `sources`, not a new
 * workflow. Anything with a genuinely odd contract gets a branch here. */
const src = $json;
const cfg = src.config || {};
const paths    = cfg.paths && cfg.paths.length ? cfg.paths : [''];
const maxPages = cfg.max_pages || 3;
const size     = cfg.page_size || (cfg.query && (cfg.query.limit || cfg.query.num || cfg.query.pageSize)) || 100;
const keywords = cfg.keyword_matrix && cfg.keyword_matrix.length ? cfg.keyword_matrix : [null];

const out = [];
for (const path of paths) {
  for (const kw of keywords) {
    for (let page = 0; page < maxPages; page++) {
      const qs = new URLSearchParams();
      for (const [k, v] of Object.entries(cfg.query || {})) qs.set(k, String(v));

      // Page parameter semantics differ per API; keep the mapping explicit.
      const pp = cfg.page_param || 'page';
      if (pp === 'offset')      qs.set('offset', String(page * size));
      else if (pp === 'p')      qs.set('p', String(page + 1));      // CORDIS is 1-based
      else                      qs.set(pp, String(page + 1));

      if (kw) {
        if (src.slug === 'nsf_awards')        qs.set('keyword', kw);
        else if (src.slug === 'cordis')       qs.set('q', `contenttype='project' AND '${kw}'`);
        else if (src.slug === 'openaire')     qs.set('search', kw);
        else if (src.slug === 'daad_programmes') qs.set('q', kw);
        else if (cfg.keyword_param)           qs.set(cfg.keyword_param, kw);
      }

      out.push({ json: {
        source_slug: src.slug,
        url: `${src.base_url}${path}?${qs.toString()}`,
        keyword: kw, page,
        item_path: cfg.item_path,
        body: null,
      }});
    }
  }
}
return out;
