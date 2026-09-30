/* W09 · validate the classifier's tool call and build the canonical
 * `opportunities` upsert row. Nothing reaches the portal without passing here.
 * LIB */
const plans = $('Build Classifier Requests').all();
const items = $input.all();
// Images come from the source payload, never from the model.
const rawById = new Map($('Get Unclassified').all()
  .map(i => [i.json.id, i.json]));
const nowISO = new Date().toISOString();

const TYPES  = ['scholarship','fellowship','research_internship','internship','grant','assistantship','exchange','summer_school','competition','conference','award','training','job','other'];
const LEVELS = ['high_school','bachelors','masters','phd','postdoc','faculty','any'];
const FUNDS  = ['fully_funded','partially_funded','stipend_only','tuition_waiver','travel_only','unfunded','unknown'];
const DKINDS = ['fixed','rolling','varies','unknown'];
const VOCAB  = ['computer_science','engineering','physical_sciences','mathematics','life_sciences','medicine_health','environment','social_sciences','economics_business','law_governance','humanities','education','media_comms','interdisciplinary'];

const oneOf = (v, list, dflt) => (list.includes(v) ? v : dflt);
const manyOf = (v, list) => [...new Set((Array.isArray(v) ? v : []).filter(x => list.includes(x)))];

const out = [];
for (let i = 0; i < items.length; i++) {
  const plan = (plans[i] || {}).json || {};
  const body = items[i].json.body !== undefined ? items[i].json.body : items[i].json;

  const block = (body.content || []).find(c => c.type === 'tool_use');
  if (!block || !block.input) {
    out.push({ json: { __error: true, raw_item_id: plan.raw_item_id,
      note: `no tool_use in response (stop_reason=${body.stop_reason || 'unknown'})` } });
    continue;
  }
  const c = block.input;

  if (c.is_opportunity === false) {
    out.push({ json: { __skip: true, raw_item_id: plan.raw_item_id,
      classifier_version: plan.classifier_version,
      note: c.review_reason || 'classifier: not an opportunity' } });
    continue;
  }

  const title = String(c.title || '').trim();
  if (!title) { out.push({ json: { __error: true, raw_item_id: plan.raw_item_id, note: 'empty title' } }); continue; }

  const deadline = /^\d{4}-\d{2}-\d{2}$/.test(c.deadline || '') ? c.deadline : null;
  const dkind    = oneOf(c.deadline_kind, DKINDS, deadline ? 'fixed' : 'unknown');
  // A model-supplied date in the past means we have last year's edition.
  const expired  = deadline && deadline < nowISO.slice(0, 10);
  const daysLeft = deadline ? Math.round((new Date(deadline) - new Date(nowISO.slice(0,10))) / 864e5) : null;

  let confidence = Number(c.confidence);
  if (!Number.isFinite(confidence)) confidence = 0.4;
  confidence = Math.max(0, Math.min(1, confidence));

  const levels = manyOf(c.degree_levels, LEVELS);
  const status = expired ? 'expired'
               : confidence < 0.45 ? 'needs_review'
               : (daysLeft !== null && daysLeft <= 30) ? 'closing_soon'
               : 'active';

  const applyLink = /^https?:\/\//i.test(c.apply_link || '') ? c.apply_link : null;
  const org = c.organisation ? String(c.organisation).slice(0, 300) : null;

  out.push({ json: {
    __error: false, __skip: false,
    raw_item_id: plan.raw_item_id,
    source_slug: plan.source_slug,
    classifier_version: plan.classifier_version,
    usage: body.usage || {},
    classification: c,
    opportunity: {
      fingerprint: fingerprint(title, org || c.host_country, deadline),
      title: title.slice(0, 500),
      organisation: org,
      opportunity_type: oneOf(c.opportunity_type, TYPES, 'other'),
      degree_levels: levels.length ? levels : ['any'],
      fields_of_study: manyOf(c.fields_of_study, VOCAB),
      host_country: c.host_country || null,
      host_region: c.host_region || null,
      is_remote: Boolean(c.is_remote),
      funding_kind: oneOf(c.funding_kind, FUNDS, 'unknown'),
      funding_detail: c.funding_detail || null,
      stipend_amount: Number.isFinite(Number(c.stipend_amount)) ? Number(c.stipend_amount) : null,
      stipend_currency: c.stipend_currency || null,
      deadline, deadline_kind: dkind,
      deadline_note: c.deadline_note || null,
      duration_text: c.duration_text || null,
      summary: (c.summary || '').slice(0, 2000),
      eligibility: c.eligibility || null,
      eligibility_flags: c.eligibility_flags || {},
      benefits: c.benefits || null,
      how_to_apply: c.how_to_apply || null,
      documents: c.documents || null,
      apply_link: applyLink,
      image_url: (() => {
        const raw = rawById.get(plan.raw_item_id) || {};
        return (raw.detail || {}).image_url || (raw.payload || {}).image_url || null;
      })(),
      status,
      confidence,
      primary_source: plan.source_slug,
      canonical_url: plan.url,
      last_seen_at: nowISO,
      last_verified_at: nowISO,
      classifier_version: plan.classifier_version,
    },
  }});
}
return out;
