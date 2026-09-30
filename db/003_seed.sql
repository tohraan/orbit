-- =====================================================================
-- migration 003 · controlled vocabulary + the verified source registry
-- Every endpoint below was probed live on 2026-09-30 (scripts/probe-sources.sh).
-- Re-run that script before a demo; sources rot.
-- =====================================================================

create table if not exists taxonomy_fields (
  slug   text primary key,
  label  text not null,
  parent text references taxonomy_fields(slug),
  aliases text[] not null default '{}'
);

insert into taxonomy_fields (slug, label, aliases) values
 ('computer_science','Computer Science & IT','{cs,informatics,software,ai,machine learning,data science,cybersecurity}'),
 ('engineering','Engineering','{mechanical,electrical,civil,chemical,aerospace,electronics,robotics}'),
 ('physical_sciences','Physical Sciences','{physics,chemistry,astronomy,materials,earth science,geology}'),
 ('mathematics','Mathematics & Statistics','{maths,math,statistics,applied mathematics}'),
 ('life_sciences','Life Sciences','{biology,biotech,biotechnology,genetics,microbiology,ecology,neuroscience}'),
 ('medicine_health','Medicine & Health','{medical,public health,nursing,pharmacy,dentistry,epidemiology}'),
 ('environment','Environment & Sustainability','{climate,energy,renewable,water,agriculture,forestry}'),
 ('social_sciences','Social Sciences','{sociology,psychology,anthropology,political science,social policy}'),
 ('economics_business','Economics, Business & Management','{economics,finance,mba,business,accounting,marketing}'),
 ('law_governance','Law, Policy & Governance','{law,legal,public policy,international relations,governance}'),
 ('humanities','Arts & Humanities','{history,philosophy,literature,linguistics,languages,music,art,design}'),
 ('education','Education','{pedagogy,teacher training,edtech}'),
 ('media_comms','Media & Communication','{journalism,communication,film,media studies}'),
 ('interdisciplinary','Interdisciplinary / Any Field','{any,all fields,open,multidisciplinary}')
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------
-- SOURCES · tier 1 = primary funder (authoritative), 2 = govt/university,
--           3 = aggregator blog (fast, broad, needs verification)
-- ---------------------------------------------------------------------
insert into sources (slug, name, kind, base_url, authority_tier, trust_score, cadence_cron, config, tos_note) values

-- ===== tier 3 · aggregators (breadth; verify apply_link before trusting) ====
('opportunities_circle','Opportunities Circle','wp_rest',
 'https://www.opportunitiescircle.com/wp-json/wp/v2', 3, 0.62, '0 2 * * *',
 '{"per_page":100,
   "needs_detail":true,
   "exclude_categories":[2769,11901,1,13181],
   "category_map":{
     "167":{"type":"scholarship","levels":["bachelors"]},
     "168":{"type":"scholarship","levels":["masters"]},
     "169":{"type":"scholarship","levels":["phd"]},
     "4":{"type":"scholarship","levels":["any"]},
     "481":{"type":"fellowship","levels":["masters","phd","postdoc"]},
     "8123":{"type":"fellowship","levels":["phd"]},
     "7459":{"type":"fellowship","levels":["postdoc"]},
     "5":{"type":"internship","levels":["bachelors","masters"]},
     "10610":{"type":"internship","levels":["bachelors","masters"]},
     "14280":{"type":"research_internship","levels":["bachelors","masters"]},
     "1194":{"type":"grant","levels":["any"]},
     "558":{"type":"award","levels":["any"]},
     "877":{"type":"competition","levels":["any"]},
     "924":{"type":"exchange","levels":["any"]},
     "7447":{"type":"summer_school","levels":["bachelors","masters"]},
     "969":{"type":"training","levels":["any"]},
     "5162":{"type":"job","levels":["any"]},
     "6":{"type":"conference","levels":["any"]}
   },
   "expired_urgency_term":14708,
   "no_deadline_urgency_term":14709}'::jsonb,
 'Public WP REST API, no auth. Incremental via ?modified_after. Country + funding_type read from class_list; subject taxonomy is unusable (9 sparse terms). ACF is empty — deadline/eligibility require the detail page.'),

('opportunity_desk','Opportunity Desk','wp_rest',
 'https://opportunitydesk.org/wp-json/wp/v2', 3, 0.55, '15 2 * * *',
 '{"per_page":100,"needs_detail":true}'::jsonb,
 'Public WP REST API verified 200.'),

('scholars4dev','Scholarships for Development','rss',
 'https://www.scholars4dev.com', 3, 0.55, '30 2 * * *',
 '{"feed_urls":["https://www.scholars4dev.com/feed/"],"needs_detail":true}'::jsonb,
 'RSS verified 200. Strong on development-sector masters funding.'),

-- ===== tier 1 · primary funders (authoritative, structured) ================
('grants_gov','Grants.gov (US federal)','post_api',
 'https://api.grants.gov/v1/api', 1, 0.95, '0 3 * * *',
 '{"path":"/search2",
   "page_size":100,
   "keyword_matrix":["fellowship","scholarship","graduate research","postdoctoral",
                     "research training","undergraduate research","dissertation",
                     "student research","traineeship"],
   "body_template":{"oppStatuses":"forecasted|posted","resultType":"json"},
   "item_path":"data.oppHits",
   "count_path":"data.hitCount"}'::jsonb,
 'POST, no API key. Verified: hitCount=200 for keyword "fellowship". Detail via /fetchOpportunity (POST {opportunityId}).'),

('nsf_awards','NSF Awards API','json_api',
 'https://api.nsf.gov/services/v1', 1, 0.92, '0 4 * * 1',
 '{"paths":["/awards.json"],
   "query":{"rpp":25,"printFields":"id,title,startDate,expDate,fundsObligatedAmt,awardeeName,piFirstName,piLastName,abstractText,primaryProgram"},
   "keyword_matrix":["REU","research experience undergraduates","graduate research fellowship","postdoctoral fellowship"],
   "item_path":"response.award",
   "page_param":"offset"}'::jsonb,
 'GET, no key. Awarded grants — used to surface host labs/PIs for research internships, not as an open call feed.'),

('nsf_funding','NSF Upcoming Funding Opportunities','rss',
 'https://www.nsf.gov', 1, 0.95, '0 4 * * *',
 '{"feed_urls":["https://www.nsf.gov/rss/rss_www_funding_upcoming.xml"],"needs_detail":true}'::jsonb,
 'RSS verified 200 application/rss+xml.'),

('ukri_opportunities','UKRI Funding Opportunities','rss',
 'https://www.ukri.org', 1, 0.95, '10 4 * * *',
 '{"feed_urls":["https://www.ukri.org/opportunity/feed/"],"needs_detail":true}'::jsonb,
 'WordPress feed on ukri.org verified 200. The single best UK research-funding feed.'),

('erasmus_plus','Erasmus+ (European Commission)','rss',
 'https://erasmus-plus.ec.europa.eu', 1, 0.93, '20 4 * * *',
 '{"feed_urls":["https://erasmus-plus.ec.europa.eu/rss.xml"],"needs_detail":true}'::jsonb,
 'RSS verified 200. Mobility, joint masters (EMJM), cooperation calls.'),

('msca','Marie Sklodowska-Curie Actions','rss',
 'https://marie-sklodowska-curie-actions.ec.europa.eu', 1, 0.95, '25 4 * * *',
 '{"feed_urls":["https://marie-sklodowska-curie-actions.ec.europa.eu/rss.xml"],"needs_detail":true}'::jsonb,
 'RSS verified 200. Doctoral networks + postdoctoral fellowships.'),

('erc','European Research Council','rss',
 'https://erc.europa.eu', 1, 0.95, '30 4 * * *',
 '{"feed_urls":["https://erc.europa.eu/rss.xml"],"needs_detail":true}'::jsonb,
 'RSS verified 200. Mostly PI-level grants; relevant to faculty and PhD hosting.'),

('cordis','CORDIS (EU research projects)','json_api',
 'https://cordis.europa.eu/api', 1, 0.90, '0 5 * * 1',
 '{"paths":["/search/results"],
   "query":{"q":"contenttype=''project''","format":"json","num":100},
   "page_param":"p",
   "item_path":"hits.hits"}'::jsonb,
 'GET verified 200. Funded EU projects — host-institution discovery for research internships.'),

('openaire','OpenAIRE Graph','json_api',
 'https://api.openaire.eu/graph/v1', 1, 0.88, '0 5 * * 2',
 '{"paths":["/projects"],"query":{"pageSize":100},"page_param":"page","item_path":"results"}'::jsonb,
 'GET verified 200. Cross-funder project graph.'),

('nih_reporter','NIH RePORTER','post_api',
 'https://api.reporter.nih.gov/v2', 1, 0.92, '0 5 * * 3',
 '{"path":"/projects/search",
   "page_size":100,
   "body_template":{"criteria":{"fiscal_years":[2026,2027]},"limit":100},
   "item_path":"results",
   "count_path":"meta.total"}'::jsonb,
 'POST verified 200, no key. Awarded NIH projects — lab/PI discovery for biomedical research internships.'),

-- ===== tier 2 · national schemes ==========================================
('commonwealth_cscuk','Commonwealth Scholarship Commission (UK)','rss',
 'https://cscuk.fcdo.gov.uk', 2, 0.88, '40 4 * * *',
 '{"feed_urls":["https://cscuk.fcdo.gov.uk/feed/"],"needs_detail":true}'::jsonb,
 'RSS verified 200. Highly relevant to Commonwealth (incl. India) applicants.'),

('daad_programmes','DAAD International Programmes (Germany)','json_api',
 'https://www2.daad.de/deutschland/studienangebote/international-programmes/api/solr/en', 2, 0.85, '0 6 * * 1',
 '{"paths":["/search.json"],"query":{"limit":100},"page_param":"offset","item_path":"courses"}'::jsonb,
 'Solr JSON verified 200. Degree programmes (many funded); DAAD scholarship DB itself has no public API.')

on conflict (slug) do update set
  name = excluded.name, kind = excluded.kind, base_url = excluded.base_url,
  authority_tier = excluded.authority_tier, trust_score = excluded.trust_score,
  cadence_cron = excluded.cadence_cron, config = excluded.config,
  tos_note = excluded.tos_note;

-- ---------------------------------------------------------------------
-- Deliberately NOT seeded — probed and rejected on 2026-09-30.
-- Do not "fix" these without re-probing; see docs/sources.md for evidence.
--   findaphd.com              403 + ToS forbids automated collection
--   jobs.ac.uk                /jobs/rss returns text/html, no real feed
--   nature.com/naturecareers  same, HTML not RSS
--   euraxess.ec.europa.eu     no public API/RSS (jsonapi 404, _format=json 406)
--   grants.nih.gov guide RSS  403 (edge WAF)
--   api.tech.ec.europa.eu     SEDIA search-api returns 500 on documented shape
--   youthop.com               host unreachable
--   etap.nsf.gov              302, session-gated
--   chevening.org             connection refused from this network
-- ---------------------------------------------------------------------
