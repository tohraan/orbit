/* W03 · parse a fetched detail page into structured fields.
 * This replaces the old <article>+heading parser, whose sections came back empty
 * because an <h2> followed immediately by an <h3> captured only whitespace.
 * LIB */
const row  = $('Loop Detail Queue').first().json;
const resp = $input.first().json;
const html = typeof resp.data === 'string' ? resp.data
           : typeof resp.body === 'string' ? resp.body
           : typeof resp === 'string' ? resp : '';

if (!html || html.length < 500) {
  return { json: { id: row.id, detail_error: `empty or short response (${html.length} bytes)`,
                   detail_fetched_at: new Date().toISOString(), detail: null } };
}

const secs = sections(html);
const how  = pickSection(secs, ['how to apply', 'application process', 'application procedure', 'how do i apply']);
const dl   = extractDeadline(html);

const detail = {
  page_title:  meta(html, 'og:title') || plain((html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || [])[1]),
  description: meta(html, 'og:description') || meta(html, 'description'),
  image_url:   meta(html, 'og:image'),
  published:   meta(html, 'article:published_time'),
  modified:    meta(html, 'article:modified_time'),
  deadline:      dl.deadline,
  deadline_kind: dl.deadline_kind,
  deadline_note: dl.deadline_note,
  eligibility: pickSection(secs, ['eligib', 'who can apply', 'requirement', 'criteria']).slice(0, 8000),
  benefits:    pickSection(secs, ['benefit', 'coverage', 'what you get', 'what will you get', 'award', 'funding covers']).slice(0, 8000),
  how_to_apply: how.slice(0, 8000),
  documents:   pickSection(secs, ['document', 'required document', 'checklist']).slice(0, 4000),
  apply_link:  extractApplyLink(html, how),
  headings:    secs.filter(s => s.level <= 3).map(s => s.heading).slice(0, 25),
  full_text:   plain(html).slice(0, 12000),
};

return { json: {
  id: row.id,
  detail,
  detail_fetched_at: new Date().toISOString(),
  detail_error: null,
  needs_detail: false,
}};
