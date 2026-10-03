-- 020 · The management desk: staff identity, listing overrides, and an audit trail.
--
-- Three things, in the order they depend on each other.
--
-- 1. STAFF ARE PEOPLE, NOT A SHARED SECRET.
--    The desk was behind a single ADMIN_TOKEN in sessionStorage. That kept the
--    write endpoint off the open internet and nothing more: it recorded that
--    "staff" added a listing, never WHO, and it could not be revoked for one
--    person without changing it for everyone. `students.is_staff` has existed
--    since 015 and is already safe — the students_update_own policy pins
--    is_staff to its current value, so a student cannot promote themselves. It
--    just had nothing reading it. This migration gives it teeth.
--
-- 2. THE SCRAPER OWNS raw_items; STAFF DO NOT.
--    W01 upserts raw_items on (source_slug, external_id) with
--    resolution=merge-duplicates, every run. So a staff edit written into
--    raw_items survives exactly until the next scrape and then vanishes with no
--    warning — the worst kind of bug, because it looks like it worked.
--    Overrides live beside the row instead and are applied when the listing is
--    projected. The scraper keeps writing what the source actually said, the
--    correction is kept separately, and both are inspectable forever.
--
-- 3. EVERY WRITE IS ATTRIBUTABLE.
--    A panel several people share needs to answer "who hid this, and when".

-- ---------- 1. staff may read the roster -----------------------------
-- A department running its own portal may see who has registered on it. The
-- line this does NOT cross is joining a student to what they saved: db/017
-- keeps interest as totals with no student ids on purpose, and the consent
-- banner promises students "a number only, never who". Nothing here changes
-- that, and nothing here should.
create or replace function is_staff() returns boolean
  stable security definer set search_path = public as $$
  select coalesce((select s.is_staff from students s where s.id = auth.uid()), false);
$$ language sql;

-- A SECOND select policy, not a replacement. Postgres ORs permissive policies
-- together, so students_select_own keeps working untouched and this adds the
-- staff case on top of it.
drop policy if exists students_select_staff on students;
create policy students_select_staff on students
  for select using (is_staff());

-- ---------- 2. overrides ---------------------------------------------
create table if not exists opportunity_overrides (
  raw_item_id bigint primary key references raw_items(id) on delete cascade,

  -- "Remove" from the student's point of view. The row stays: a listing the
  -- scraper still finds would come straight back on the next run if it were
  -- deleted, so suppression has to be a fact we record rather than an absence.
  suppressed  boolean not null default false,

  -- The opposite: pin to the top of the student's home.
  featured    boolean not null default false,

  -- Field-level corrections, applied over the projected listing. Only the keys
  -- present are overridden, so a staff member fixing one bad description does
  -- not freeze every other field against future scrapes. Validated in
  -- packages/server, never trusted from the browser.
  patch       jsonb not null default '{}'::jsonb,

  -- Why, for the next person. Not shown to students.
  note        text,

  updated_by  uuid references auth.users(id) on delete set null,
  updated_at  timestamptz not null default now()
);

create index if not exists opportunity_overrides_suppressed
  on opportunity_overrides (raw_item_id) where suppressed;
create index if not exists opportunity_overrides_featured
  on opportunity_overrides (raw_item_id) where featured;

alter table opportunity_overrides enable row level security;

-- Readable by everyone: the override IS the listing as far as a student is
-- concerned, and the portal reads it with the anon key to know what to hide.
-- `note` is the only staff-facing field and carries nothing private.
drop policy if exists overrides_read on opportunity_overrides;
create policy overrides_read on opportunity_overrides for select using (true);

-- Writable only by staff. The service key bypasses this, which is how the
-- admin API writes; the policy is what stops a browser with the anon key.
drop policy if exists overrides_write on opportunity_overrides;
create policy overrides_write on opportunity_overrides
  for all using (is_staff()) with check (is_staff());

-- ---------- 3. audit --------------------------------------------------
create table if not exists admin_audit (
  id         bigserial primary key,
  actor      uuid references auth.users(id) on delete set null,
  actor_email text,                       -- kept verbatim: an account can be
                                          -- deleted and the record must survive
  action     text not null,               -- 'publish' | 'update' | 'suppress' | 'restore' | 'feature' | 'scrape'
  target     text,                        -- raw_items id, or a URL for a scrape
  detail     jsonb not null default '{}'::jsonb,
  at         timestamptz not null default now()
);
create index if not exists admin_audit_at on admin_audit (at desc);

alter table admin_audit enable row level security;

-- Staff read it; nobody writes it from a browser. Entries are made by the
-- admin API with the service key, so a staff member cannot author their own
-- audit trail.
drop policy if exists admin_audit_read on admin_audit;
create policy admin_audit_read on admin_audit for select using (is_staff());

comment on table opportunity_overrides is
  'Staff corrections layered over raw_items at projection time. raw_items is '
  'upserted by W01 every run, so edits written there would be overwritten; '
  'see db/020.';
