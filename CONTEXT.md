# CONTEXT.md — Research Opportunity Aggregation & Discovery Platform

> **Read this file first, in full, before touching anything.** It is the single
> source of truth for this project. If something here contradicts your
> assumptions about how a scraper "should" work, this file wins — every claim in
> it was verified against a live endpoint, not recalled.
>
> Last verified end-to-end: **2026-09-30**. Re-run `./scripts/probe-sources.sh`
> before trusting the source list again.

---

## 1. What we are building and why

A college hackathon entry for this problem statement (Research / Academic
Administration):

> Students pursuing Bachelor's, Master's and PhD degrees struggle to find
> research opportunities, internships, grants, scholarships and fellowships.
> The information is scattered. An existing university web portal already
> displays opportunity links, but **discovering, collecting and updating them is
> manual.** Build an automated system that discovers, collects, organises,
> categorises and regularly refreshes opportunities from publicly accessible
> sources, and integrates into the existing portal.

Required capabilities, and where each one lives in this repo:

| Requirement from the brief | Where it is implemented |
| --- | --- |
| Automatically collect from public sources | `n8n/workflows/W02,W04,W05,W06` — 16 registered sources |
| Organise by degree level (Bachelor's / Master's / PhD) | `opportunities.degree_levels` — source category hints + `W09` classifier |
| Classify by field of study, eligibility, funding type | `opportunities.fields_of_study`, `eligibility_flags`, `funding_kind` — `W09` |
| Extract and maintain deadlines + eligibility | `W03` detail parser, `W09` classifier |
| Regularly update, detect expired | `W11` freshness sweeper + per-source incremental fetch |
| Integrate with the existing portal | `db/002_views.sql` → `v_portal_feed`, mirrored by `W12` |
| Let students discover relevant opportunities | `student_profiles` / `matches` tables — **W13 not built yet** |

**Judging reality check.** The demo has to show *automation*, not a pretty table.
The three things that prove automation are: (a) the source registry — adding a
source is one SQL `INSERT`, not new code; (b) incremental fetch — a run touches
~18 changed records, not 3,000; (c) the freshness sweeper — expired items leave
the portal on their own.

---

## 2. Current state — what is real and what is not

**Built, tested, in this repo:**
- Postgres schema, views and the seeded source registry (`db/001`–`003`).
- 8 n8n workflows, generated from source and structurally validated
  (`python3 n8n/build.py` — checks node-name uniqueness, connection targets, and
  that every `$('Node Name')` reference resolves).
- The HTML/date parsing library, with unit tests that pass against three live
  pages (`node tests/parse.test.mjs`).
- All 16 source endpoints probed green (`./scripts/probe-sources.sh`).

**NOT done yet — do not assume otherwise:**
1. **The schema has never been applied to Supabase.** `db/*.sql` is unexecuted.
2. **No workflow has ever run.** They have not been imported into n8n, because
   there is no n8n API key yet. Structural validation is not execution.
3. **No Anthropic credential exists in n8n**, so `W09` cannot run. Its node
   carries the placeholder credential id `REPLACE_WITH_ANTHROPIC_CRED_ID`.
4. **W13 (student matching + digest) does not exist.** Tables are there, logic is not.
5. **The portal integration is one-way and mocked.** `W12` mirrors to the
   existing Google Sheet; the webhook node is disabled and points at
   `REPLACE-WITH-PORTAL-HOST`.
6. `opportunity_sources` cross-source dedupe is written but never exercised — no
   two sources have yet produced the same `fingerprint`.

---

## 3. Architecture

```
                   ┌──────────────────────────────────────────┐
                   │  sources   (registry: 16 rows, tiers 1-3) │
                   └──────────────────────────────────────────┘
                        │ every fetch is driven by a row here
    ┌───────────────────┼───────────────────┬───────────────────┐
    ▼                   ▼                   ▼                   ▼
  W02 wp_rest       W05 rss            W04 post_api       W06 json_api
  (2 sources)       (7 sources)        (2 sources)        (4 sources)
    └───────────────────┴───────────────────┴───────────────────┘
                              ▼
                    ┌──────────────────┐
                    │    raw_items     │  append-only landing zone
                    │  payload + hash  │  (re-classify without re-crawling)
                    └──────────────────┘
                       │              │
        needs_detail   ▼              │
                    W03 detail fetch  │
                    + parse ──────────┘
                              ▼
                    W09 classify (Claude, forced tool call)
                       ├─ classifications  (audit: model, tokens, output)
                       ▼
                    ┌──────────────────┐
                    │  opportunities   │  canonical, deduped by fingerprint
                    └──────────────────┘
                       │        ▲
                       │        └── W11 freshness sweeper
                       │            (expiry, closing_soon, link check)
                       ▼
                  v_portal_feed  ──── W12 ───▶ Google Sheet ──▶ university portal
                                          └──▶ (future) portal webhook
```

**Why a landing zone.** `raw_items` keeps the verbatim source payload. When the
classifier prompt changes, you re-run `W09` over stored rows — you do not
re-crawl 16 sources. This is both cheaper and the polite thing to do.

---

## 4. Infrastructure and access

| Thing | Value |
| --- | --- |
| n8n | local Docker, `~/n8n-local`, `http://localhost:5678`, container `n8n`, **v2.33.7**, healthy |
| n8n public webhooks | Tailscale Funnel; `N8N_PUBLIC_URL` in `~/n8n-local/.env` |
| Supabase project | `pcctpzvhakdutzzwpmsh` — **hosted/remote**, not the local stack |
| Supabase REST base | `https://pcctpzvhakdutzzwpmsh.supabase.co/rest/v1` |
| Google Sheet (portal mirror) | `1tU6BT5xkbqNzl4p9kkK6QHriyujNuBSuiXcD90Q37o0` |
| Timezone | workflows set `Asia/Dubai`; Postgres is UTC. Compare dates in UTC. |

**Existing n8n credentials — reuse these, do not create duplicates:**

| Purpose | Type | id | name |
| --- | --- | --- | --- |
| Supabase REST (all reads/writes) | HTTP Header Auth | `FluPv7K0v8r1zzx8` | `Header Auth account` |
| Portal sheet mirror | Google Sheets OAuth2 | `79O5omw14NYFyi3U` | `Google Sheets account 2` |
| Supabase native node (unused) | Supabase API | `1TYRbHGS7j73Vdn4` | `Supabase account` |

**Credential you must create once:** HTTP Header Auth named
`Anthropic API (x-api-key)`, header name `x-api-key`, value = the Anthropic key.
Then put its id into `CRED_ANTHROPIC` in `n8n/build.py` and rebuild.

> Supabase writes go through **HTTP Request + Header Auth**, not the native
> Supabase node, for one reason: the native node has no real upsert. Everything
> here is `POST … ?on_conflict=<cols>` with
> `Prefer: resolution=merge-duplicates`, which is idempotent and lets a re-run
> repair a partial run instead of duplicating it.

---

## 5. The source registry (all verified 2026-09-30)

Adding a source of an existing `kind` is an `INSERT` into `sources`. **No new
workflow.** That property is the whole design; do not break it by hardcoding a
hostname into a workflow.

### Accepted — tier 1, primary funders (authoritative)
| slug | kind | endpoint | note |
| --- | --- | --- | --- |
| `grants_gov` | post_api | `POST api.grants.gov/v1/api/search2` | **no API key**; `hitCount=200` for "fellowship" |
| `nih_reporter` | post_api | `POST api.reporter.nih.gov/v2/projects/search` | no key; *awarded* projects → lab/PI discovery |
| `nsf_awards` | json_api | `api.nsf.gov/services/v1/awards.json` | no key; awarded, incl. REU sites |
| `nsf_funding` | rss | `nsf.gov/rss/rss_www_funding_upcoming.xml` | upcoming open calls |
| `ukri_opportunities` | rss | `ukri.org/opportunity/feed/` | best single UK research-funding feed |
| `erasmus_plus` | rss | `erasmus-plus.ec.europa.eu/rss.xml` | mobility, EMJM joint masters |
| `msca` | rss | `marie-sklodowska-curie-actions.ec.europa.eu/rss.xml` | doctoral networks + postdoc fellowships |
| `erc` | rss | `erc.europa.eu/rss.xml` | PI-level grants (faculty, PhD hosting) |
| `cordis` | json_api | `cordis.europa.eu/api/search/results` | funded EU projects → host institutions |
| `openaire` | json_api | `api.openaire.eu/graph/v1/projects` | cross-funder project graph |

### Accepted — tier 2, national schemes
| slug | kind | endpoint | note |
| --- | --- | --- | --- |
| `commonwealth_cscuk` | rss | `cscuk.fcdo.gov.uk/feed/` | highly relevant to Commonwealth/India applicants |
| `daad_programmes` | json_api | `www2.daad.de/…/international-programmes/api/solr/en/search.json` | Solr JSON; DAAD's *scholarship* DB has no public API |

### Accepted — tier 3, aggregators (breadth, must be verified)
| slug | kind | endpoint | note |
| --- | --- | --- | --- |
| `opportunities_circle` | wp_rest | `www.opportunitiescircle.com/wp-json/wp/v2` | the original source; see §6 |
| `opportunity_desk` | wp_rest | `opportunitydesk.org/wp-json/wp/v2` | same WP pattern |
| `scholars4dev` | rss | `scholars4dev.com/feed/` | strong on development-sector masters funding |

### Rejected — probed and failed. Do not "fix" without re-probing.
| candidate | verdict |
| --- | --- |
| `findaphd.com` | 403, and its ToS forbids automated collection → **excluded on principle, not just technically** |
| `jobs.ac.uk` | `/jobs/rss` returns `text/html`; no real feed |
| `nature.com/naturecareers` | same — HTML, not RSS |
| `euraxess.ec.europa.eu` | no public API: `/jsonapi` 404, `?_format=json` 406, no RSS path found |
| `grants.nih.gov` guide RSS | 403 from edge WAF (use `grants_gov` + `nih_reporter` instead) |
| `api.tech.ec.europa.eu` (EU F&T "SEDIA") | returns **500** on the documented multipart shape. Worth one more attempt; ERC + MSCA + CORDIS already cover most EU ground |
| `youthop.com` | host unreachable |
| `etap.nsf.gov` (REU search) | 302, session-gated |
| `chevening.org` | connection refused from this network |

**Rule: only publicly accessible sources, and honour robots/ToS.** The brief
requires it and a judge may ask. `sources.robots_ok` and `sources.tos_note`
exist to record the answer.

---

## 6. Non-obvious facts about the primary source (learned the hard way)

`opportunitiescircle.com` is WordPress + Elementor. This section is the most
valuable thing in the file — it is what a fresh session would waste an hour
rediscovering.

1. **There is a public WP REST API.** `…/wp-json/wp/v2/posts` — no auth. The
   original pipeline regex-scraped listing HTML. Don't.
2. **`?modified_after=<ISO>&orderby=modified` works**, and the response carries
   `x-wp-total` / `x-wp-totalpages`. Measured: **18 posts** modified in the
   preceding 5 days. A nightly run should touch ~18 records, not the whole site.
3. **Country and funding type are in `class_list`**, as `country-usa` and
   `funding_type-paid`. They are *not* exposed as REST taxonomy routes
   (`/wp/v2/country` → 404), so read them from `class_list`.
4. **`categories` gives degree level directly.** Mapped in
   `sources.config.category_map`: `167`=undergrad scholarship, `168`=masters,
   `169`=phd, `481`=fellowships, `5`/`10610`=internships,
   `14280`=research internship, `7459`=postdoc, `1194`=grants …
5. **Category `2769` = `expire-opportunities`, and holds 1,919 posts.** Exclude
   it on ingest via `categories_exclude`. Excluding it is most of the value of
   the whole source.
6. **`di_urgency` is a live deadline bucket**: term `14708` = `⚫ Expired`
   (1,139 posts), `14709` = `⬜ No Deadline` (424 → treat as rolling), plus
   24h/3d/7d/30d/30d+ buckets. Free expiry signal with no date parsing.
7. **`acf` is `[]` — empty.** There are no custom fields. Deadline, eligibility,
   benefits and the apply link are **only** on the rendered detail page.
8. **`content.rendered` is nearly useless** (~7 kB, one `<h2>`, no tables, no
   external links) because Elementor stores the body in widget meta. The
   detail fetch must request the *rendered page*, not the REST content field.
9. **The `subject` taxonomy is unusable** — 9 terms, counts of 0–2. Field of
   study must be inferred by the classifier.
10. **The bug that emptied your `eligibility` / `benefits` / `how_to_apply`
    columns:** the old parser captured from a heading until the *next heading of
    any level*. The page renders
    `<h2>Eligibility Criteria :</h2><h3>Eligibility Criteria for X:</h3>`, so the
    h2's body was the whitespace before the h3 — empty. `sections()` in
    `_lib_html.js` now ends a section at the next heading of **equal or higher
    rank**. Measured after the fix, on live pages: eligibility 1,616–1,913 chars,
    benefits 1,017–1,583, how_to_apply 2,278–3,107. There is a regression test
    for exactly this shape.
11. **Deadline lives in a bare Elementor text widget**: `Deadline: October 15, 2026`.
    No table, no meta tag.
12. **Not every opportunity has one deadline.** DAAD EPOS states the deadline
    "is different for each course and university". That is `deadline_kind='varies'`
    with a `deadline_note` — *not* a parse failure, and not a null to paper over.
13. **Apply-link extraction needs a denylist**, because the page is full of the
    site's own funnel links (`opcircleacademy.com`, `nextgenyouthcamp.com`) and
    ad/analytics hosts. Real targets look like `fellowships.si.edu/SIFP` and
    `future.utoronto.ca/pearson-scholarships`. Prefer the Elementor
    `button.default` widget, then anchor text, then the application section.

---

## 7. Data model contract

Full DDL in `db/001_schema.sql`. What matters when writing code:

- **`sources`** — the registry. `config jsonb` shape depends on `kind`; see the
  comment block in the DDL. `last_success_at` is the incremental high-water mark.
- **`raw_items`** — append-only, unique on `(source_slug, external_id)`.
  `needs_detail` → W03's queue. `classified_at is null` → W09's queue.
- **`opportunities`** — canonical, unique on `fingerprint`. Generated
  `search_tsv` column plus a trigram index on `title`.
- **`opportunity_sources`** — provenance; lets the portal show "also listed by"
  and lets us prefer tier-1 phrasing over an aggregator's.
- **`classifications`** — every model call: model, version, tokens, raw output.
  This is how you tell whether a prompt edit helped.
- **`run_log`** — one row per workflow run. `v_source_health` reads it.

**Enums are deliberate, not decorative.** `opp_status` includes `needs_review`
(confidence < 0.45) and `dead_link` — the portal filters on
`status in ('active','closing_soon') and confidence >= 0.45`, so a bad
classification degrades to "hidden pending review" rather than "wrong data
shown to students".

**`v_portal_feed` is a contract.** The portal reads the view, never the table.
Additive changes only — never rename or drop a column that the portal reads.

---

## 8. Workflow inventory

Generated by `python3 n8n/build.py`. **Never hand-edit `n8n/workflows/*.json`** —
edit `n8n/src/code/*.js` or the graph in `build.py` and rebuild. A workflow
edited in the n8n UI and not mirrored back to source will be silently overwritten
on the next import.

| id | name | trigger | what it does |
| --- | --- | --- | --- |
| `W02` | Ingest · WordPress REST | daily 02:00 | probes `x-wp-totalpages`, plans exact page URLs, incremental via `modified_after`, normalises → `raw_items` |
| `W03` | Enrich · Detail Fetch & Parse | every 3h, or called | drains `needs_detail`, fetches the rendered page, parses deadline / eligibility / benefits / how-to-apply / apply link, 2 s throttle |
| `W04` | Ingest · POST APIs | daily 03:00 | grants.gov + NIH RePORTER; keyword matrix × pages |
| `W05` | Ingest · RSS | daily 04:00 | 7 funder feeds; one item per `feed_urls[]` entry |
| `W06` | Ingest · GET JSON APIs | daily 05:00 | NSF, CORDIS, OpenAIRE, DAAD |
| `W09` | Classify & Upsert Canonical | every 15 min | Claude Haiku 4.5 with a **forced tool call** → schema-valid JSON → validate → upsert `opportunities` + provenance + audit row |
| `W11` | Freshness Sweeper | daily 05:30 | expires past deadlines, flags `closing_soon` (≤30 d), re-opens recovered, checks ≤60 apply links per run |
| `W12` | Portal Sync | daily 06:00 | `v_portal_feed` → Google Sheet (`appendOrUpdate` on `id`); webhook node disabled |

**Invariants every workflow must keep:**
- Idempotent. Re-running must not duplicate rows — always `on_conflict`.
- Polite. Throttle detail fetches; identify with a real User-Agent; never
  parallel-hammer one host.
- Fail soft. Network nodes use `neverError` / `onError: continueRegularOutput`
  so one dead source cannot abort a run for fifteen others.
- Observable. Every run writes `run_log`; every classification writes
  `classifications`.
- Registry-driven. A hostname belongs in `sources`, not in a node.

**Classifier design note.** `W09` forces a tool call
(`tool_choice: {type:'tool', name:'record_opportunity'}`) against a JSON schema.
That is why the pipeline does not need JSON-repair heuristics. The parser then
*re-validates* every enum and the date format anyway, because a schema is a
request, not a guarantee. Model: `claude-haiku-4-5-20251001` — cheap enough to
re-run the whole corpus after a prompt change. Bump `CLASSIFIER_VERSION` in
`w09_build_prompt.js` whenever the prompt or schema changes; it is stored per row
so you can tell which rows need reprocessing.

---

## 9. Conventions

1. **`python3 n8n/build.py` after every change.** `--check` fails on drift; use
   it as a pre-commit / CI gate.
2. **Shared parsing lives in `_lib_html.js`.** Any code node whose header
   comment contains a line with just `* LIB` gets the library injected at build
   time. Fix a parser once, and every workflow gets the fix.
3. **`node tests/parse.test.mjs` must pass.** It asserts against three cached
   live pages in `tests/fixtures/`. Add a fixture whenever a new source shape
   appears — a parser change that breaks an old source is the main regression risk.
4. **`./scripts/probe-sources.sh` before a demo.** Non-zero exit = a tier-1
   source is down.
5. **Migrations are append-only.** Never edit `001`–`003`; add `004_*.sql`.
6. **Secrets stay in `.env`** (gitignored). `.env.example` lists the keys.
7. **Dates:** store `date`/`timestamptz`; compare in UTC. Deadlines are dates,
   not timestamps — a deadline has no timezone.

---

## 10. Verification loop

```bash
node tests/parse.test.mjs          # parser unit + live-fixture tests
python3 n8n/build.py --check       # workflows match source
./scripts/probe-sources.sh         # all 16 endpoints live
./scripts/n8n-import.sh            # push to n8n (needs N8N_API_KEY)
```

After the schema is applied, the smoke test is:

```sql
select * from v_source_health;                       -- every source 'ok'
select count(*), status from opportunities group by 2;
select * from v_review_queue limit 20;               -- what the classifier doubted
select count(*) from raw_items where classified_at is null;   -- backlog
```

A run is healthy when: `v_source_health` shows no `failing`/`stale`,
the unclassified backlog trends to zero, and `v_review_queue` is small
relative to total.

---

## 11. Open decisions and known gaps

- **W13 matching is unbuilt.** Scoring intent: degree-level match is a hard
  filter; then weighted overlap on `fields_of_study`, country preference,
  eligibility-flag compatibility (nationality, GPA, language), funding need, and
  a deadline-proximity boost. Write reasons into `matches.reasons` — a student
  should see *why* something matched.
- **Cross-source dedupe is untested.** `fingerprint()` normalises away edition
  years and funding adjectives. When two sources collide, the tier-1 record's
  wording should win. Unproven.
- **`fetchOpportunity` detail for grants.gov** is not wired, so those rows have
  no eligibility text.
- **EU Funding & Tenders (SEDIA)** is the biggest remaining coverage gap for
  EU-wide calls. One more attempt at the multipart shape is justified.
- **India / UAE / Gulf sources are absent.** For a BITS Pilani Dubai audience
  that is a real gap: ANRF/SERB, DST, UGC, Buddy4Study and the UAE ministries are
  HTML-only, so they need either a fifth `kind: html` ingester or manual curation.
  Decide before the demo; a judge from the region will notice.
- **No admin review UI.** `v_review_queue` exists; nothing renders it.
- **Google Sheets as the portal interface** is a demo convenience. The real
  integration should be the portal reading `v_portal_feed` over PostgREST with an
  anon key + RLS, or a thin read API.
- **RLS is not configured.** The service-role key is currently doing everything.
  Before anything is exposed publicly, add RLS and give the portal an anon role
  restricted to the views.

---

## 12. Definition of done for the hackathon demo

1. Schema applied; `v_source_health` shows 16 sources, none failing.
2. ≥ 300 classified opportunities with non-null `deadline` or an explicit
   `deadline_kind`, spanning bachelors / masters / phd.
3. `W02` demonstrably incremental — show a run touching ~18 records.
4. `W11` demonstrably expiring items — show one moving `active` → `expired`.
5. `W12` populating the Sheet the portal already reads.
6. One student profile → ranked matches with visible reasons (needs W13).
7. A one-slide architecture diagram (§3) plus the "add a source = one INSERT"
   claim, demonstrated live.
