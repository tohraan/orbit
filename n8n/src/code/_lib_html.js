/* ------------------------------------------------------------------ *
 * _lib_html.js — shared HTML/date helpers.
 * Injected verbatim at the TOP of every n8n Code node that needs it
 * (see n8n/build.py -> LIB marker). Also unit-tested by tests/parse.test.mjs.
 * Pure functions only: no n8n globals, no require().
 * ------------------------------------------------------------------ */

const MONTHS = ['january','february','march','april','may','june','july',
                'august','september','october','november','december'];

/** Strip tags/entities/scripts -> single-spaced plain text. */
function plain(html) {
  return String(html || '')
    .replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|li|div|h[1-6]|tr)>/gi, '\n')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;|&#038;/gi, '&')
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&apos;|&#8217;|&rsquo;/gi, "'")
    .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, c) => String.fromCharCode(+c))
    .replace(/[ \t ]+/g, ' ')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .trim();
}

/**
 * Split a document into heading-delimited sections.
 * FIX vs the old pipeline: a section ends at the next heading of the SAME OR
 * HIGHER rank (h2 ends at the next h2, not at a nested h3), so an <h2> that is
 * immediately followed by an <h3> no longer yields an empty body.
 * Nested lower-rank headings are kept inline as part of the body text.
 */
function sections(html) {
  const h = String(html || '');
  const marks = [];
  const re = /<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi;
  let m;
  while ((m = re.exec(h)) !== null) {
    marks.push({
      level: +m[1],
      heading: plain(m[2]),
      bodyStart: m.index + m[0].length,
      start: m.index,
    });
  }
  return marks.map((mk, i) => {
    let end = h.length;
    for (let j = i + 1; j < marks.length; j++) {
      if (marks[j].level <= mk.level) { end = marks[j].start; break; }
    }
    return { level: mk.level, heading: mk.heading, text: plain(h.slice(mk.bodyStart, end)) };
  }).filter(s => s.heading);
}

/** First section whose heading matches any keyword; longest body wins on ties. */
function pickSection(secs, keywords, minLen = 25) {
  const hits = secs.filter(s =>
    keywords.some(k => s.heading.toLowerCase().includes(k)) && s.text.length >= minLen);
  if (!hits.length) return '';
  return hits.sort((a, b) => b.text.length - a.text.length)[0].text;
}

/** "October 15, 2026" | "15 October 2026" | "2026-10-15" -> "2026-10-15" */
function toISODate(s) {
  if (!s) return null;
  const t = String(s).trim();
  let m = t.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = t.match(/([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})/);
  if (m) {
    const i = MONTHS.findIndex(x => x.startsWith(m[1].toLowerCase().slice(0, 3)));
    if (i >= 0) return `${m[3]}-${String(i + 1).padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  }
  m = t.match(/(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\.?,?\s+(\d{4})/);
  if (m) {
    const i = MONTHS.findIndex(x => x.startsWith(m[2].toLowerCase().slice(0, 3)));
    if (i >= 0) return `${m[3]}-${String(i + 1).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  return null;
}

/**
 * Deadline from a rendered page. opportunitiescircle renders it as a bare
 * Elementor text widget: "Deadline: October 15, 2026" (there is no table and
 * no ACF field — verified 2026-09-30).
 */
function extractDeadline(html) {
  const text = plain(html);
  const pats = [
    /(?:application\s+)?deadline\s*:?\s*([A-Za-z]{3,9}\.?\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4})/i,
    /(?:application\s+)?deadline\s*:?\s*(\d{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]{3,9},?\s+\d{4})/i,
    /(?:closing|close[sd]?\s+on|last\s+date|apply\s+by|due)\s*:?\s*([A-Za-z]{3,9}\.?\s+\d{1,2},?\s+\d{4})/i,
    /deadline\s*:?\s*(\d{4}-\d{2}-\d{2})/i,
  ];

  // "different for each course" / "varies by university" -> no single date exists.
  const variesM = text.match(/deadline[^.]{0,80}\b(is\s+different|differs|varies|depends)\b[^.]{0,120}\./i)
               || text.match(/\b(varies|differs)\s+(by|for|from)\s+(each\s+)?(course|programme|program|university|institution|department|country)[^.]{0,80}\./i);

  for (const p of pats) {
    const m = text.match(p);
    const iso = m && toISODate(m[1]);
    if (iso) return { deadline: iso, deadline_kind: 'fixed', deadline_note: null };
  }
  if (variesM)
    return { deadline: null, deadline_kind: 'varies', deadline_note: variesM[0].trim().slice(0, 240) };
  if (/\b(rolling\s+(basis|deadline|admission)|no\s+deadline|open\s+all\s+year|year[-\s]round|until\s+filled|ongoing|accepted\s+throughout)\b/i.test(text))
    return { deadline: null, deadline_kind: 'rolling', deadline_note: null };
  return { deadline: null, deadline_kind: 'unknown', deadline_note: null };
}

/* Hosts that are the aggregator's own funnel/ads, never the real apply target. */
const LINK_DENY = /(opportunitiescircle|opcircleacademy|nextgenyouthcamp|opportunitydesk|scholars4dev|youthop|facebook|fb\.me|twitter|x\.com|linkedin|whatsapp|wa\.me|telegram|t\.me|instagram|youtube|pinterest|reddit|tiktok|bit\.ly|rebrand\.ly|tinyurl|cutt\.ly|shorturl|googletagmanager|google-analytics|doubleclick|googlesyndication|gstatic|adservice|yandex|larapush|onesignal|gravatar|wp\.com|jetpack|gmpg\.org|w3\.org|schema\.org|paypal|amzn|amazon\.)/i;

/** Best-effort official application URL. */
function extractApplyLink(html, sectionText) {
  const h = String(html || '');
  const anchors = [...h.matchAll(/<a\b[^>]*href=["'](https?:\/\/[^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)]
    .map(a => ({ href: a[1].replace(/&#0?38;|&amp;/g, '&'), text: plain(a[2]), at: a.index }))
    .filter(a => !LINK_DENY.test(a.href));
  if (!anchors.length) return '';

  // 1. Elementor button widgets (this theme renders "Apply Now" as button.default)
  const btnZones = [...h.matchAll(/data-widget_type="button\.default"[\s\S]{0,1200}?<\/div>/gi)]
    .map(z => ({ from: z.index, to: z.index + z[0].length }));
  const inBtn = anchors.filter(a => btnZones.some(z => a.at >= z.from && a.at <= z.to));
  if (inBtn.length) return inBtn[inBtn.length - 1].href;

  // 2. Anchor text that says so
  const byText = anchors.filter(a => /\b(apply|application|official|register|submit|website|portal|more info)\b/i.test(a.text));
  if (byText.length) return byText[byText.length - 1].href;

  // 3. Anything inside the application-process section
  if (sectionText) {
    const hit = anchors.find(a => sectionText.includes(a.text) && a.text.length > 3);
    if (hit) return hit.href;
  }
  return anchors[anchors.length - 1].href;
}

/** og:/meta lookup that tolerates either attribute order. */
function meta(html, name) {
  const h = String(html || '');
  const a = h.match(new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]+content=["']([^"']*)["']`, 'i'));
  const b = h.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${name}["']`, 'i'));
  return plain((a || b || [])[1] || '');
}

/** Stable identity for cross-source dedupe. */
function fingerprint(title, orgOrCountry, deadline) {
  const norm = s => String(s || '').toLowerCase()
    .replace(/\b(20\d{2})([-/]\d{2,4})?\b/g, ' ')            // drop edition years
    .replace(/\b(fully|partially|partial)?\s*funded\b/g, ' ')
    .replace(/\b(scholarship|fellowship|internship|grant|programme|program|award)s?\b/g, ' $&')
    .replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
  const basis = `${norm(title)}|${norm(orgOrCountry)}|${deadline || 'rolling'}`;
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  for (let i = 0; i < basis.length; i++) {
    h1 = (h1 ^ basis.charCodeAt(i)) * 0x01000193 >>> 0;
    h2 = (h2 + basis.charCodeAt(i) * (i + 7)) >>> 0;
  }
  return (h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0'));
}

if (typeof module !== 'undefined') module.exports = {
  plain, sections, pickSection, toISODate, extractDeadline,
  extractApplyLink, meta, fingerprint, LINK_DENY, MONTHS,
};
