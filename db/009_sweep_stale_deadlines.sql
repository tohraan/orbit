-- =====================================================================
-- migration 009 · one-off sweep of rows written before the deadline guards.
--
-- Two defects visible in the data on 2026-10-01:
--
--  1. 15 rows (all daad_programmes) carry a deadline that has already passed.
--     `isPastDeadline()` stops such a row being WRITTEN, but an upsert that
--     skips an item leaves the previously-stored row untouched -- an ingest
--     filter cannot retract what an earlier run already saved. They have to be
--     deleted explicitly.
--
--  2. grants.gov uses 2099-01-01 to mean "no real close date", and 16 rows sit
--     beyond 2035. Stored as a real deadline this shows a student a date up to
--     73 years away. `plausibleDeadline()` now rejects these at ingest; the
--     rows already here need the fake date removed, NOT the row deleted -- the
--     opportunity is genuine, only its date is not.
--
-- Deliberately NOT deleting rows with a null/absent deadline: rolling and
-- "varies" deadlines are real (CONTEXT.md §6.12).
--
-- Idempotent: re-running finds nothing to do.
-- =====================================================================

-- 1. closed opportunities are of no use to a student
delete from raw_items
 where payload->>'deadline' is not null
   and (payload->>'deadline') < to_char(now() at time zone 'utc', 'YYYY-MM-DD');

-- 2. sentinel / implausible dates: keep the row, drop the claim
update raw_items
   set payload = payload
       - 'deadline'
       || jsonb_build_object(
            'deadline', null,
            'deadline_kind', 'rolling',
            'deadline_note', coalesce(payload->>'deadline_note',
              'Source listed ' || (payload->>'deadline') ||
              ', treated as no fixed deadline.'))
 where payload->>'deadline' is not null
   and (payload->>'deadline') >
       to_char((now() at time zone 'utc') + interval '10 years', 'YYYY-MM-DD');
