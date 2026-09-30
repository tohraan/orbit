-- =====================================================================
-- migration 000 · retire the v0 tables from the original single-source
-- workflow, so 001's `create table if not exists` is not silently skipped.
--
-- The v0 `opportunities` table was keyed on `url` and had no fingerprint,
-- degree_levels, status or confidence. Its data is preserved (renamed, not
-- dropped) so you can diff old vs new during the demo, and so nothing is lost
-- if a judge asks what the original pipeline produced.
--
-- Idempotent: safe to run more than once, and a no-op on a fresh project.
-- =====================================================================

do $$
declare
  has_legacy boolean;
  has_new    boolean;
begin
  select exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'opportunities'
       and column_name = 'url'
  ) into has_legacy;

  select exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'opportunities'
       and column_name = 'fingerprint'
  ) into has_new;

  if has_legacy and not has_new then
    -- Park it out of the way with a timestamp, so repeated runs never collide.
    execute format(
      'alter table public.opportunities rename to %I',
      'opportunities_v0_' || to_char(now(), 'YYYYMMDD'));
    raise notice 'v0 opportunities table renamed; 001 will now create the new one.';
  elsif has_new then
    raise notice 'new schema already present; nothing to retire.';
  else
    raise notice 'no opportunities table found; fresh project.';
  end if;
end $$;
