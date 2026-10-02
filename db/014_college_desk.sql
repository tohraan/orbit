-- 014 · The college's own desk: opportunities added by hand by staff.
--
-- Deliberately NOT a parallel table. The whole architecture is registry-driven
-- (CLAUDE.md: "adding a source of an existing kind is an INSERT into sources"),
-- so a hand-added opportunity is modelled as one more source whose fetcher
-- happens to be a person. Everything downstream then works on it for free:
-- the projection in packages/core, every filter and facet, the deadline
-- timeline, search, saving, comparison. A second table would have meant
-- teaching all of that about a second shape.
--
-- The only thing the UI keys off is the slug, which is how a card earns its
-- "Added by college" tag.

-- A sixth kind. The scraper has no branch for it and never will: `enabled`
-- is false, so W01 skips the row entirely. IF NOT EXISTS keeps this migration
-- re-runnable, which matters because enum changes cannot be transactional
-- alongside their use.
alter type source_kind add value if not exists 'manual';

commit;

insert into sources (
  slug, name, kind, base_url, config,
  authority_tier, trust_score, enabled, cadence_cron, robots_ok, tos_note
) values (
  'college_desk',
  'BITS Pilani Dubai',
  'manual',
  'https://www.bits-dubai.ac.ae/',
  jsonb_build_object(
    -- Same taxonomy key db/012 introduced: these are things a student applies
    -- to, so they belong in the student finder alongside everything else.
    'record_kind', 'open_call',
    -- Read by the UI to award the "Added by college" tag, and by the admin
    -- API to refuse writes to any source that does not carry it.
    'manual', true,
    'added_by', 'staff'
  ),
  -- Tier 1 and a high trust score are not flattery: unlike every scraped
  -- source, a human at the institution checked this one before it was entered,
  -- and the student is entitled to see that in the provenance line.
  1,
  0.95,
  -- NEVER enable. `enabled` drives the scrape loop; a manual source has no
  -- endpoint to fetch and switching this on would make W01 fail every run.
  false,
  '@manual',
  true,
  'Entered by hand by BITS Pilani Dubai staff. No crawling is involved, so no robots.txt or ToS question arises.'
)
on conflict (slug) do update set
  name           = excluded.name,
  config         = excluded.config,
  authority_tier = excluded.authority_tier,
  trust_score    = excluded.trust_score,
  enabled        = false,
  tos_note       = excluded.tos_note;

-- external_id for a manual row is 'staff-<epoch>-<rand>', minted by the API.
-- The unique (source_slug, external_id) constraint already in 001 is what makes
-- the admin POST idempotent on retry.
comment on table raw_items is
  'Append-only landing zone. source_slug = ''college_desk'' marks rows entered '
  'by staff through /admin rather than fetched; see db/014.';
