/* W02 · WordPress post -> raw_items row.
 * Country / funding_type / degree level all come out of this single list call;
 * no per-post request is needed for them. Deadline + eligibility do need the
 * detail page (ACF is empty on this theme), so we flag needs_detail.
 * LIB */
const src = $('Loop Sources').first().json;
const cfg = src.config || {};
const catMap = cfg.category_map || {};

const out = [];
for (const item of $input.all()) {
  const posts = Array.isArray(item.json.body) ? item.json.body
              : Array.isArray(item.json)      ? item.json
              : item.json.id ? [item.json] : [];
  for (const p of posts) {
    if (!p || !p.id) continue;
    const classes = p.class_list || [];
    const tag = (prefix) => classes
      .filter(c => c.startsWith(prefix))
      .map(c => c.slice(prefix.length).replace(/-/g, ' ').trim())
      .filter(Boolean);

    const cats    = p.categories || [];
    const mapped  = cats.map(c => catMap[String(c)]).filter(Boolean);
    const levels  = [...new Set(mapped.flatMap(m => m.levels || []))];
    const urgency = (p.di_urgency || [])[0] || null;

    const y = p.yoast_head_json || {};
    const payload = {
      external_id: String(p.id),
      url: p.link,
      slug: p.slug,
      title: plain((p.title || {}).rendered || y.og_title || ''),
      summary: plain((p.excerpt || {}).rendered || y.og_description || y.description || ''),
      body_html: ((p.content || {}).content || (p.content || {}).rendered || ''),
      image_url: p.jetpack_featured_media_url || ((y.og_image || [])[0] || {}).url || null,
      country_hint: tag('country-')[0] || null,
      funding_hint: tag('funding_type-')[0] || null,
      category_ids: cats,
      type_hint: (mapped[0] || {}).type || null,
      level_hints: levels,
      urgency_term: urgency,
      source_says_expired:   urgency === cfg.expired_urgency_term,
      source_says_no_deadline: urgency === cfg.no_deadline_urgency_term,
      source_published_at: p.date_gmt ? p.date_gmt + 'Z' : null,
      source_modified_at:  p.modified_gmt ? p.modified_gmt + 'Z' : null,
    };

    // The site's own "Expired" bucket is authoritative and free — don't spend a
    // detail fetch on 1100+ dead posts.
    const skipDetail = payload.source_says_expired;

    out.push({ json: {
      source_slug: src.slug,
      external_id: payload.external_id,
      url: payload.url,
      payload,
      content_hash: fingerprint(payload.title + payload.summary, payload.country_hint, payload.source_modified_at),
      needs_detail: Boolean(cfg.needs_detail) && !skipDetail,
      last_seen_at: new Date().toISOString(),
    }});
  }
}
return out;
