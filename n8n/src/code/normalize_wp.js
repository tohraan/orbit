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
    // WP serialises these as arrays on most themes, but opportunitydesk.org
    // returns `class_list` as an object keyed by index ({"0":"post-178813",...}).
    // Coerce before touching them, or .filter() throws and kills the whole run.
    const arr = (v) => Array.isArray(v) ? v
                     : (v && typeof v === 'object') ? Object.values(v) : [];
    const classes = arr(p.class_list);
    const tag = (prefix) => classes
      .filter(c => c.startsWith(prefix))
      .map(c => c.slice(prefix.length).replace(/-/g, ' ').trim())
      .filter(Boolean);

    const cats    = arr(p.categories);
    const mapped  = cats.map(c => catMap[String(c)]).filter(Boolean);
    const levels  = [...new Set(mapped.flatMap(m => m.levels || []))];

    // A post usually sits in several categories at once, so the type must be
    // CHOSEN, not taken from whichever happened to be listed first. Without
    // this, "AfDB Internship Program" lands as `job` because opportunitydesk
    // files it under both Hot Jobs and Internships. Most specific wins.
    const TYPE_RANK = ['research_internship','fellowship','assistantship','scholarship',
                       'internship','grant','summer_school','exchange','competition',
                       'award','training','conference','job','other'];
    const pickType = (ms) => {
      const have = new Set(ms.map(m => m.type).filter(Boolean));
      for (const t of TYPE_RANK) if (have.has(t)) return t;
      return have.values().next().value || null;
    };
    const urgency = arr(p.di_urgency)[0] || null;

    // --- the site's own scheduled expiry, used as a structured deadline.
    // It fires `action: category` moving the post into the expire bucket, so a
    // target term inside exclude_categories means "this closes on that date".
    const pp = p.publishpress_future_action || {};
    const ppTerms = arr(pp.terms).map(Number);
    const excl = arr(cfg.exclude_categories).map(Number);
    const ppIsExpiry = Boolean(pp.enabled) && ppTerms.some(x => excl.includes(x));
    const ppDate = typeof pp.date === 'string' ? pp.date.slice(0, 10) : null;
    const scheduledExpiry = ppIsExpiry && /^\d{4}-\d{2}-\d{2}$/.test(ppDate || '') ? ppDate : null;
    // A sentinel or implausibly distant date is not a deadline -- see
    // plausibleDeadline(). Keep the row, just do not claim a date we do not have.
    const safeExpiry = plausibleDeadline(scheduledExpiry);

    // --- tag-* terms carry funding / level / country / deadline-month hints
    const tagTerms = tag('tag-');
    const hasTag = (re) => tagTerms.some(x => re.test(x));
    let fundingFromTags = null;
    if (hasTag(/^fully funded/)) fundingFromTags = 'fully_funded';
    else if (hasTag(/partially funded/)) fundingFromTags = 'partially_funded';
    else if (hasTag(/^fundedptu|tuition/)) fundingFromTags = 'tuition_waiver';
    const levelsFromTags = [];
    if (hasTag(/undergraduate|bachelor/)) levelsFromTags.push('bachelors');
    if (hasTag(/master/)) levelsFromTags.push('masters');
    if (hasTag(/phd|doctoral/)) levelsFromTags.push('phd');
    if (hasTag(/postdoc/)) levelsFromTags.push('postdoc');

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
      funding_hint: tag('funding_type-')[0] || fundingFromTags || null,
      tags: tagTerms,
      deadline: safeExpiry,
      deadline_kind: safeExpiry ? 'fixed' : 'unknown',
      deadline_source: safeExpiry ? 'site_scheduled_expiry' : null,
      category_ids: cats,
      type_hint: pickType(mapped),
      level_hints: [...new Set([...levels, ...levelsFromTags])],
      urgency_term: urgency,
      source_says_expired:   urgency === cfg.expired_urgency_term,
      source_says_no_deadline: urgency === cfg.no_deadline_urgency_term,
      source_name: src.name || src.slug,
      source_tier: src.authority_tier,
      source_trust: src.trust_score,
      source_published_at: p.date_gmt ? p.date_gmt + 'Z' : null,
      source_modified_at:  p.modified_gmt ? p.modified_gmt + 'Z' : null,
    };

    // Closed opportunities are not stored at all. A student cannot act on them,
    // and keeping them means paying to re-parse dead pages on every run.
    // Unknown deadlines are KEPT -- absence of a date is not evidence it closed.
    if (payload.source_says_expired || isPastDeadline(scheduledExpiry)) continue;

    // The site's own "Expired" bucket is authoritative and free — don't spend a
    // detail fetch on 1100+ dead posts. robots.txt is honoured here rather than
    // at fetch time, so a disallowed page is never even queued.
    const skipDetail = payload.source_says_expired
                    || !robotsAllows(payload.url, cfg.robots_disallow);

    out.push({ json: {
      source_slug: src.slug,
      external_id: payload.external_id,
      url: payload.url,
      payload,
      // promoted out of the payload: PostgREST cannot ORDER BY a jsonb path
      deadline: payload.deadline || null,
      deadline_kind: payload.deadline_kind || null,
      content_hash: fingerprint(payload.title + payload.summary, payload.country_hint, payload.source_modified_at),
      needs_detail: Boolean(cfg.needs_detail) && !skipDetail,
      last_seen_at: new Date().toISOString(),
    }});
  }
}
return out;
