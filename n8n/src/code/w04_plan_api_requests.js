/* W04 · POST-API ingest (grants.gov, NIH RePORTER) — expand one `sources` row
 * into concrete request descriptors. Keyword matrix × pages, capped. */
const src = $('Loop Sources').first().json;
const cfg = src.config || {};
const size     = cfg.page_size || 100;
const maxPages = cfg.max_pages || 3;
const keywords = cfg.keyword_matrix && cfg.keyword_matrix.length ? cfg.keyword_matrix : [null];

const out = [];
for (const kw of keywords) {
  for (let page = 0; page < maxPages; page++) {
    const body = JSON.parse(JSON.stringify(cfg.body_template || {}));
    if (src.slug === 'grants_gov') {
      body.rows = size;
      body.startRecordNum = page * size;
      if (kw) body.keyword = kw;
    } else if (src.slug === 'nih_reporter') {
      body.limit  = size;
      body.offset = page * size;
      if (kw) body.criteria = { ...(body.criteria || {}), advanced_text_search: { operator: 'and', search_field: 'all', search_text: kw } };
    } else {                                  // generic post_api
      body[cfg.size_param || 'limit']  = size;
      body[cfg.offset_param || 'offset'] = page * size;
      if (kw && cfg.keyword_param) body[cfg.keyword_param] = kw;
    }
    out.push({ json: {
      source_slug: src.slug,
      url: src.base_url + (cfg.path || ''),
      keyword: kw, page,
      item_path: cfg.item_path,
      body,
    }});
  }
}
return out;
