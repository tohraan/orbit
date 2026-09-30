/* W02 · WordPress REST ingest — turn one `sources` row + the probe response
 * into an explicit list of page URLs. Explicit paging beats the HTTP node's
 * built-in pagination here: WP returns HTTP 400 past the last page, and we
 * want the x-wp-totalpages header to decide, not an error. */
const src   = $('Loop Sources').first().json;
const probe = $input.first().json;

const cfg      = src.config || {};
const perPage  = cfg.per_page || 100;
const headers  = probe.headers || {};
const totalPages = Math.min(parseInt(headers['x-wp-totalpages'] || '1', 10) || 1, cfg.max_pages || 20);
const total      = parseInt(headers['x-wp-total'] || '0', 10) || 0;

// Only ask for the fields we actually store. class_list carries country-* and
// funding_type-* (those taxonomies are not exposed as REST routes).
const FIELDS = ['id','slug','link','date_gmt','modified_gmt','title','excerpt',
                'content','categories','class_list','di_urgency',
                'yoast_head_json','jetpack_featured_media_url'].join(',');

// Incremental: only posts touched since our last clean run, minus a safety lap.
const since = src.last_success_at
  ? new Date(new Date(src.last_success_at).getTime() - 36e5).toISOString().slice(0, 19)
  : null;

const items = [];
for (let page = 1; page <= totalPages; page++) {
  const qs = new URLSearchParams({
    per_page: String(perPage), page: String(page),
    orderby: 'modified', order: 'desc', _fields: FIELDS,
  });
  if (since) qs.set('modified_after', since);
  if (Array.isArray(cfg.exclude_categories) && cfg.exclude_categories.length)
    qs.set('categories_exclude', cfg.exclude_categories.join(','));
  items.push({ json: {
    source_slug: src.slug,
    page,
    total_pages: totalPages,
    total_items: total,
    incremental: Boolean(since),
    url: `${src.base_url}/posts?${qs.toString()}`,
  }});
}
if (!items.length) items.push({ json: { source_slug: src.slug, page: 0, total_items: 0, url: null, skip: true } });
return items;
