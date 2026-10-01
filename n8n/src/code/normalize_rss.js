/* W05 · RSS item -> raw_items row. Feeds give title/link/date/summary only;
 * everything else is the detail fetch (W03) plus the classifier (W09).
 * LIB */
const src = $('Loop Sources').first().json;
const nowISO = new Date().toISOString();
// Some funder feeds are site-wide news; the registry decides what counts.
const passes = sourceFilter(src.config);
const rejected = {};   // reason -> count, logged below for auditability
let dropped = 0;

const out = [];
for (const item of $input.all()) {
  const r = item.json;
  const link = r.link || r.guid || r.id;
  if (!link) continue;
  const title = plain(r.title || '');
  if (!title) continue;
  const summary = plain(r.contentSnippet || r.content || r.description || r.summary || '').slice(0, 4000);
  if (!passes(`${title} ${summary}`)) { dropped++; continue; }
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
    source_name: src.name || src.slug,
    source_tier: src.authority_tier,
    source_trust: src.trust_score,
    source_published_at: r.isoDate || r.pubDate || null,
    country_hint: null, funding_hint: null, type_hint: null, level_hints: [],
  };
  if (isPastDeadline(payload.deadline)) continue;   // already closed -> never stored
  // listicle, or restricted to a nationality that is not ours -- see audienceReject()
  const reject = audienceReject(payload.title, payload.summary);
  if (reject) { rejected[reject] = (rejected[reject] || 0) + 1; continue; }
  if (payload.deadline && !plausibleDeadline(payload.deadline)) {
    payload.deadline = null;
    payload.deadline_kind = 'rolling';
  }
  out.push({ json: {
    source_slug: src.slug,
    external_id: payload.external_id,
    url: link,
    payload,
    // promoted out of the payload: PostgREST cannot ORDER BY a jsonb path
    deadline: payload.deadline || null,
    deadline_kind: payload.deadline_kind || null,
    content_hash: fingerprint(title, src.slug, payload.source_published_at),
    needs_detail: Boolean((src.config || {}).needs_detail),
    last_seen_at: nowISO,
  }});
}
if (dropped) console.log(`${src.slug}: dropped ${dropped} off-topic item(s) by registry filter`);
return out;
