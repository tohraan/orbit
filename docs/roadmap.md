# Roadmap — phased, in priority order

Stop at the end of each phase and report. Each phase lists its **exit test** —
a command or query whose output proves the phase is done. "It should work" does
not close a phase.

---

## Phase 1 — make one source work end to end

Blocked on: Supabase service key, Anthropic API key, n8n API key (see PROMPT.md §3).

1. Apply the migrations **in order**: `000_pre_migration.sql`, then `001_schema.sql`,
   `002_views.sql`, `003_seed.sql` (Studio → SQL Editor, or `psql`).
   `000` retires the v0 `opportunities` table from the original single-source
   workflow — without it, `001`'s `create table if not exists` silently skips and
   every later insert fails. Confirm: `select count(*) from sources;` → 15.
2. Create the Anthropic HTTP Header Auth credential in n8n, put its id into
   `CRED_ANTHROPIC` in `n8n/build.py`, rebuild.
3. `./scripts/n8n-import.sh` — expect 8 workflows created.
4. In the n8n UI, open each workflow and confirm no node shows a missing
   credential.
5. Temporarily disable every source except `opportunities_circle`
   (`update sources set enabled = false where slug <> 'opportunities_circle';`)
   and run W02 → W03 → W09 manually, in that order, watching each run.
6. Fix whatever actually breaks. Expect breakage in: the `x-wp-totalpages`
   header read (n8n may lowercase or nest headers differently than assumed), the
   `fullResponse` body shape in `Normalize WP`, and the PostgREST `Prefer` header
   round-trip on `Upsert Opportunity` (it must return a representation for
   `Pair Provenance` to work). These are the three most likely failure points.

**Exit test**
```sql
select count(*) from raw_items  where source_slug = 'opportunities_circle';  -- > 100
select count(*) from raw_items  where detail_fetched_at is not null;         -- > 20
select count(*) from opportunities where status in ('active','closing_soon');-- > 20
select title, degree_levels, deadline, deadline_kind, funding_kind, apply_link
  from opportunities order by first_seen_at desc limit 5;   -- eyeball: all sane
```
Plus: `eligibility`, `benefits` and `how_to_apply` are non-empty on most rows.
If they are empty, the parser regressed — that is the exact bug this rebuild
fixed (CONTEXT.md §6.10).

---

## Phase 2 — all 15 sources, backfilled

1. `update sources set enabled = true;` then run W04, W05, W06 manually.
2. Expect per-source breakage; the generic normaliser has a fall-through branch,
   so a new shape lands data but with poor field mapping. Improve
   `w04_normalize_api.js` per source rather than adding workflows.
3. Backfill: clear `last_success_at` for a source to force a full crawl
   (`update sources set last_success_at = null where slug = '…';`).
4. Drain the classifier backlog. Watch cost in `classifications` — if it is
   painful, raise `limit` in `Get Unclassified` and shorten the prompt input
   rather than switching model.
5. Wire grants.gov detail via `POST /v1/api/fetchOpportunity` so those rows get
   eligibility text.
6. Investigate cross-source dedupe: find any `fingerprint` reported by two
   sources and confirm the merge reads sensibly. Tune `fingerprint()` in
   `_lib_html.js` if it is over- or under-merging. Add a test either way.
7. Retry the EU Funding & Tenders SEDIA API once (CONTEXT.md §5). Time-box it;
   ERC + MSCA + CORDIS already cover much of the same ground.

**Exit test**
```sql
select * from v_source_health;                          -- no 'failing', no 'stale'
select count(*) from opportunities;                     -- > 300
select count(*) from opportunities where confidence < 0.45;  -- small share of total
select opportunity_type, count(*) from opportunities group by 1 order by 2 desc;
select unnest(degree_levels) lvl, count(*) from opportunities group by 1 order by 2 desc;
```
Bachelors, masters and phd must all be represented — the brief names all three.

---

## Phase 3 — W13 student matching + digest

Tables already exist (`student_profiles`, `matches`, `digest_log`).

Scoring, in this order:
1. **Hard filter:** degree level must intersect (`'any'` matches everything);
   `status in ('active','closing_soon')`; `confidence >= 0.45`.
2. **Hard filter:** excluded nationality in `eligibility_flags` must not match.
3. **Weighted score:** field-of-study overlap (0.40), country preference (0.15),
   funding match when `funding_required` (0.20), eligibility-flag compatibility
   — GPA, language, experience (0.15), deadline proximity, favouring 14–90 days
   out over both "tomorrow" and "next year" (0.10).
4. Write a human-readable entry into `matches.reasons` for every contributing
   factor. A student must be able to see *why* something matched; an unexplained
   ranking is not usable in a demo.

Then a weekly digest: top N unseen matches per opted-in student, write
`digest_log`, set `matches.surfaced_at`. **Do not send real email without
asking** — build it, run it in dry-run, show the rendered output.

**Exit test** one seeded profile → ≥ 10 ranked matches with populated reasons,
and a rendered digest for it.

---

## Phase 4 — admin review UI — SUPERSEDED, do not build

This described a page over `v_review_queue`, writing back to
`opportunities.status`. Both are dead ends, and checking before building is
one query each:

```
opportunities    0 rows          v_review_queue   0 rows
raw_items    2274 rows
```

The product never adopted the `opportunities` table. Listings are projected
from `raw_items` at read time (`packages/core/src/project.ts`), so the view
this phase is built on selects from a table nothing writes to and will return
nothing no matter how long the scraper runs. A page built against it would
render an empty state for ever.

What the phase actually wanted — staff correcting and hiding listings — exists
and is deployed: the desk at `admin/`, with corrections as override rows
(`db/020`) applied at projection time so they survive the next scrape. That is
the thing to extend, not this.

---

## Phase 5 — real portal integration — SUPERSEDED, do not build

Its first line is "replace the Sheet mirror as the interface of record". There
is no Sheet mirror: no n8n code node references Sheets, and the portal has read
from Supabase through `api/` since it was built. The RLS, the anon key and the
PostgREST query patterns in this phase all landed during that work.

Kept rather than deleted, both of them, because a roadmap that quietly loses
two phases reads as if they were finished.

---

## Phase 6 — regional coverage (India / UAE / Gulf)

The audience is BITS Pilani Dubai; the current registry is US/EU/UK heavy.
ANRF (SERB), DST, UGC, INSPIRE, Buddy4Study and the UAE ministries are HTML-only.

Options, in order of preference:
1. A fifth ingester `kind: html` driven by CSS selectors stored in
   `sources.config` — keeps the registry-driven property intact.
2. Per-source workflows — last resort; breaks the core design property.
3. Curated manual seed rows for the demo, clearly labelled as such.

Whatever you choose, check robots.txt and ToS per host first and record the
verdict in `sources.tos_note`. The brief explicitly constrains us to relevant,
publicly accessible sources.
