-- =====================================================================
-- migration 011 · backfill deadlines that were parsed from detail pages but
-- never promoted out of the `detail` blob.
--
-- The detail page is the ONLY place a deadline exists for opportunity_desk and
-- scholars4dev -- neither publishes one through its listing API. The first
-- drained batch parsed 248 of them, but `Save Detail` was writing only the
-- `detail` jsonb, so none reached the indexed `deadline` column the UI and the
-- queue sort on. The workflow now promotes them; this catches the rows already
-- fetched.
--
-- Never overwrites an existing deadline: a structured field from the listing
-- beats a date parsed out of prose. Past and sentinel dates are excluded here
-- the same way plausibleDeadline() excludes them at ingest.
--
-- Idempotent.
-- =====================================================================
update raw_items
   set deadline      = (detail->>'deadline')::date,
       deadline_kind = coalesce(deadline_kind, 'fixed')
 where deadline is null
   and detail->>'deadline' ~ '^\d{4}-\d{2}-\d{2}$'
   and (detail->>'deadline')::date >= (now() at time zone 'utc')::date
   and (detail->>'deadline')::date <= ((now() at time zone 'utc') + interval '10 years')::date;
