/* Scrape · plan concrete HTTP requests for BOTH `post_api` and `json_api`
 * sources. These two kinds differ only in where the parameters go — a JSON body
 * vs a query string — so they share one planner and one normaliser, and the
 * `Is POST?` switch downstream picks the right HTTP node.
 *
 * Emits one item per (path x keyword x page). `method` drives the routing, so a
 * newly registered source of either kind needs an INSERT into `sources`, never
 * a change here. Genuinely odd contracts get an explicit branch below.
 * LIB */
const src = $('Loop Sources').first().json;
const cfg = src.config || {};
const isPost = src.kind === 'post_api';

const size     = cfg.page_size || (cfg.query && (cfg.query.limit || cfg.query.num || cfg.query.pageSize)) || 100;
const maxPages = cfg.max_pages || 3;
const keywords = cfg.keyword_matrix && cfg.keyword_matrix.length ? cfg.keyword_matrix : [null];
const paths    = cfg.paths && cfg.paths.length ? cfg.paths : [cfg.path || ''];

const out = [];
for (const path of paths) {
  for (const kw of keywords) {
    for (let page = 0; page < maxPages; page++) {
      let url, body = null;

      if (isPost) {
        // ---- POST: parameters live in the JSON body.
        body = JSON.parse(JSON.stringify(cfg.body_template || {}));
        if (src.slug === 'grants_gov') {
          body.rows = size;
          body.startRecordNum = page * size;
          if (kw) body.keyword = kw;
        } else if (src.slug === 'nih_reporter') {
          body.limit  = size;
          body.offset = page * size;
          if (kw) body.criteria = { ...(body.criteria || {}), advanced_text_search: { operator: 'and', search_field: 'all', search_text: kw } };
        } else {                                  // generic post_api
          body[cfg.size_param   || 'limit']  = size;
          body[cfg.offset_param || 'offset'] = page * size;
          if (kw && cfg.keyword_param) body[cfg.keyword_param] = kw;
        }
        url = src.base_url + path;

      } else {
        // ---- GET: parameters live in the query string.
        const params = qs();
        for (const [k, v] of Object.entries(cfg.query || {})) params.set(k, String(v));

        // Page parameter semantics differ per API; keep the mapping explicit.
        const pp = cfg.page_param || 'page';
        if (pp === 'offset')  params.set('offset', String(page * size));
        else if (pp === 'p')  params.set('p', String(page + 1));      // CORDIS is 1-based
        else                  params.set(pp, String(page + 1));

        if (kw) {
          if (src.slug === 'nsf_awards')           params.set('keyword', kw);
          else if (src.slug === 'cordis')          params.set('q', `contenttype='project' AND '${kw}'`);
          else if (src.slug === 'openaire')        params.set('search', kw);
          else if (src.slug === 'daad_programmes') params.set('q', kw);
          else if (cfg.keyword_param)              params.set(cfg.keyword_param, kw);
        }
        url = `${src.base_url}${path}?${params.toString()}`;
      }

      out.push({ json: {
        source_slug: src.slug,
        source_name: src.name || src.slug,
        source_tier: src.authority_tier,
        source_trust: src.trust_score,
        kind: src.kind,
        method: isPost ? 'POST' : 'GET',
        url, body,
        keyword: kw, page,
        item_path: cfg.item_path,
      }});
    }
  }
}
return out;
