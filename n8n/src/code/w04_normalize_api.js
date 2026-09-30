/* W04 · POST-API response -> raw_items rows. One branch per source shape;
 * everything unknown falls through to a generic mapper so a newly registered
 * post_api source still lands data instead of throwing.
 * LIB */
const nowISO = new Date().toISOString();
const dig = (obj, path) => (path || '').split('.').filter(Boolean)
  .reduce((o, k) => (o == null ? o : o[k]), obj);

const out = [];
// HTTP Request emits exactly one item per input item, so index pairing is safe
// and cheaper than threading the request descriptor through the response body.
const plans = $('Plan API Requests').all();
const items = $input.all();
for (let i = 0; i < items.length; i++) {
  const item  = items[i];
  const meta0 = (plans[i] || {}).json || {};
  const slug  = meta0.source_slug;
  const body  = item.json.body !== undefined ? item.json.body : item.json;
  const rows  = dig(body, meta0.item_path) || [];
  if (!Array.isArray(rows)) continue;

  for (const r of rows) {
    let p;
    if (slug === 'grants_gov') {
      p = {
        external_id: String(r.id),
        url: `https://www.grants.gov/search-results-detail/${r.id}`,
        title: r.title,
        organisation: r.agencyName || r.agencyCode,
        opp_number: r.number,
        summary: null,                        // needs /fetchOpportunity
        deadline: toISODate(r.closeDate) || null,
        deadline_kind: r.closeDate ? 'fixed' : 'unknown',
        source_published_at: toISODate(r.openDate),
        country_hint: 'USA',
        funding_hint: null,
        type_hint: /fellow/i.test(r.title || '') ? 'fellowship'
                 : /scholar/i.test(r.title || '') ? 'scholarship' : 'grant',
        level_hints: [],
        raw: r,
      };
    } else if (slug === 'nih_reporter') {
      const org = r.organization || {};
      const pi  = (r.principal_investigators || [])[0] || {};
      p = {
        external_id: String(r.project_num || r.appl_id),
        url: `https://reporter.nih.gov/project-details/${r.appl_id}`,
        title: r.project_title,
        organisation: org.org_name,
        summary: (r.abstract_text || '').slice(0, 4000),
        deadline: null, deadline_kind: 'rolling',
        deadline_note: 'Awarded project — contact the PI directly about openings.',
        source_published_at: r.award_notice_date || null,
        country_hint: org.org_country || 'USA',
        funding_hint: 'stipend_only',
        type_hint: 'research_internship',
        level_hints: ['masters', 'phd', 'postdoc'],
        pi_name: [pi.first_name, pi.last_name].filter(Boolean).join(' '),
        pi_email: null,
        raw: { appl_id: r.appl_id, fy: r.fiscal_year, terms: r.terms, org_city: org.org_city },
      };
    } else {
      p = {
        external_id: String(r.id || r.guid || r.identifier || r.code || JSON.stringify(r).slice(0, 60)),
        url: r.url || r.link || null,
        title: r.title || r.name || '',
        organisation: r.organisation || r.organization || null,
        summary: (r.description || r.abstract || r.summary || '').slice(0, 4000),
        deadline: toISODate(r.deadline || r.closeDate || r.endDate) || null,
        deadline_kind: 'unknown',
        country_hint: r.country || null,
        funding_hint: null, type_hint: null, level_hints: [],
        raw: r,
      };
    }
    if (!p.title) continue;
    out.push({ json: {
      source_slug: slug,
      external_id: p.external_id,
      url: p.url,
      payload: p,
      content_hash: fingerprint(p.title, p.organisation || p.country_hint, p.deadline),
      needs_detail: false,
      last_seen_at: nowISO,
    }});
  }
}
return out;
