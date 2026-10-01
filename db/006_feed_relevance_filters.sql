-- =====================================================================
-- migration 006 · relevance filters for the funder feeds that are actually
-- site-wide news feeds.
--
-- Found by reading what the scrape returned on 2026-10-01:
--   erc.europa.eu/rss.xml        -> staff vacancies ("Interim Agent position in
--                                   the area Chemistry and Materials Science"),
--                                   presidential speeches, Davos coverage.
--   erasmus-plus .../rss.xml     -> form annexes ("Annex 7 - List of supporting
--                                   documents"), privacy statements, EU news.
--   cscuk.fcdo.gov.uk/feed/      -> ~3 of 10 are real; the rest is alumni news.
-- For contrast, ukri.org/opportunity/feed/ was 20/20 genuine funding calls and
-- nsf_funding and msca were clean -- so this is per-source, not a global rule.
--
-- Checked first: no dedicated opportunity feed exists for either EU body.
-- erc.europa.eu/funding/rss.xml, /news-events/rss.xml, /calls-proposals/feed,
-- erasmus-plus /opportunities/rss.xml and /calls/rss.xml all return 404.
--
-- The patterns are config, applied by sourceFilter() in _lib_html.js, so no
-- workflow or node changes (PROMPT.md rule 3). Exclusions are evaluated first;
-- a source with no patterns is unaffected.
--
-- Expect LOW yield from erc and erasmus_plus -- correctly so. They stay enabled
-- as a standing watch: if either publishes a real call, the filter admits it.
--
-- Idempotent.
-- =====================================================================

update sources
   set config = config || '{
         "exclude_patterns":[
           "interim agent","seconded national expert","public administrator",
           "vacanc","president.s speech","annual meeting","annual conference",
           "examples of projects","world economic forum","work with us"
         ],
         "include_patterns":[
           "call for proposals","call for","grant","fellowship","funding",
           "deadline","apply now","applications open"
         ]}'::jsonb,
       tos_note = coalesce(tos_note,'') ||
         ' | 2026-10-01: rss.xml is a site-wide news feed (staff vacancies,'
         ' speeches). Relevance patterns added; low yield is expected.'
 where slug = 'erc';

update sources
   set config = config || '{
         "exclude_patterns":[
           "^annex","privacy statement","model technical report",
           "list of supporting documents","accession form",
           "declaration on joint","assessment type","restrictive measures",
           "main highlights","conference on the future"
         ],
         "include_patterns":[
           "call for proposals","call for","scholarship","fellowship",
           "mobility","joint master","doctoral","applications open","apply now",
           "deadline","opportunit"
         ]}'::jsonb,
       tos_note = coalesce(tos_note,'') ||
         ' | 2026-10-01: rss.xml carries form annexes and EU news, not calls.'
         ' Relevance patterns added; low yield is expected.'
 where slug = 'erasmus_plus';

update sources
   set config = config || '{
         "exclude_patterns":[
           "new issue of","winners of","reconnect","champion uk connections",
           "bridging the finance gap","selected for",
           "strengthening the commonwealth","exploring opportunities and risks"
         ],
         "include_patterns":[
           "applications open","applications are open","call for","now open",
           "apply","scholarship","fellowship"
         ]}'::jsonb,
       tos_note = coalesce(tos_note,'') ||
         ' | 2026-10-01: feed mixes alumni news with real calls; relevance'
         ' patterns keep the "Applications open ..." items.'
 where slug = 'commonwealth_cscuk';
