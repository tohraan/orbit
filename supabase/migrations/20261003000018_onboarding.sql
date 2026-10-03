-- 018 — when a student finished onboarding.
--
-- WHY A COLUMN AND NOT A COMPUTED CHECK.
--
-- The obvious alternative is to infer it: "if the profile has no level and no
-- fields, they must be new." That is wrong in both directions. A student who
-- deliberately skipped a question would be dragged through onboarding on every
-- single login, and a student who filled one field by accident would never see
-- it at all. Whether someone has been welcomed is a fact about what happened,
-- not a guess from the shape of their data, so it is stored.
--
-- Nullable on purpose: NULL means "has never finished", which is exactly the
-- state every existing row should be in, and is what the app tests for.

alter table students add column if not exists onboarded_at timestamptz;

-- The existing account signed up before onboarding was gated, and has a
-- complete profile. Backfilling it prevents the one real user being sent
-- through a flow they already completed by hand.
-- `fields` and `countries` are text[], not text, so an empty-string test on
-- them is a malformed array literal rather than a false.
update students
   set onboarded_at = coalesce(onboarded_at, updated_at, created_at, now())
 where onboarded_at is null
   and (nullif(level, '') is not null or coalesce(array_length(fields, 1), 0) > 0);

comment on column students.onboarded_at is
  'When the student completed first-run onboarding. NULL = never finished.';
