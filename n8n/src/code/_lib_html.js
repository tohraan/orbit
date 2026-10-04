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
/* Remove everything that is not this page's own prose, then section what is
 * left.
 *
 * WHY THIS EXISTS. sections() used to run over the entire document, and an
 * opportunitiescircle listing carries SIXTEEN <article> elements: all of them
 * related-post cards. Every heading inside them was treated as a section of
 * the page being parsed, so one post's "How to Apply" became another post's
 * instructions.
 *
 * Measured on 2026-10-04, before the fix: of 135 stored rows with a
 * how_to_apply, only 48 were distinct, and 78 carried the SAME text — the
 * Stanford Venture Fellowship's application steps — on listings for unrelated
 * scholarships. A student reading how to apply was reading the wrong
 * programme's instructions 58% of the time.
 *
 * SUBTRACTIVE, NOT SELECTIVE, and that distinction cost a round to learn. The
 * first attempt picked the largest <article> as the post body, which is how
 * most WordPress themes are built. Elementor is not most themes: the body
 * lives in widget <div>s and the only <article> elements on the page are the
 * cards. Selecting one kept 0.2% of the document and found no sections at all.
 * So nothing is selected — known chrome and known card markup are removed, and
 * whatever remains is the page.
 *
 * For the same reason "widget" is NOT in the class denylist, tempting as it
 * reads: Elementor names every content block elementor-widget-*, so denying it
 * deletes the article itself.
 */
function mainContent(html) {
  let h = String(html || '');

  // Chrome that never contains the listing's own prose.
  h = h.replace(/<(nav|aside|footer|header|form|noscript|script|style)\b[\s\S]*?<\/\1>/gi, ' ');

  // Post CARDS: a teaser for a different opportunity, carrying its headings.
  // Matched on the markup grid/loop builders emit rather than on a site's
  // bespoke class names, so this is not specific to one theme.
  h = h.replace(
    /<article\b[^>]*\bclass\s*=\s*["'][^"']*\b(?:grid-item|post-loop|elementor-post|post-card|entry-card)\b[^"']*["'][\s\S]*?<\/article>/gi,
    ' ');

  // Related / recommended / comment blocks named by class or id.
  h = h.replace(
    /<(section|div|ul)\b[^>]*\b(?:class|id)\s*=\s*["'][^"']*\b(?:related|recommend|popular|trending|also-like|you-may|more-from|comments?|post-navigation|nav-links)\b[^"']*["'][\s\S]*?<\/\1>/gi,
    ' ');

  /* A strip that removed nearly everything has misread the page, so the
   * original is returned instead: parsing a document with some noise in it
   * beats parsing an empty string.
   *
   * The test is PROPORTIONAL, and the first version was not. A flat "keep the
   * original under 1000 characters" fired on every small document — including
   * a fixture that was nothing BUT a card, where stripping correctly left
   * almost nothing and the guard then handed the card straight back. Only a
   * big page that collapsed to a sliver indicates a misread. */
  const src = String(html || '');
  if (src.length > 4000 && h.length < src.length * 0.02) return src;
  return h;
}

function sections(html) {
  const h = mainContent(html);
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

/* First section whose heading matches any keyword, IN DOCUMENT ORDER.
 *
 * It used to return the longest match, which is what let a foreign block win:
 * when a page carried both its own "How to Apply" and a bigger one from a
 * related post, the bigger one was chosen every time. Document order is the
 * better rule because a page states its own business before it advertises
 * anything else — the content is above the recommendations, always.
 *
 * mainContent() should now remove those blocks before this ever runs. This is
 * the second line of defence, and it is kept deliberately: the class names a
 * site uses for its related-post markup are not a contract, and the day one
 * changes, the ordering rule still returns the page's own section rather than
 * silently preferring a stranger's.
 */
function pickSection(secs, keywords, minLen = 25) {
  const hit = secs.find(s =>
    keywords.some(k => s.heading.toLowerCase().includes(k)) && s.text.length >= minLen);
  return hit ? hit.text : '';
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
  // Slash form. grants.gov returns closeDate as MM/DD/YYYY ("10/14/2030") and
  // every one of its 651 rows was losing its deadline here.
  // a/b/YYYY is genuinely ambiguous, so: a>12 means a is the day (DD/MM),
  // b>12 means b is the day (MM/DD), and an ambiguous pair falls back to US
  // MM/DD because that is the only slash-format source in the registry.
  m = t.match(/^(\d{1,2})[\/.](\d{1,2})[\/.](\d{4})/);
  if (m) {
    let a = parseInt(m[1], 10), b = parseInt(m[2], 10);
    let month, day;
    if (a > 12 && b <= 12) { day = a; month = b; }
    else if (b > 12 && a <= 12) { month = a; day = b; }
    else if (a <= 12 && b <= 12) { month = a; day = b; }   // ambiguous -> US
    else return null;
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return `${m[3]}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
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
const LINK_DENY = /(opportunitiescircle|opcircleacademy|nextgenyouthcamp|svfellow|opportunitydesk|scholars4dev|youthop|facebook|fb\.me|twitter|x\.com|linkedin|whatsapp|wa\.me|telegram|t\.me|instagram|youtube|pinterest|reddit|tiktok|bit\.ly|rebrand\.ly|tinyurl|cutt\.ly|shorturl|googletagmanager|google-analytics|doubleclick|googlesyndication|gstatic|adservice|yandex|larapush|onesignal|gravatar|wp\.com|jetpack|gmpg\.org|w3\.org|schema\.org|paypal|amzn|amazon\.)/i;

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

/* Is this deadline already gone? Compared in UTC, date-only -- a deadline has
 * no timezone (CONTEXT.md §9.7). Unknown/!parseable -> false, i.e. keep it:
 * never discard an opportunity just because we could not read its date. */
function isPastDeadline(d, today) {
  if (!d || !/^\d{4}-\d{2}-\d{2}/.test(String(d))) return false;
  const ref = today || new Date().toISOString().slice(0, 10);
  return String(d).slice(0, 10) < ref;
}

/* A deadline far enough out is not a deadline -- it is a sentinel. grants.gov
 * uses 2099-01-01 to mean "no real close date", and showing a student a date 73
 * years away is worse than showing none. Returns the date when it is plausible,
 * otherwise null so the caller can fall back to a rolling/unknown kind.
 *
 * Window: not before `today`, and not more than `maxYears` ahead (default 10 --
 * the longest genuine deadline seen in the registry is grants.gov's 2030). */
function plausibleDeadline(d, today, maxYears) {
  if (!d || !/^\d{4}-\d{2}-\d{2}/.test(String(d))) return null;
  const date = String(d).slice(0, 10);
  const ref = today || new Date().toISOString().slice(0, 10);
  if (date < ref) return null;                       // already closed
  const horizon = String(Number(ref.slice(0, 4)) + (maxYears || 10)) + ref.slice(4);
  if (date > horizon) return null;                   // sentinel / data error
  return date;
}

/* ---- funding / duration / timeline extraction -------------------------------
 * Students cannot judge an opportunity from a title and a deadline. These pull
 * the money, the length and the start out of the rendered page.
 *
 * Measured over 40 live detail pages (2026-10-01): a currency amount appears in
 * 97%, stipend wording in 57%, a duration in 37%, timeline wording in 32%.
 * Benefits text alone only carried money in 19/40, so these read the whole page.
 * Everything returns null rather than a guess when nothing matches. */

const CUR_SYMBOL = { '$': 'USD', '£': 'GBP', '€': 'EUR', '₹': 'INR' };
const CUR_WORD = /^(USD|EUR|GBP|CHF|AED|INR|CAD|AUD|SGD|JPY|SEK|NOK|DKK)$/i;
const PERIOD_RE = /\b(per|a|each|\/)\s*(month|year|annum|week|semester|term)\b/i;

/* Every monetary amount on the page, newest-style first. Returns
 * [{ currency, amount, period, raw }] -- period is null when unqualified. */
function extractAmounts(text, limit = 8) {
  const t = String(text || '').replace(/\s+/g, ' ');
  const out = [];
  const seen = new Set();
  // symbol-prefixed ($45,000) or word-suffixed (45000 EUR)
  const re = /(US\$|[\$£€₹])\s?([\d][\d,]*(?:\.\d+)?)|([\d][\d,]*(?:\.\d+)?)\s?([A-Z]{3})\b/g;
  let m;
  while ((m = re.exec(t)) !== null && out.length < limit) {
    let currency, digits;
    if (m[1]) {
      currency = m[1] === 'US$' ? 'USD' : (CUR_SYMBOL[m[1]] || null);
      digits = m[2];
    } else {
      if (!CUR_WORD.test(m[4])) continue;
      currency = m[4].toUpperCase();
      digits = m[3];
    }
    const amount = Number(String(digits).replace(/,/g, ''));
    if (!isFinite(amount) || amount <= 0) continue;
    // a bare year like 2027 is not money
    if (!m[1] && amount >= 1900 && amount <= 2100 && !/[.,]/.test(digits)) continue;
    const tail = t.slice(m.index + m[0].length, m.index + m[0].length + 24);
    const pm = tail.match(PERIOD_RE);
    const period = pm ? pm[2].toLowerCase().replace('annum', 'year') : null;
    const key = `${currency}|${amount}|${period || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ currency, amount, period, raw: m[0].trim() });
  }
  return out;
}

/* Does the page actually promise money, and how much of it? */
function extractFunding(text) {
  const t = String(text || '');
  const amounts = extractAmounts(t);
  const has = (re) => re.test(t);
  const fully = has(/\bfully[-\s]?funded\b/i);
  const partial = has(/\bpartial(?:ly)?[-\s]?fund/i);
  const stipend = has(/\b(stipend|monthly allowance|living allowance|living (?:cost|expenses)|salary|honorarium)\b/i);
  const tuition = has(/\btuition\b/i);
  const travel = has(/\b(travel|airfare|flight)\s*(?:allowance|cost|expense|ticket)?s?\b/i);
  const accommodation = has(/\b(accommodation|housing|lodging|hostel)\b/i);
  const insurance = has(/\b(health|medical)\s+insurance\b/i);
  const unfunded = has(/\b(self[-\s]funded|unfunded|no funding|unpaid)\b/i);

  let kind = 'unknown';
  if (fully) kind = 'fully_funded';
  else if (unfunded) kind = 'unfunded';
  else if (partial) kind = 'partially_funded';
  else if (stipend && !tuition) kind = 'stipend_only';
  else if (tuition && !stipend) kind = 'tuition_waiver';
  else if (amounts.length || stipend || tuition) kind = 'partially_funded';

  const covers = [];
  if (stipend) covers.push('stipend');
  if (tuition) covers.push('tuition');
  if (travel) covers.push('travel');
  if (accommodation) covers.push('accommodation');
  if (insurance) covers.push('insurance');

  // the headline figure: prefer a periodic amount, else the largest
  let headline = amounts.find(a => a.period) || null;
  if (!headline && amounts.length) {
    headline = amounts.reduce((a, b) => (b.amount > a.amount ? b : a));
  }
  return { funding_kind: kind, covers, amounts, stipend: headline };
}

/* "12 months", "12-14 weeks", "two years" -> a normalised string. */
const WORD_NUM = { one:1, two:2, three:3, four:4, five:5, six:6, seven:7, eight:8,
                   nine:9, ten:10, eleven:11, twelve:12 };
function extractDuration(text) {
  const t = String(text || '').replace(/\s+/g, ' ');
  let m = t.match(/\b(\d{1,2})\s*(?:-|–|to)\s*(\d{1,2})\s*(month|year|week|semester)s?\b/i);
  if (m) return `${m[1]}-${m[2]} ${m[3].toLowerCase()}s`;
  m = t.match(/\b(\d{1,2})\s*(month|year|week|semester)s?\b/i);
  if (m) return `${m[1]} ${m[2].toLowerCase()}${m[1] === '1' ? '' : 's'}`;
  m = t.match(/\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)[-\s](month|year|week|semester)s?\b/i);
  if (m) {
    const n = WORD_NUM[m[1].toLowerCase()];
    return `${n} ${m[2].toLowerCase()}${n === 1 ? '' : 's'}`;
  }
  return null;
}

/* When it runs: an explicit start date, or a labelled programme period. */
function extractTimeline(text) {
  const t = String(text || '').replace(/\s+/g, ' ');
  let m = t.match(/\b(?:programme?|course|fellowship|internship|session)\s+dates?\s*:?\s*([^.;|]{4,70})/i);
  if (m) return m[1].trim();
  m = t.match(/\b(?:start(?:s|ing)?|commenc(?:es|ing)|begin(?:s|ning)?)\s+(?:in|on|from)\s+([A-Z][a-z]+\s+\d{4}|\d{1,2}\s+[A-Z][a-z]+\s+\d{4}|[A-Z][a-z]+\s+\d{1,2},?\s+\d{4})/);
  if (m) return `starts ${m[1].trim()}`;
  m = t.match(/\b(?:duration|period)\s*(?:of the programme?)?\s*:?\s*([^.;|]{3,50})/i);
  if (m) return m[1].trim();
  return null;
}

/* robots.txt compliance, driven by the registry rather than by re-fetching
 * robots.txt on every run. `sources.config.robots_disallow` holds the Disallow
 * prefixes that matter for the pages we would actually fetch, and a URL whose
 * path starts with one of them is never queued for a detail fetch.
 *
 * Example -- scholars4dev.com allows /wp-json/ (so the listing API is fine) but
 * disallows /archives/, every /tag/... path, /about/about-us/, /io/ and four
 * specific post pages. Checked 2026-10-01. Empty/absent list -> allow. */
function robotsAllows(url, disallow) {
  if (!Array.isArray(disallow) || !disallow.length) return true;
  let path;
  try {
    const m = String(url || '').match(/^https?:\/\/[^/]+(\/[^?#]*)/);
    path = m ? m[1] : '/';
  } catch (e) { return true; }
  return !disallow.some(d => d && path.toLowerCase().startsWith(String(d).toLowerCase()));
}

/* Query-string builder, because n8n's Code node runs in a VM that does NOT
 * expose URLSearchParams -- it throws `URLSearchParams is not defined` at
 * runtime, which structural validation and a plain-Node harness both miss
 * (plain Node has the global; the n8n sandbox does not).
 *
 * Deliberately a drop-in for the subset we used: qs({...}) stands in for the
 * WHATWG constructor, and .set()/.toString() behave the same. Empty,
 * null and undefined values are skipped rather than serialised as "k=".
 * Uses only Map and encodeURIComponent, both available in the sandbox. */
function qs(init) {
  const m = new Map(Object.entries(init || {}));
  return {
    set(k, v) { m.set(k, v); return this; },
    has(k) { return m.has(k); },
    toString() {
      const out = [];
      for (const [k, v] of m) {
        if (v === undefined || v === null || v === '') continue;
        out.push(encodeURIComponent(k) + '=' + encodeURIComponent(String(v)));
      }
      return out.join('&');
    },
  };
}

/* Registry-driven relevance filter. Several funder RSS feeds are site-wide news
 * feeds, not opportunity feeds -- erc.europa.eu/rss.xml carries staff vacancies
 * and presidential speeches, and erasmus-plus rss.xml carries form annexes. With
 * no classifier in the pipeline, the registry has to do the filtering, so the
 * patterns live in `sources.config.include_patterns` / `.exclude_patterns`
 * (PROMPT.md rule 3: a config key, never a hostname in a node).
 *
 * Returns a predicate. No patterns configured -> everything passes, so existing
 * sources are unaffected. */
function sourceFilter(cfg) {
  const build = (k) => ((cfg || {})[k] || []).map((p) => {
    try { return new RegExp(p, 'i'); } catch { return null; }
  }).filter(Boolean);
  const inc = build('include_patterns');
  const exc = build('exclude_patterns');
  return function passes(text) {
    const t = String(text || '');
    if (exc.some(r => r.test(t))) return false;
    if (inc.length && !inc.some(r => r.test(t))) return false;
    return true;
  };
}

/* ---------- audience fit --------------------------------------------------
 * Two shapes of noise that no per-source config can express, because they are
 * properties of the POST, not of the site:
 *
 *   isRoundup()  a listicle bundling N opportunities into one blog post
 *                ("20 Hot Jobs Currently Open - April 16, 2026"). It is not an
 *                opportunity, it is an index of them: no single deadline, link
 *                or eligibility. Storing it means a student clicks through to
 *                another list.
 *
 *   geoLock()    the post restricts itself to a nationality, region or identity
 *                group that does not include our students. Deliberately NOT a
 *                source config key (cf. PROMPT.md rule 3, which forbids
 *                hardcoding a HOSTNAME in a node -- this is not per-source):
 *                the same restriction appears on every aggregator, and
 *                duplicating the demonym list 15 times is how it rots.
 *
 * geoLock separates HOST COUNTRY from NATIONALITY. "Scholarship 2026 in UK" is
 * open to an Indian student; "Global British Citizens Scholarship" is not. Only
 * citizenship / nationality / residency language, a demonym sitting directly on
 * a people-noun, or a closed identity group counts as a lock. A field of study
 * never does, so "African Studies" and "European Research Council" pass.
 */

const ROUNDUP = [
  // "20 Hot Jobs ...", "34 Scholarships, Fellowships and Travel Opportunities ..."
  // Anchored at the start, so "Opportunities for Collaborative Research at the
  // NIH Clinical Center" and "REU Site: Research Opportunities for
  // Undergraduates" -- both real calls -- are untouched.
  /^\s*\d{1,3}\s*\+?\s+[a-z].{0,70}?\b(opportunit|scholarship|fellowship|grant|job|internship|competition|conference|award|programme|program|course)/i,
  // "Top 15 Bachelor's Degree Scholarships". Requires a PLURAL opportunity noun
  // close behind, so "Canada's Top 100 Women to Watch Award" stays.
  /\b(?:top|best)\s+\d{1,3}\s*\+?\s+(?:[a-z'’-]+\s+){0,4}(?:scholarships|fellowships|grants|internships|opportunities|programmes|programs|courses|universities|jobs|calls)\b/i,
  // dated weekly digests
  /\bcurrently\s+open\b[^.]{0,20}[–—-]\s*[a-z]+\s+\d{1,2},?\s+\d{4}/i,
  /\bdeadlines?\s+fast\s+approaching\b/i,
  /\b(?:round[\s-]?up|weekly\s+digest|opportunities\s+of\s+the\s+(?:week|month)|this\s+week\s+in)\b/i,
  // "25 Scholarships in Europe + 15 Development Courses with Scholarships"
  /\b\d{1,3}\s+[a-z][a-z'’\s-]{0,30}\s\+\s\d{1,3}\s+[a-z]/i,
];

function isRoundup(title, summary) {
  const t = String(title || '');
  if (!t) return false;
  if (ROUNDUP.some(r => r.test(t))) return true;
  // A listing page announces its plurality in the excerpt too, but only trust
  // that when the title also opened with a count.
  return /^\s*\d{1,3}\s/.test(t) && /\b(?:see|check)\s+(?:the\s+)?(?:full\s+)?list\b/i.test(String(summary || ''));
}

/* BARE demonyms and country names -- no trailing noun. The noun is supplied by
 * the rules in geoLock(), which is what keeps "African Studies" (a field) apart
 * from "African scholars" (a restriction). */
const GEO_GROUPS = {
  africa: "africans?|african|nigerians?|nigeria|ghanaians?|ghana|kenyans?|kenya|ugandans?|uganda|tanzanians?|tanzania|ethiopians?|ethiopia|rwandans?|rwanda|zambians?|zambia|zimbabweans?|zimbabwe|senegalese|senegal|ivorians?|côte d.?ivoire|cote d.?ivoire|cameroonians?|cameroon|malawians?|malawi|mozambicans?|mozambique|botswanan?s?|botswana|namibians?|namibia|sudanese|sudan|somalis?|somalia|liberians?|liberia|sierra leoneans?|sierra leone|burkina faso|beninese|togolese|malians?|gambians?|gambia|lesotho|eswatini|swazi|south africans?|sub[\\s-]?saharan",
  americas: "u\\.?s\\.?|us|american|americans|latin american?s?|caribbean|mexicans?|brazilians?|colombians?|chileans?|peruvians?|argentinians?",
  europe: "eu|eea|european|europeans|british|uk|irish|german|germans|french|italian|spanish|dutch|nordic|scandinavian|polish|portuguese|greek|swiss|austrian|belgian|danish|swedish|norwegian|finnish",
  oceania: "australian|australians|new zealand|pacific island(?:er)?s?",
  mena: "arabs?|mena|palestinians?|syrians?|lebanese|jordanians?|egyptians?|iraqis?|yemenis?|moroccans?|tunisians?|algerians?",
  other_asia: "asean|southeast asian?s?|south[\\s-]?east asian?s?|central asian?s?|afghans?|afghanistan|ukrainians?|ukraine|vietnamese|filipinos?|indonesians?|thai|malaysians?",
  canada: "canadian|canadians",
  china_japan_korea: "chinese|japanese|korean|koreans?",
};

/* Identity groups that lock on a BARE mention: in this corpus these words are
 * only ever used to restrict who may apply, never as a field or a venue. */
const GEO_STANDALONE = /\b(?:indigenous|first nations|aboriginal|māori|maori|native american|alaska native|refugees?|asylum[\s-]seekers?|internally displaced|displaced persons?)\b/i;

/* Nouns that turn an adjacent demonym into a restriction on PEOPLE. */
const GEO_PEOPLE = "citizens?|nationals|residents?|passport holders?|students?|pupils?|scholars?|researchers?|graduates?|postgraduates?|undergraduates?|applicants?|candidates?|nominees?|women|men|girls?|boys?|youth|professionals?|journalists?|entrepreneurs?|innovators?|teachers?|educators?|artists?|leaders?|scientists?|engineers?|lawyers?|physicians?|doctors?|nurses?|founders?|alumni";
/* NB: `nationals` is plural-only on purpose. The singular also matches the
 * adjective "National", which locked "Australian National University RTP
 * Scholarship" and "U.S. National Science Foundation" -- both open to Indians. */

/* The one word allowed between a demonym and its people-noun must be an
 * adjective, never a preposition. Any word at all let "Berlin Intensive: German
 * FOR Engineers" lock as a nationality restriction; it is a language course. */
const GEO_ADJ = "(?!for\\b|of\\b|in\\b|to\\b|and\\b|with\\b|at\\b|on\\b|by\\b|the\\b|an?\\b)[a-z]+";

/* Language that re-opens a post to everyone. Checked AFTER a lock fires, so an
 * explicit "open to all nationalities" beats an incidental regional mention. */
const GEO_OPEN = /\b(?:india|indians?|south asia|south asian?s?|all nationalit|any nationalit|every nationalit|worldwide|world[\s-]?wide|any country|all countries|globally|open to all|international students|international applicants|international (?:and|or) |(?:and|or) international\b|developing countr|low[\s-]?and[\s-]?middle[\s-]?income|commonwealth)\b/i;

function geoLock(text) {
  const t = String(text || '');
  if (!t) return { locked: false, region: null };
  const open = GEO_OPEN.test(t);
  if (GEO_STANDALONE.test(t) && !open) return { locked: true, region: 'identity' };
  for (const region of Object.keys(GEO_GROUPS)) {
    const alt = GEO_GROUPS[region];
    const rules = [
      // demonym sitting on a people-noun, with at most one adjective between:
      // "African Women", "Nigerian female students", "British Citizens"
      new RegExp("\\b(?:" + alt + ")\\s+(?:" + GEO_ADJ + "\\s+)?(?:" + GEO_PEOPLE + ")\\b", 'i'),
      new RegExp("\\b(?:" + alt + ")\\s+only\\b", 'i'),
      new RegExp("\\b(?:must|should)\\s+be\\s+(?:an?\\s+)?(?:" + alt + ")\\b", 'i'),
      // "restricted to Ghana", "exclusively for Kenya" -- a bare country name
      // after an explicit restriction verb needs no people-noun.
      new RegExp("\\b(?:restricted to|reserved for|limited to|exclusively for|open only to)\\s+(?:" + alt + ")\\b", 'i'),
    ];
    if (rules.some(r => r.test(t))) return open ? { locked: false, region: null } : { locked: true, region };
  }
  return { locked: false, region: null };
}

/* One call per item at ingest. null when the item is fine, otherwise a short
 * reason string, so a sweep can be audited and reversed. */
function audienceReject(title, summary) {
  if (isRoundup(title, summary)) return 'roundup';
  const g = geoLock(String(title || '') + ' ' + String(summary || ''));
  return g.locked ? 'geo:' + g.region : null;
}

if (typeof module !== 'undefined') module.exports = {
  plain, sections, pickSection, toISODate, extractDeadline,
  extractApplyLink, meta, fingerprint, sourceFilter, qs, robotsAllows,
  extractAmounts, extractFunding, extractDuration, extractTimeline,
  isPastDeadline, plausibleDeadline, LINK_DENY, MONTHS,
  isRoundup, geoLock, audienceReject, GEO_GROUPS, GEO_STANDALONE, GEO_OPEN,
};
