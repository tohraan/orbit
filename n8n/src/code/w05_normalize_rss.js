/* W05 · RSS item -> raw_items row. Feeds give title/link/date/summary only;
 * everything else is the detail fetch (W03) plus the classifier (W09).
 * LIB */
const src = $('Loop Sources').first().json;
const nowISO = new Date().toISOString();

const out = [];
for (const item of $input.all()) {
  const r = item.json;
  const link = r.link || r.guid || r.id;
  if (!link) continue;
  const title = plain(r.title || '');
  if (!title) continue;
  const summary = plain(r.contentSnippet || r.content || r.description || r.summary || '').slice(0, 4000);
  const dl = extractDeadline(`${title} ${summary}`);
  const payload = {
    external_id: String(r.guid || r.id || link),
    url: link,
    title,
    summary,
    categories: [].concat(r.categories || []).map(c => (typeof c === 'string' ? c : c && c._ ? c._ : '')).filter(Boolean),
    deadline: dl.deadline,
    deadline_kind: dl.deadline_kind,
    deadline_note: dl.deadline_note,
    image_url: (r.enclosure || {}).url || null,
    source_published_at: r.isoDate || r.pubDate || null,
    country_hint: null, funding_hint: null, type_hint: null, level_hints: [],
  };
  out.push({ json: {
    source_slug: src.slug,
    external_id: payload.external_id,
    url: link,
    payload,
    content_hash: fingerprint(title, src.slug, payload.source_published_at),
    needs_detail: Boolean((src.config || {}).needs_detail),
    last_seen_at: nowISO,
  }});
}
return out;
