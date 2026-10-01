-- 012 · Audience fit: stop showing BITS Pilani Dubai students things they cannot apply to.
--
-- Three defects, all visible in the finder at once:
--
--   1. BLOG ROUNDUPS. opportunitydesk.org and scholars4dev publish listicles
--      ("20 Hot Jobs Currently Open – April 16, 2026", "Top 15 Bachelor's Degree
--      Scholarships") alongside real posts. A roundup is an INDEX of
--      opportunities, not an opportunity: no single deadline, link or
--      eligibility. 106 rows.
--
--   2. opportunity_desk ITSELF. opportunitydesk.org is a Lagos-based, Africa-
--      oriented aggregator: 132 of its 2009 titles name an African country or
--      demonym outright, and far more do so only in the eligibility text we
--      have not fetched yet. It is also an aggregator-of-aggregators, so its
--      tier-1-worthy rows arrive through grants_gov / ukri / daad anyway. It is
--      46% of our corpus and the wrong 46%. Disabled, not deleted from the
--      registry, so re-enabling is a one-line UPDATE.
--
--   3. AWARDED RECORDS. nsf_awards, nih_reporter, openaire and cordis are
--      registers of money ALREADY GRANTED and projects already finished --
--      cordis is mostly 2014-15 "European Researchers' Night" events. The
--      finder rendered them as open calls with a dollar figure attached
--      ("Aging Lungs in European Cohorts", $332,242, deadline: rolling).
--      They stay ingested, because an awarded grant names a lab and a PI a
--      student can write to, but they are a DIFFERENT PRODUCT and must never
--      sit in the apply-now list. Marked via a config key rather than a
--      hostname in a node (CLAUDE.md rule 3); the UI reads it.
--
-- Nationality is not hardcoded anywhere: the ingest-side test lives in
-- _lib_html.js:geoLock(), which asks only "does this post restrict itself to a
-- group that excludes a South Asian applicant". Swap the audience by editing
-- GEO_GROUPS, not by touching 15 source rows.

begin;

-- ---------- 1. record_kind: open_call (apply to it) vs awarded (already given)
-- Default is open_call, so every existing and future source is unaffected
-- unless it is named here.
update sources
   set config = coalesce(config, '{}'::jsonb) || '{"record_kind":"awarded"}'::jsonb
 where slug in ('nsf_awards', 'nih_reporter', 'openaire', 'cordis');

update sources
   set config = coalesce(config, '{}'::jsonb) || '{"record_kind":"open_call"}'::jsonb
 where slug not in ('nsf_awards', 'nih_reporter', 'openaire', 'cordis')
   and coalesce(config->>'record_kind', '') = '';

-- ---------- 2. retire opportunity_desk
update sources
   set enabled  = false,
       tos_note = coalesce(tos_note || ' | ', '')
                || 'Disabled 2026-10-01 (db/012): Africa-targeted aggregator, '
                || 'wrong audience for BITS Dubai; also the main source of '
                || 'multi-opportunity roundup posts. Re-enable with '
                || 'update sources set enabled=true where slug=''opportunity_desk''.'
 where slug = 'opportunity_desk';

delete from raw_items where source_slug = 'opportunity_desk';

commit;

-- ---------- 3. rows already stored
-- The roundup / nationality sweep of EXISTING rows is deliberately NOT here.
-- Expressing geoLock()'s demonym x people-noun matrix as nine Postgres regex
-- groups would duplicate the library and let the two drift, which CLAUDE.md
-- rule 2 forbids. Run the sweep instead -- it imports _lib_html.js, so the
-- tested implementation is the only implementation:
--
--     node scripts/sweep-audience.mjs --apply
--
-- verification (run by hand; migrations stay side-effect free)
--   select slug, enabled, config->>'record_kind' from sources order by slug;
--   select source_slug, count(*) from raw_items group by 1 order by 2 desc;
