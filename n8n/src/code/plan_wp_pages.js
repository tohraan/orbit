/* W02 · WordPress REST ingest — turn one `sources` row + the probe response
 * into an explicit list of page URLs. Explicit paging beats the HTTP node's
 * built-in pagination here: WP returns HTTP 400 past the last page, and we
 * want the x-wp-totalpages header to decide, not an error.
 * LIB */
const src   = $('Loop Sources').first().json;
const probe = $input.first().json;

const cfg      = src.config || {};
const perPage  = cfg.per_page || 100;
const headers  = probe.headers || {};

// The probe deliberately asks for per_page=1 (it only wants the count), so its
// `x-wp-totalpages` is the number of ONE-item pages -- i.e. the item count, not
// the page count at our real per_page. Using it directly asked WordPress for
// pages that do not exist and got back 400 "The page number requested is larger
// than the number of pages available." for every page past the real last one.
// Always derive the page count from x-wp-total and the per_page we will use.
const total      = parseInt(headers['x-wp-total'] || '0', 10) || 0;
const totalPages = Math.min(Math.max(Math.ceil(total / perPage), 1), cfg.max_pages || 20);

// Only ask for the fields we actually store. class_list carries country-* and
// funding_type-* (those taxonomies are not exposed as REST routes).
// `publishpress_future_action` is the site's own scheduled expiry: on that date
// it files the post into the expire category. Measured on 100 live posts: 100%
// carry a date and 76 target category 2769, and the date matches the deadline we
// otherwise scrape out of an Elementor widget (smithsonian-institution-fellowship
// -> 2026-10-15, identical). A structured deadline beats parsing prose.
// `class_list` additionally carries tag-* terms (436 distinct) that encode
// funding, degree level, country and deadline month.
const FIELDS = ['id','slug','link','date_gmt','modified_gmt','title','excerpt',
                'content','categories','class_list','di_urgency','tags',
                'publishpress_future_action',
                'yoast_head_json','jetpack_featured_media_url'].join(',');

// Incremental: only posts touched since our last clean run, minus a safety lap.
const since = src.last_success_at
  ? new Date(new Date(src.last_success_at).getTime() - 36e5).toISOString().slice(0, 19)
  : null;

const items = [];
for (let page = 1; page <= totalPages; page++) {
  const params = qs({
    per_page: String(perPage), page: String(page),
    orderby: 'modified', order: 'desc', _fields: FIELDS,
  });
  if (since) params.set('modified_after', since);
  if (Array.isArray(cfg.exclude_categories) && cfg.exclude_categories.length)
    params.set('categories_exclude', cfg.exclude_categories.join(','));
  items.push({ json: {
    source_slug: src.slug,
    page,
    total_pages: totalPages,
    total_items: total,
    incremental: Boolean(since),
    url: `${src.base_url}/posts?${params.toString()}`,
  }});
}
if (!items.length) items.push({ json: { source_slug: src.slug, page: 0, total_items: 0, url: null, skip: true } });
return items;
