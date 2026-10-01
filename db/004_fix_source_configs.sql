-- =====================================================================
-- migration 004 · correct three source registry rows after the first live
-- scrape run (2026-10-01). All three were found by running the pipeline, not
-- by reading it: `probe-sources.sh` reports HTTP status only, so a source can
-- be "green" and still return nothing usable.
--
-- Idempotent: plain UPDATEs, safe to re-run.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. cordis · wrong item_path.
-- The API returns its projects at `payload.results`; `hits.hits` is an
-- Elasticsearch shape this endpoint does not use. Verified live:
--   GET cordis.europa.eu/api/search/results?q=contenttype='project'&format=json
--   -> { status, payload: { total, nItems, results: [...] } }
-- Note `payload.records` is a RANGE STRING ("1-5"), not the records -- do not
-- be tempted by the name.
-- ---------------------------------------------------------------------
update sources
   set config = jsonb_set(config, '{item_path}', '"payload.results"'::jsonb),
       tos_note = coalesce(tos_note,'') ||
         ' | 2026-10-01: item_path corrected to payload.results (was hits.hits).'
 where slug = 'cordis';

-- ---------------------------------------------------------------------
-- 2. scholars4dev · the RSS feed is empty, but there is a full WP REST API.
-- GET scholars4dev.com/feed/ returns 200 with a valid <channel> and ZERO
-- <item> elements (1,290 bytes, envelope only). The same site exposes
-- /wp-json/wp/v2/posts with X-WP-Total: 477.
--
-- So this is a `kind` change, not a new workflow -- which is the whole point of
-- the registry (PROMPT.md rule 3). W01's wp_rest branch picks it up unchanged.
--
-- Categories double as degree level, and category 61 'Closed' (274 posts) is
-- this site's expired bucket -- the same pattern as opportunities_circle's 2769.
-- robots.txt checked 2026-10-01: /wp-json/ is not disallowed.
-- ---------------------------------------------------------------------
update sources
   set kind     = 'wp_rest',
       base_url = 'https://www.scholars4dev.com/wp-json/wp/v2',
       config   = '{"per_page":100,
                    "needs_detail":true,
                    "max_pages":20,
                    "exclude_categories":[61],
                    "category_map":{
                      "15":{"type":"scholarship","levels":["masters"]},
                      "16":{"type":"scholarship","levels":["phd"]},
                      "52":{"type":"scholarship","levels":["bachelors"]},
                      "145":{"type":"scholarship","levels":["any"]}
                    }}'::jsonb,
       tos_note = coalesce(tos_note,'') ||
         ' | 2026-10-01: RSS feed returns 200 with zero items; switched to the'
         ' public WP REST API (X-WP-Total 477). robots.txt allows /wp-json/.'
 where slug = 'scholars4dev';

-- ---------------------------------------------------------------------
-- 3. opportunity_desk · record the robots check for its wp_rest access.
-- Its robots.txt is entirely comments: it declares Cloudflare content-signal
-- semantics but sets NO signal values and no Disallow rules, so by its own
-- clause (c) nothing is granted or restricted. Public WP REST API, no auth.
-- ---------------------------------------------------------------------
update sources
   set tos_note = coalesce(tos_note,'') ||
         ' | 2026-10-01: robots.txt has no Disallow and sets no content-signal'
         ' values; public /wp-json/ used, no auth, throttled detail fetches.'
 where slug = 'opportunity_desk';
