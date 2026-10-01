-- 013 · Split record_kind four ways, and keep the finder to things a student
--       can actually apply to.
--
-- db/012 introduced record_kind with two values and gated out the awarded
-- registers. Measuring the survivors source by source showed two more classes
-- that are not open calls for a student either, and together they were 68% of
-- the finder:
--
--   grants_gov        647 rows, 26 of them typed as something a student applies
--                     to, 0 with a degree level. The titles are the tell: NIH
--                     K99/R00, R15, U01 mechanisms, "DoW Breast Cancer
--                     Breakthrough Award", "Title XVI Water Reclamation and
--                     Reuse Projects". The applicant is a university or a PI
--                     with a faculty appointment and a US institution.
--                     Compounding it, search2 returns only 10 fields
--                     (title, agency, id, number, openDate, closeDate,
--                     oppStatus, docType, cfdaList, agencyCode) -- no
--                     eligibility, no description, no amount -- so we cannot
--                     even tell from what we store who may apply.
--                     -> record_kind = 'institutional'
--
--   daad_programmes   285 rows that are a COURSE CATALOGUE, not opportunities:
--                     "Bioeconomy (MSc)", "BEng Applied Physics", "75th
--                     International Summer Course". tuition_fees reads
--                     "Tuition varies" on most of them -- you pay -- and the
--                     date is an admissions deadline, not a funding deadline.
--                     Real value for "where could I do a master's in Germany",
--                     actively misleading beside a funded fellowship.
--                     -> record_kind = 'programme'
--
-- Nothing is deleted and no source is disabled. All four kinds stay ingested,
-- because each answers a real question -- which lab to write to (awarded),
-- which scheme my department could bid for (institutional), where to study
-- (programme). They are separate products. scripts/build-ui-data.mjs now
-- allowlists 'open_call' instead of blocking 'awarded', so a kind added later
-- is excluded from the student finder by default rather than leaking into it.
--
--   open_call      something a student applies to            <- the finder
--   programme      a degree or course you enrol in and pay for
--   institutional  a grant whose applicant is an organisation or a PI
--   awarded        a register of money already granted

begin;

update sources
   set config = coalesce(config, '{}'::jsonb) || '{"record_kind":"institutional"}'::jsonb
 where slug = 'grants_gov';

update sources
   set config = coalesce(config, '{}'::jsonb) || '{"record_kind":"programme"}'::jsonb
 where slug = 'daad_programmes';

commit;

-- verification
--   select config->>'record_kind' kind, slug from sources order by 1, 2;
