/* W04 · POST-API response -> raw_items rows. One branch per source shape;
 * everything unknown falls through to a generic mapper so a newly registered
 * post_api source still lands data instead of throwing.
 * LIB */
const nowISO = new Date().toISOString();

// Normalised money shape used by every branch: {currency, amount, period}.
const money = (amount, currency, period) => {
  const n = Number(amount);
  return isFinite(n) && n > 0 ? { currency: currency || 'USD', amount: n, period: period || null } : null;
};
// Whole months between two ISO-ish dates -> "36 months".
const spanMonths = (a, b) => {
  const s = new Date(a), e = new Date(b);
  if (isNaN(s) || isNaN(e) || e <= s) return null;
  const m = Math.round((e - s) / (1000 * 60 * 60 * 24 * 30.44));
  return m > 0 ? `${m} month${m === 1 ? '' : 's'}` : null;
};
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
        // search2 returns only 10 fields. Everything richer (eligibility,
        // description, award ceiling) needs POST /v1/api/fetchOpportunity,
        // which is still unwired -- see CONTEXT.md §11.
        status_hint: r.oppStatus || null,
        opp_number: r.number || null,
        cfda: r.cfdaList || [],
        timeline: r.openDate ? `opens ${toISODate(r.openDate) || r.openDate}` : null,
        raw: r,
      };
    } else if (slug === 'nih_reporter') {
      // 45 fields available. award_amount is real money, the project dates give
      // a duration, and terms/pref_terms are the only field-of-study signal we
      // have anywhere in the pipeline now the classifier is gone.
      const org = r.organization || {};
      const pi  = (r.principal_investigators || [])[0] || {};
      const terms = String(r.pref_terms || r.terms || '')
        .split(/[;,]/).map(x => x.trim()).filter(Boolean).slice(0, 25);
      p = {
        external_id: String(r.project_num || r.appl_id),
        url: `https://reporter.nih.gov/project-details/${r.appl_id}`,
        title: r.project_title,
        organisation: org.org_name,
        summary: (r.abstract_text || r.phr_text || '').slice(0, 4000),
        plain_summary: (r.phr_text || '').slice(0, 2000),   // public-health relevance, plain English
        deadline: null, deadline_kind: 'rolling',
        deadline_note: 'Awarded project — contact the PI directly about openings.',
        source_published_at: r.award_notice_date || null,
        country_hint: org.org_country || 'USA',
        funding_hint: 'stipend_only',
        type_hint: 'grant',
        level_hints: ['masters', 'phd', 'postdoc'],
        fields_of_study: terms,
        amount: money(r.award_amount, 'USD'),
        duration: spanMonths(r.project_start_date, r.project_end_date),
        timeline: r.project_start_date
          ? `project ${String(r.project_start_date).slice(0, 10)} to ${String(r.project_end_date || '').slice(0, 10)}`
          : null,
        pi_name: [pi.first_name, pi.last_name].filter(Boolean).join(' ') || r.contact_pi_name || null,
        pi_email: null,
        organisation_type: (r.organization_type || {}).name || null,
        raw: { appl_id: r.appl_id, fy: r.fiscal_year, activity: r.activity_code,
               opportunity_number: r.opportunity_number, org_city: org.org_city },
      };
    } else if (slug === 'nsf_awards') {
      // Awarded grants, not open calls. REU sites are the student-facing ones,
      // and the title is the only reliable signal for that. No URL field in the
      // response -- the award page is addressable by id.
      const isREU = /\bREU\b|Research Experience for Undergraduates/i.test(r.title || '');
      p = {
        external_id: String(r.id),
        url: `https://www.nsf.gov/awardsearch/showAward?AWD_ID=${r.id}`,
        title: r.title,
        organisation: r.awardeeName || r.orgLongName || null,
        summary: (r.abstractText || '').slice(0, 4000),
        deadline: null,
        deadline_kind: 'rolling',
        deadline_note: 'Awarded NSF project — contact the PI about openings.',
        source_published_at: toISODate(r.startDate),
        country_hint: r.awardeeCountryCode || 'USA',
        funding_hint: 'stipend_only',
        type_hint: isREU ? 'research_internship' : 'grant',
        level_hints: isREU ? ['bachelors'] : ['masters', 'phd'],
        amount: money(r.fundsObligatedAmt || r.estimatedTotalAmt, 'USD'),
        duration: spanMonths(r.startDate, r.expDate),
        timeline: r.startDate ? `award ${r.startDate} to ${r.expDate || ''}`.trim() : null,
        fields_of_study: [r.primaryProgram || r.fundProgramName].filter(Boolean),
        pi_name: [r.piFirstName, r.piLastName].filter(Boolean).join(' ') || r.pdPIName || null,
        raw: { program: r.primaryProgram || r.fundProgramName, amount: r.fundsObligatedAmt,
               city: r.awardeeCity, exp: r.expDate },
      };
    } else if (slug === 'cordis') {
      // Funded EU projects -> host-institution discovery. CORDIS renders its
      // dates as unresolved templates ("1 {{month_01}} 2014"), so they are not
      // parseable and deliberately not stored.
      const prog = (r.programme || [])[0] || {};
      const pid  = r.id || r.reference || r.rcn;
      p = {
        external_id: String(pid),
        url: `https://cordis.europa.eu/project/id/${pid}`,
        title: r.title || r.acronym,
        organisation: prog.title || null,
        summary: (r.teaser || '').slice(0, 4000),
        deadline: null,
        deadline_kind: 'rolling',
        deadline_note: 'Funded EU project — approach the host institution.',
        source_published_at: null,
        country_hint: r.coordinatedIn || null,
        funding_hint: null,
        type_hint: 'grant',
        level_hints: ['masters', 'phd', 'postdoc'],
        raw: { acronym: r.acronym, programme: prog.code, rcn: r.rcn },
      };
    } else if (slug === 'openaire') {
      // ~13% of OpenAIRE project records are placeholders whose title is the
      // literal string "unidentified". They are dropped, not stored blank.
      const title = (r.title && r.title !== 'unidentified') ? r.title : (r.acronym || '');
      if (!title || title === 'unidentified') continue;
      const fund = (r.fundings || [])[0] || {};
      p = {
        external_id: String(r.id),
        url: r.websiteUrl
             || `https://explore.openaire.eu/search/project?projectId=${encodeURIComponent(r.id)}`,
        title,
        organisation: fund.name || (fund.shortName || null),
        summary: (r.summary || '').slice(0, 4000),
        deadline: null,
        deadline_kind: 'rolling',
        deadline_note: 'Funded project — approach the host institution.',
        source_published_at: toISODate(r.startDate),
        country_hint: fund.jurisdiction || null,
        funding_hint: null,
        type_hint: 'grant',
        level_hints: ['masters', 'phd', 'postdoc'],
        amount: money((r.granted || {}).fundedAmount || (r.granted || {}).totalCost,
                      (r.granted || {}).currency || 'EUR'),
        duration: spanMonths(r.startDate, r.endDate),
        timeline: r.startDate ? `project ${String(r.startDate).slice(0,10)} to ${String(r.endDate || '').slice(0,10)}` : null,
        fields_of_study: [].concat(r.subjects || [], r.keywords ? String(r.keywords).split(/[;,]/) : [])
                           .map(x => String(x).trim()).filter(Boolean).slice(0, 25),
        raw: { code: r.code, acronym: r.acronym, call: r.callIdentifier, end: r.endDate },
      };
    } else if (slug === 'daad_programmes') {
      // DAAD's international-programmes DB: study programmes in Germany, keyed
      // by `courseName` rather than `title`, with a relative `link`. Deadlines
      // vary per course and university (CONTEXT.md §6.12), so an absent one is
      // 'varies', never a silent null.
      // `preparationForDegree` is null on every row of the unfiltered query, and
      // `courseType`'s numeric mapping is undocumented -- so it is kept in `raw`
      // rather than guessed at. The course NAME carries the level reliably
      // ("Abbe School of Photonics - PhD/Doctoral Programme").
      const degText = `${r.courseName || ''} ${r.courseNameShort || ''} ${r.subject || ''}`.toLowerCase();
      const levels = [];
      if (/\bbachelor/.test(degText))                      levels.push('bachelors');
      if (/\bmaster|\bm\.?sc\b|\bmba\b/.test(degText))    levels.push('masters');
      if (/\bph\.?d\b|doctoral|doctorate|graduate school/.test(degText)) levels.push('phd');
      if (/post-?doc/.test(degText))                        levels.push('postdoc');
      const dl = toISODate(r.applicationDeadline);
      p = {
        external_id: String(r.id),
        url: r.link ? `https://www2.daad.de${r.link}`
                    : `https://www2.daad.de/deutschland/studienangebote/international-programmes/en/detail/${r.id}/`,
        title: r.courseName || r.courseNameShort,
        organisation: r.academy || null,
        summary: [r.subject, r.city].filter(Boolean).join(' — ').slice(0, 4000),
        deadline: dl,
        deadline_kind: dl ? 'fixed' : 'varies',
        deadline_note: dl ? null
          : 'DAAD lists this per course and university — check the programme page.',
        source_published_at: null,
        country_hint: 'Germany',
        funding_hint: r.financialSupport ? 'partially_funded'
                    : (/no tuition|tuition[- ]free/i.test(String(r.tuitionFees || r.costString || '')) ? 'tuition_waiver' : null),
        // DAAD exposes these directly -- no page fetch needed.
        duration: r.programmeDuration || null,
        timeline: r.beginning || null,
        tuition_fees: r.tuitionFees || r.costString || null,
        languages: [].concat(r.languages || []).filter(Boolean),
        fields_of_study: [r.subject].filter(Boolean),
        city: r.city || null,
        type_hint: /(summer|winter) (school|academy|course)/i.test(r.courseName || '')
                 ? 'summer_school'
                 : levels.length ? 'other' : 'training',
        level_hints: levels,
        raw: { languages: r.languages, duration: r.programmeDuration,
               fees: r.tuitionFees, beginning: r.beginning, courseType: r.courseType },
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
    if (isPastDeadline(p.deadline)) continue;   // already closed -> never stored
    // provenance, so the portal can show "listed by <source>" and prefer tier 1
    p.source_name  = meta0.source_name || slug;
    p.source_tier  = meta0.source_tier;
    p.source_trust = meta0.source_trust;
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
