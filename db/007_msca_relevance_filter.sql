-- =====================================================================
-- migration 007 · relevance filter for the MSCA feed.
--
-- Same problem as 006, caught on a closer read of the 10 items returned on
-- 2026-10-01: only two are things a student can act on --
--   "MSCA Postdoctoral Fellowships 2026"
--   "Showcase your research at Science is Wonderful! 2027"
-- the rest is programme news ("Cancer research in the Marie Sklodowska-Curie
-- Actions", "... receives record number of applications", "MSCA co-funds 29
-- doctoral training and postdoctoral fellowship programmes") plus unrelated EU
-- news. Note that several of those DO contain the word "fellowship", which is
-- why the exclusions are specific phrases and are evaluated first.
--
-- Idempotent.
-- =====================================================================
update sources
   set config = config || '{
         "exclude_patterns":[
           "record number of applications","co-funds","announce",
           "standing with","economic resilience","research in the marie",
           "restrictive measures"
         ],
         "include_patterns":[
           "fellowship","doctoral network","doctoral programme","call for",
           "applications open","apply now","deadline","showcase your research"
         ]}'::jsonb,
       tos_note = coalesce(tos_note,'') ||
         ' | 2026-10-01: feed mixes programme news with real calls; relevance'
         ' patterns added. Exclusions are phrase-specific because several news'
         ' items also contain the word "fellowship".'
 where slug = 'msca';
