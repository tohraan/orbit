-- =====================================================================
-- migration 010 · promote deadline out of the payload into real columns.
--
-- PostgREST cannot ORDER BY a jsonb path: `order=payload->>deadline.asc` is
-- accepted but silently ignored (verified against all of .asc/.desc/.nullslast
-- and both -> and ->> forms), so the detail queue could not put the
-- soonest-closing opportunities first. A real column fixes that, gives us an
-- index, and makes every downstream filter -- including the portal UI --
-- straightforward instead of a jsonb expression.
--
-- Not a generated column on purpose: text->date is only STABLE, not IMMUTABLE,
-- so Postgres rejects it in a generated expression. The workflow writes these
-- alongside `payload`; this migration backfills what is already here.
--
-- Idempotent.
-- =====================================================================
alter table raw_items add column if not exists deadline      date;
alter table raw_items add column if not exists deadline_kind text;

-- backfill from the payload, ignoring anything that is not a clean ISO date
update raw_items
   set deadline = (payload->>'deadline')::date
 where deadline is null
   and payload->>'deadline' ~ '^\d{4}-\d{2}-\d{2}$';

update raw_items
   set deadline_kind = payload->>'deadline_kind'
 where deadline_kind is null
   and payload->>'deadline_kind' is not null;

create index if not exists raw_items_deadline_idx      on raw_items (deadline);
create index if not exists raw_items_detail_queue_idx  on raw_items (needs_detail, detail_fetched_at)
  where needs_detail and detail_fetched_at is null;
