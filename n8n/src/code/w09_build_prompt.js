/* W09 · assemble one classifier request per unclassified raw_item.
 * Everything the model needs is already in the row — the model never fetches.
 * Output is an Anthropic Messages request with a forced tool call, so the
 * response is schema-valid JSON rather than prose we have to salvage. */
const CLASSIFIER_VERSION = 'v1.3.0';
const MODEL = 'claude-haiku-4-5-20251001';

const VOCAB = ['computer_science','engineering','physical_sciences','mathematics',
  'life_sciences','medicine_health','environment','social_sciences',
  'economics_business','law_governance','humanities','education','media_comms',
  'interdisciplinary'];

const SCHEMA = {
  name: 'record_opportunity',
  description: 'Record the normalised, classified research opportunity.',
  input_schema: {
    type: 'object',
    required: ['title','opportunity_type','degree_levels','fields_of_study',
               'funding_kind','deadline_kind','confidence','is_opportunity'],
    properties: {
      is_opportunity: { type: 'boolean', description: 'False for news posts, listicles, course ads, or anything with no single application.' },
      title:            { type: 'string' },
      organisation:     { type: ['string','null'], description: 'Institution or funder actually awarding it, not the aggregator.' },
      opportunity_type: { type: 'string', enum: ['scholarship','fellowship','research_internship','internship','grant','assistantship','exchange','summer_school','competition','conference','award','training','job','other'] },
      degree_levels:    { type: 'array', items: { type: 'string', enum: ['high_school','bachelors','masters','phd','postdoc','faculty','any'] } },
      fields_of_study:  { type: 'array', items: { type: 'string', enum: VOCAB } },
      host_country:     { type: ['string','null'] },
      host_region:      { type: ['string','null'], enum: ['Africa','Asia','Europe','Middle East','North America','South America','Oceania','Global',null] },
      is_remote:        { type: 'boolean' },
      funding_kind:     { type: 'string', enum: ['fully_funded','partially_funded','stipend_only','tuition_waiver','travel_only','unfunded','unknown'] },
      funding_detail:   { type: ['string','null'], description: 'One line, e.g. "full tuition + USD 30,000/yr stipend + travel".' },
      stipend_amount:   { type: ['number','null'] },
      stipend_currency: { type: ['string','null'] },
      deadline:         { type: ['string','null'], description: 'YYYY-MM-DD. Null unless a single explicit date applies.' },
      deadline_kind:    { type: 'string', enum: ['fixed','rolling','varies','unknown'] },
      deadline_note:    { type: ['string','null'] },
      duration_text:    { type: ['string','null'] },
      summary:          { type: 'string', description: '2 sentences max, factual, no marketing language.' },
      eligibility:      { type: ['string','null'], description: 'Tightened prose: requirements only, lead-in chatter removed.' },
      eligibility_flags:{ type: 'object', properties: {
                            min_gpa: { type: ['number','null'] },
                            languages: { type: 'array', items: { type: 'string' } },
                            nationalities: { type: 'array', items: { type: 'string' } },
                            excluded_nationalities: { type: 'array', items: { type: 'string' } },
                            age_max: { type: ['number','null'] },
                            needs_ielts: { type: 'boolean' }, needs_gre: { type: 'boolean' },
                            needs_research_proposal: { type: 'boolean' },
                            needs_supervisor: { type: 'boolean' },
                            work_experience_years: { type: ['number','null'] } } },
      benefits:         { type: ['string','null'] },
      how_to_apply:     { type: ['string','null'] },
      documents:        { type: ['string','null'] },
      apply_link:       { type: ['string','null'], description: 'Official application URL. Null rather than a guess.' },
      confidence:       { type: 'number', description: '0-1. Below 0.45 routes to human review.' },
      review_reason:    { type: ['string','null'] },
    },
  },
};

const SYSTEM = [
  'You normalise scraped research-opportunity records for a university discovery portal.',
  'Rules:',
  '1. Extract only what the source states. Never invent a deadline, amount, or link.',
  '2. organisation is the awarding body (university, ministry, foundation) — never the aggregator blog.',
  '3. degree_levels: list every level genuinely eligible. Use ["any"] only when the source truly does not restrict level.',
  '4. deadline: a single explicit calendar date, else null with the right deadline_kind ("varies" when it differs per course/university, "rolling" for continuous intake).',
  '5. eligibility: rewrite as requirements only. Strip lead-in filler such as "Are you ready to apply?".',
  '6. is_opportunity=false for news, roundups, listicles, paid course ads, and anything with no single application target. Everything else is still recorded.',
  '7. Prefer a lower confidence over a confident guess. State why in review_reason.',
].join('\n');

const out = [];
for (const item of $input.all()) {
  const r = item.json;
  const p = r.payload || {};
  const d = r.detail  || {};
  const parts = [
    `SOURCE: ${r.source_slug}`,
    `URL: ${r.url || ''}`,
    `TITLE: ${d.page_title || p.title || ''}`,
    p.organisation      ? `ORGANISATION HINT: ${p.organisation}` : '',
    p.country_hint      ? `COUNTRY HINT (source taxonomy): ${p.country_hint}` : '',
    p.funding_hint      ? `FUNDING HINT (source taxonomy): ${p.funding_hint}` : '',
    p.type_hint         ? `TYPE HINT (source category): ${p.type_hint}` : '',
    (p.level_hints || []).length ? `DEGREE-LEVEL HINTS (source category): ${p.level_hints.join(', ')}` : '',
    d.deadline          ? `DEADLINE PARSED FROM PAGE: ${d.deadline}` : '',
    d.deadline_kind && d.deadline_kind !== 'unknown' ? `DEADLINE KIND PARSED: ${d.deadline_kind}${d.deadline_note ? ' — ' + d.deadline_note : ''}` : '',
    d.apply_link        ? `APPLY LINK FOUND ON PAGE: ${d.apply_link}` : '',
    '', `SUMMARY: ${d.description || p.summary || ''}`,
    d.eligibility  ? `\n--- ELIGIBILITY SECTION ---\n${String(d.eligibility).slice(0, 3500)}`   : '',
    d.benefits     ? `\n--- BENEFITS SECTION ---\n${String(d.benefits).slice(0, 2500)}`         : '',
    d.how_to_apply ? `\n--- APPLICATION PROCESS SECTION ---\n${String(d.how_to_apply).slice(0, 2500)}` : '',
    d.documents    ? `\n--- DOCUMENTS SECTION ---\n${String(d.documents).slice(0, 1200)}`       : '',
    (!d.eligibility && !d.benefits && d.full_text) ? `\n--- PAGE TEXT ---\n${String(d.full_text).slice(0, 5000)}` : '',
  ].filter(Boolean).join('\n');

  out.push({ json: {
    raw_item_id: r.id,
    source_slug: r.source_slug,
    url: r.url,
    classifier_version: CLASSIFIER_VERSION,
    request: {
      model: MODEL,
      max_tokens: 2000,
      temperature: 0,
      system: SYSTEM,
      tools: [SCHEMA],
      tool_choice: { type: 'tool', name: 'record_opportunity' },
      messages: [{ role: 'user', content: `Classify this record. Today is ${new Date().toISOString().slice(0,10)}.\n\n${parts}` }],
    },
  }});
}
return out;
