-- Enforce the campus-only rule in the database.
--
-- WHY THIS EXISTS. Sign-up was restricted to @dubai.bits-pilani.ac.in in two
-- places, neither of which held:
--
--   1. web/lib/supabase.ts `isCampusEmail` — a browser check. Anyone can POST
--      straight to /auth/v1/signup with the anon key, which ships in the
--      bundle, and skip it entirely.
--   2. The confirmation email, on the theory that a non-campus address never
--      receives one. That stopped being true the moment confirmations were
--      turned off (supabase/config.toml) so reviewers could get in without
--      waiting on mail that Supabase's built-in SMTP never sends to
--      non-members anyway.
--
-- So between those two, the rule was advisory. This is the version that holds:
-- a BEFORE INSERT trigger on auth.users, which every path into the table goes
-- through — the REST endpoint, an admin create, the dashboard.
--
-- It is NOT the data-access boundary. That is still row-level security in 015,
-- which does not care which domain anyone signed up from. This only decides
-- who gets to exist.

create or replace function enforce_campus_email() returns trigger
  security definer set search_path = public as $$
begin
  -- An account with no email at all would be an OAuth or phone identity, which
  -- this product does not offer. Let it through rather than guess: if those are
  -- ever enabled, the rule for them should be written deliberately, not
  -- inherited from a check that was aimed at passwords.
  if new.email is null then
    return new;
  end if;

  if lower(new.email) not like '%@dubai.bits-pilani.ac.in' then
    -- Reaches the browser as the Supabase error message, so it is written for
    -- the student, not the log. web/lib/auth.tsx also matches on "BITS" to be
    -- certain it is shown verbatim rather than flattened to "something went
    -- wrong".
    raise exception 'Orbit is open to BITS Pilani Dubai students. Use your @dubai.bits-pilani.ac.in email.'
      using errcode = 'check_violation';
  end if;

  return new;
end $$ language plpgsql;

drop trigger if exists on_auth_user_campus_check on auth.users;
create trigger on_auth_user_campus_check before insert on auth.users
  for each row execute function enforce_campus_email();
