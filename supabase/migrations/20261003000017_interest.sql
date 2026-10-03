-- 017 — how many students are interested in each opportunity.
--
-- WHY A TABLE AND NOT A COUNT(*).
--
-- `student_saved` is row-level secured to its owner: a student can read their
-- own saves and nobody else's. That is correct and must not change — so the
-- obvious `select count(*) from student_saved where opportunity_id = ?` returns
-- 1 or 0 from the browser no matter how many students saved it. Relaxing the
-- policy to make counting work would expose who saved what, which is exactly
-- the thing the policy exists to prevent.
--
-- So the counts are maintained here by triggers running as the definer, and
-- this table — which holds no student ids, only totals — is the thing the
-- world may read. The identities stay sealed; the aggregate is public.
--
-- WHY TRIGGERS AND NOT THE CLIENT.
--
-- A count the browser reports is a count the browser can invent. Nothing here
-- is writable by anon or authenticated roles: the only way the number moves is
-- a real row appearing in a real student's saved list.

-- Students may decline to be counted. Default true because the count is
-- aggregate and carries no identity, but the choice is theirs and the consent
-- banner writes it.
alter table students add column if not exists share_interest boolean not null default true;

create table if not exists opportunity_interest (
  opportunity_id bigint primary key,
  saved_count    int not null default 0,
  tracked_count  int not null default 0,
  updated_at     timestamptz not null default now()
);

-- Readable by everyone, writable by no one. The triggers below are SECURITY
-- DEFINER, so they bypass RLS; nothing else can.
alter table opportunity_interest enable row level security;

do $$
begin
  drop policy if exists opportunity_interest_read on opportunity_interest;
  create policy opportunity_interest_read on opportunity_interest
    for select using (true);
end $$;

grant select on opportunity_interest to anon, authenticated;

-- ---------- the maintenance functions -------------------------------------
--
-- `delta` is +1 or -1. The upsert means a listing nobody has saved yet simply
-- has no row, rather than 428 rows of zeroes that have to be kept in step with
-- the index.

create or replace function bump_interest(opp bigint, col text, delta int)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if col = 'saved' then
    insert into opportunity_interest (opportunity_id, saved_count)
    values (opp, greatest(0, delta))
    on conflict (opportunity_id) do update
      set saved_count = greatest(0, opportunity_interest.saved_count + delta),
          updated_at  = now();
  else
    insert into opportunity_interest (opportunity_id, tracked_count)
    values (opp, greatest(0, delta))
    on conflict (opportunity_id) do update
      set tracked_count = greatest(0, opportunity_interest.tracked_count + delta),
          updated_at    = now();
  end if;
end $$;

-- Opting out is checked at the moment the row moves, not at read time, so a
-- student who opts out stops contributing from then on.
create or replace function counts_me(sid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select share_interest from students where id = sid), true);
$$;

create or replace function on_saved_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if counts_me(new.student_id) then perform bump_interest(new.opportunity_id, 'saved', 1); end if;
    return new;
  else
    if counts_me(old.student_id) then perform bump_interest(old.opportunity_id, 'saved', -1); end if;
    return old;
  end if;
end $$;

create or replace function on_tracked_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if counts_me(new.student_id) then perform bump_interest(new.opportunity_id, 'tracked', 1); end if;
    return new;
  elsif tg_op = 'DELETE' then
    if counts_me(old.student_id) then perform bump_interest(old.opportunity_id, 'tracked', -1); end if;
    return old;
  end if;
  -- An UPDATE that only changes the status is still one tracked application,
  -- so it moves nothing. Only a change of opportunity does.
  if new.opportunity_id is distinct from old.opportunity_id and counts_me(new.student_id) then
    perform bump_interest(old.opportunity_id, 'tracked', -1);
    perform bump_interest(new.opportunity_id, 'tracked', 1);
  end if;
  return new;
end $$;

drop trigger if exists student_saved_interest on student_saved;
create trigger student_saved_interest
  after insert or delete on student_saved
  for each row execute function on_saved_change();

drop trigger if exists student_tracker_interest on student_tracker;
create trigger student_tracker_interest
  after insert or update or delete on student_tracker
  for each row execute function on_tracked_change();

-- ---------- backfill ------------------------------------------------------
-- Idempotent: recomputed from the source tables rather than incremented, so
-- re-running this migration cannot double anything.

insert into opportunity_interest (opportunity_id, saved_count, tracked_count, updated_at)
select
  o.opportunity_id,
  coalesce(s.n, 0),
  coalesce(t.n, 0),
  now()
from (
  select opportunity_id from student_saved
  union
  select opportunity_id from student_tracker
) o
left join (
  select sv.opportunity_id, count(*) n from student_saved sv
  join students st on st.id = sv.student_id and st.share_interest
  group by 1
) s on s.opportunity_id = o.opportunity_id
left join (
  select tr.opportunity_id, count(*) n from student_tracker tr
  join students st on st.id = tr.student_id and st.share_interest
  group by 1
) t on t.opportunity_id = o.opportunity_id
on conflict (opportunity_id) do update
  set saved_count   = excluded.saved_count,
      tracked_count = excluded.tracked_count,
      updated_at    = now();
