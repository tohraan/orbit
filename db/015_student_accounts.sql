-- 015 · Student accounts: one student, many of everything else.
--
-- Until now a student's saved list, tracker and profile lived in their own
-- browser. That was honest about having no accounts, but it meant the work was
-- lost on a new device, on a cleared cache, and to anyone sharing a machine.
--
-- Identity comes from Supabase Auth (`auth.users`), not from a table we invent:
-- password hashing, email confirmation, session refresh and token rotation are
-- all things to inherit rather than write. Everything below hangs off that id.
--
-- SHAPE. One row per student in `students`; many rows per student in
-- `student_saved`, `student_tracker` and `student_documents`. The profile is
-- 1:1 so it lives on `students` itself rather than in a table that can only
-- ever hold one row per owner.
--
-- ACCESS. Every table is row-level secured against `auth.uid()`. The policies
-- are the real enforcement: the browser talks to PostgREST with the ANON key,
-- which is public by design, so nothing may rely on the client being honest.
-- The service key still bypasses all of this and stays server-side only.

-- ---------- 1. the student ------------------------------------------
create table if not exists students (
  -- Not a new identity: the same uuid Supabase Auth issued. Cascade means
  -- deleting the auth user removes everything they own, which is what a
  -- deletion request has to do.
  id              uuid primary key references auth.users(id) on delete cascade,

  email           text not null,
  full_name       text,
  phone           text,

  -- Academic details, collected at onboarding.
  degree          text,         -- be | bba | mba | me | phd
  branch          text,
  year_of_study   text,
  graduation      text,

  -- What the matcher reads (packages/core/src/match.ts).
  level           text,         -- bachelors | masters | phd | postdoc
  fields          text[] not null default '{}',
  countries       text[] not null default '{}',
  funding         text,

  -- Staff flag. Deliberately NOT self-service: a student cannot grant it to
  -- themselves because the RLS update policy below forbids changing it.
  is_staff        boolean not null default false,

  reviewed_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table students is
  'One row per authenticated student, keyed to auth.users. Profile fields are '
  '1:1 so they live here; saved items, tracked applications and documents are '
  'many-per-student and have their own tables. See db/015.';

-- ---------- 2. saved opportunities (many per student) ----------------
create table if not exists student_saved (
  id              bigserial primary key,
  student_id      uuid not null references students(id) on delete cascade,
  -- raw_items.id. Not a foreign key on purpose: the sweep deletes expired
  -- listings, and a student's record that they once saved something should
  -- not disappear with it, nor block the delete.
  opportunity_id  bigint not null,
  saved_at        timestamptz not null default now(),
  unique (student_id, opportunity_id)
);
create index if not exists student_saved_by_student on student_saved (student_id, saved_at desc);

-- ---------- 3. application tracker (many per student) ----------------
do $$ begin
  create type application_status as enum
    ('interested','planning','applied','next_step','accepted','rejected');
exception when duplicate_object then null; end $$;

create table if not exists student_tracker (
  id              bigserial primary key,
  student_id      uuid not null references students(id) on delete cascade,
  opportunity_id  bigint not null,
  status          application_status not null default 'interested',
  note            text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (student_id, opportunity_id)
);
create index if not exists student_tracker_by_student on student_tracker (student_id, updated_at desc);

-- ---------- 4. documents (many per student) --------------------------
-- The row is the record; the file itself goes to Supabase Storage. Parsing is
-- not built yet (see HANDOVER.md), so the extracted columns stay null rather
-- than being filled with guesses.
create table if not exists student_documents (
  id              bigserial primary key,
  student_id      uuid not null references students(id) on delete cascade,
  kind            text not null default 'other',   -- resume | transcript | certificate | other
  file_path       text not null,                   -- storage object path
  file_name       text not null,
  byte_size       bigint,
  mime_type       text,
  parsed_at       timestamptz,
  parsed          jsonb,
  uploaded_at     timestamptz not null default now()
);
create index if not exists student_documents_by_student on student_documents (student_id, uploaded_at desc);

-- ---------- 5. keep updated_at honest --------------------------------
create or replace function touch_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end $$ language plpgsql;

drop trigger if exists students_touch on students;
create trigger students_touch before update on students
  for each row execute function touch_updated_at();

drop trigger if exists student_tracker_touch on student_tracker;
create trigger student_tracker_touch before update on student_tracker
  for each row execute function touch_updated_at();

-- ---------- 6. create the student row on sign-up ---------------------
-- Without this the first write after sign-up fails a foreign key, and the app
-- has to paper over it. A trigger means the row exists before the session is
-- handed to the browser.
create or replace function handle_new_student() returns trigger
  security definer set search_path = public as $$
begin
  insert into public.students (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data->>'full_name')
  on conflict (id) do nothing;
  return new;
end $$ language plpgsql;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_student();

-- ---------- 7. row-level security ------------------------------------
-- This is the whole access model. The browser holds the anon key, so every
-- rule has to hold against a caller who can send any request they like.
alter table students          enable row level security;
alter table student_saved     enable row level security;
alter table student_tracker   enable row level security;
alter table student_documents enable row level security;

drop policy if exists students_select_own on students;
create policy students_select_own on students
  for select using (auth.uid() = id);

drop policy if exists students_insert_own on students;
create policy students_insert_own on students
  for insert with check (auth.uid() = id);

-- A student may edit their own row but may NOT make themselves staff. The
-- check compares against the existing value, so is_staff can only be changed
-- by something that bypasses RLS — the service key, i.e. an administrator.
drop policy if exists students_update_own on students;
create policy students_update_own on students
  for update using (auth.uid() = id)
  with check (auth.uid() = id and is_staff = (select s.is_staff from students s where s.id = auth.uid()));

do $$
declare t text;
begin
  foreach t in array array['student_saved','student_tracker','student_documents'] loop
    execute format('drop policy if exists %I_own on %I', t, t);
    execute format(
      'create policy %I_own on %I for all using (auth.uid() = student_id) with check (auth.uid() = student_id)',
      t, t);
  end loop;
end $$;

-- ---------- 8. document storage bucket --------------------------------
-- Private. A resume is the most sensitive thing this product will ever hold,
-- so the bucket is not public and every object is namespaced by the owner's
-- uuid; the policies below only ever match a path whose first segment is the
-- caller's own id.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'student-documents', 'student-documents', false, 10485760,
  array['application/pdf','image/png','image/jpeg',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

do $$
declare p text;
begin
  foreach p in array array['read','insert','update','delete'] loop
    execute format('drop policy if exists student_docs_%s on storage.objects', p);
  end loop;
end $$;

create policy student_docs_read on storage.objects for select
  using (bucket_id = 'student-documents' and (storage.foldername(name))[1] = auth.uid()::text);
create policy student_docs_insert on storage.objects for insert
  with check (bucket_id = 'student-documents' and (storage.foldername(name))[1] = auth.uid()::text);
create policy student_docs_update on storage.objects for update
  using (bucket_id = 'student-documents' and (storage.foldername(name))[1] = auth.uid()::text);
create policy student_docs_delete on storage.objects for delete
  using (bucket_id = 'student-documents' and (storage.foldername(name))[1] = auth.uid()::text);
