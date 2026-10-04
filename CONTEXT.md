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
| Automatically collect from public sources | `n8n/workflows/W01` — 15 registered sources |
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

**Built, tested, in this repo (updated 2026-10-01):**
- Postgres schema, views and the seeded source registry — **applied to Supabase**
  (`000`→`005`). `select count(*) from sources` → 15. The legacy v0 table was
  retired by `000` to `opportunities_v0_20261001`.
- `W01 · Scrape Opportunities` — one registry-driven workflow, 28 nodes,
  generated and structurally validated.
- The HTML/date parsing library, with 30 passing assertions
  (`node tests/parse.test.mjs`).
- Normaliser tests against cached live API payloads — 27 passing assertions
  (`node tests/normalize.test.mjs`).
- A local harness that runs the real code nodes against the live internet with
  no n8n and no Supabase (`node scripts/scrape-local.mjs`). **Last run
  (2026-10-01): 1,491 items, 100% with a title and a URL, type hint on 91%,
  degree level on 70%.** 13 of 15 sources return items; `erc` and
  `erasmus_plus` correctly return 0 (see §13.10).
- All 15 endpoints probed green, and the probe now asserts the response *carries
  records* rather than merely returning 200.
- **Audience fit (db/012, 2026-10-01).** The finder is for BITS Pilani Dubai,
  where ~99% of students are Indian nationals. `opportunity_desk` is **disabled**
  (Africa-targeted aggregator, 46% of the corpus and the wrong 46%); roundup
  listicles and nationality-locked listings are rejected at ingest by
  `_lib_html.js:audienceReject()`; and `nsf_awards` / `nih_reporter` /
  `openaire` / `cordis` carry `config.record_kind = 'awarded'` because they are
  registers of money already granted, so they are ingested but kept out of the
  apply-now list. **2,273 rows stored, 1,363 of them open calls, 697 with a
  firm deadline.** Full rationale and the measured before/after in
  `docs/sources.md` § Audience fit.
- **db/013** then split `record_kind` four ways and cut the finder to **431
  rows**, all student-actionable: `grants_gov` is `institutional` (NIH/NSF/DoD
  mechanisms whose applicant is a university or a faculty PI, and `search2`
  returns only 10 fields so eligibility is not even knowable), and
  `daad_programmes` is `programme` (a course catalogue you enrol in and pay
  for). Nothing deleted; `scripts/build-ui-data.mjs` allowlists `open_call`.
- **`docs/opportunity-landscape.md`** — who students worldwide actually use to
  find opportunities, where those sites get their data, and a ranked candidate
  list for `sources`. Key finding: the student-facing layer is advertiser-funded
  and therefore closed, while the open machine-readable layer is funder-facing
  and therefore institutional. Read it before adding a source.

- **Rover, the agent chat (`/rover`), added 2026-10-04.** A conversational
  discovery layer over the same index the rest of the API serves: it qualifies
  in conversation (one question at a time, not a questionnaire), searches
  through `@rof/core`'s own `filter()`/`sort()`, and answers in the portal's
  `OpportunityCard`. Four read-only tools, a manual streaming agent loop, and
  server-sent events. `packages/server/src/rover/`, mounted at
  `POST /api/rover` on both deployments; the screen is `web/app/rover/`.
  **`OPENROUTER_API_KEY` is optional** — without it the endpoint answers 503 and
  the screen says so, and nothing else in the portal changes. 67 assertions
  across `tests/rover.test.mjs` (27 — the tools, against the real index),
  `tests/rover-loop.test.mjs` (32 — the loop, the budget and the SSE wire,
  against a fake OpenRouter) and `tests/rover-textgate.test.mjs` (8).

- **The model is OpenRouter, not Anthropic, and that choice shapes the code.**
  The transport is `rover/openrouter.ts` — plain fetch against the
  chat-completions shape, no SDK. The default model is
  `nvidia/nemotron-3-super-120b-a12b:free`, overridable with `ROVER_MODEL`. A
  free OpenRouter key is **one shared bucket of 50 model requests per day for
  the whole portal**, and one conversational turn spends two to four of them,
  so the four rate-limiting layers in that file are load-bearing rather than
  courtesy guards. Two consequences worth knowing before touching the prompt:
  the free model is far weaker at following prose instructions than Opus was,
  which is why the prompt now states limits as counted prohibitions with
  worked counter-examples; and `rover/textgate.ts` exists because this class
  of model sometimes answers by writing its tool call out as text.

**NOT done yet — do not assume otherwise:**
1. **W01 has never run inside n8n.** It has not been imported, because there is
   still no `N8N_API_KEY`. The local harness exercises the parsing and planning
   logic, *not* n8n's own nodes — its RSS reader, the PostgREST upsert
   round-trip, or `splitInBatches` semantics. Those are still unproven.
2. **Nothing has been written to `raw_items` yet.** It is empty.
3. **There is no classifier.** `W09` was removed, so `opportunity_type`,
   `degree_levels` and `fields_of_study` are only ever populated from source
   taxonomy or a per-source branch. 9% of rows still have no type and 30% no
   degree level, and **`fields_of_study` is empty on every row** — nothing in
   the current pipeline can infer it.
4. **Feed relevance is pattern-based, not semantic.** Migrations `006`/`007`
   filter four news-heavy feeds by regex (§13.10). It works on today's titles;
   it is not robust to a feed rewording things, and it is the one piece here
   that would be better done by the classifier.
5. **W13 (student matching + digest) does not exist.** Tables are there, logic is not.
6. **The portal integration is gone** with `W12`; `v_portal_feed` still exists.
7. `opportunity_sources` cross-source dedupe is written but never exercised.
8. **Rover's prompt is tuned against the real model, but only over four
   scenarios.** On 2026-10-04 it was run live against
   `nvidia/nemotron-3-super-120b-a12b:free` with the key in `web/.env.local`,
   and the prompt was rewritten off what came back — each rule in
   `prompt.ts` that reads as a counted prohibition with a "Not: … Yes: …"
   example is there because the prose version of it failed live. Fixed that
   way: re-asking the same question, menu questions ("scholarships,
   internships, research, or something else?"), searching and then asking
   instead of recommending, asking before searching on an already-complete
   request, `q` stacked on three filters until the result was empty, an
   `index_vocabulary` warm-up call, dropping half a two-country request,
   asking a question after an empty search instead of relaxing it, brochure
   closers, and inventing what a scholarship covers (a search row carries a
   funding BUCKET; `toSummary` strips `benefits` and `amounts`).

   What is still unproven: the four openers in `RoverScreen.tsx` are what it
   was tested on, so a conversation that goes sideways — a student arguing,
   switching topic mid-flow, or asking something the index cannot answer — has
   not been watched. Known remaining inefficiency: it sometimes spends two
   `get_opportunity` calls before `recommend` where the prompt says to
   recommend first, which costs two of the fifty daily requests. Re-read a few
   exchanges after any prompt edit; `ROVER_MODEL` is the dial to raise if the
   judgement looks shallow, and a credited key would let it.

## 3. Architecture

```
                   ┌──────────────────────────────────────────┐
                   │  sources   (registry: 15 rows, tiers 1-3) │
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
re-crawl 15 sources. This is both cheaper and the polite thing to do.

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
| `W01` | Scrape Opportunities | daily 02:00, or manual | reads every enabled row in `sources`, routes by `kind` through `Route By Kind`, normalises → `raw_items`, then drains the detail queue in the same run |

**W01 replaced W02–W06 on 2026-10-01** (one workflow, by request). Its four
branches converge on one upsert:

| branch | sources | nodes |
| --- | --- | --- |
| `wp_rest` | 3 | Build Probe URL → Probe Total Pages → Plan Pages → Fetch WP Page → Normalize WP |
| `rss` | 6 | Expand Feed URLs → Read Feed → Normalize RSS |
| `post_api` | 2 | Plan API Requests → Is POST? → Call POST API → Normalize API |
| `json_api` | 4 | Plan API Requests → Is POST? → Call GET API → Normalize API |

`post_api` and `json_api` share one planner (`plan_api.js`) and one normaliser;
`Is POST?` picks the HTTP node. Because `Loop Sources` has `batchSize: 1`, only
one kind is ever in flight per iteration, which is what makes the index pairing
in `normalize_api.js` (`$('Plan API Requests').all()[i]`) safe.

**Removed from the build** (2026-10-01, out of scope): `W09` classify, `W11`
freshness sweeper, `W12` portal sync. Recoverable from git history — they were
deleted, not rewritten. Their code nodes went with them.

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
   comment contains a line with just `* LIB` — with or without the closing
   `*/` — gets the library injected at build time. Fix a parser once, and every
   workflow gets the fix. `build.py` **fails the build** if a node calls a lib
   helper without the lib injected; see §13.1 for why that guard exists.
3. **`node tests/parse.test.mjs` must pass.** It asserts against three cached
   live pages in `tests/fixtures/`. Add a fixture whenever a new source shape
   appears — a parser change that breaks an old source is the main regression risk.
4. **`./scripts/probe-sources.sh` before a demo.** Non-zero exit = a tier-1
   source is down.
5. **Migrations are append-only.** Never edit `001`–`003`; add `004_*.sql`.
6. **Secrets stay in `.env`** (gitignored). `.env.example` lists the keys.
7. **Dates:** store `date`/`timestamptz`; compare in UTC. Deadlines are dates,
   not timestamps — a deadline has no timezone.
8. **Rover states nothing a tool did not return.** Every fact it reports — a
   deadline, an amount, an eligibility rule, a link — comes back through one of
   the four tools in `packages/server/src/rover/tools.ts`, and every
   opportunity it shows is a row `recommend` named by id. Adding a fifth tool
   is fine; letting the prompt answer from the model's own memory is not.
9. **Both names live in `packages/core/src/identity.ts`.** `APP_NAME` ("Orbit")
   and `AGENT_NAME` ("Rover") are there rather than in the frontend because the
   system prompt needs them too. `web/components/layout/brand.ts` re-exports
   them, so every screen imports from the place it always did.
10. **Keep Rover's prompt split in two.** `DOCTRINE` is frozen and carries the
    cache breakpoint; the date, the index size and the student's profile go in
    `situation()` after it. Moving anything per-request into the first block
    costs a full prompt re-read on every turn and fails nothing loudly —
    `tests/rover-loop.test.mjs` asserts the split for that reason.

---

## 10. Verification loop

```bash
node tests/parse.test.mjs          # parser unit + live-fixture tests (21 assertions)
# Rover (the agent chat). The two flags let plain node load TypeScript that
# imports across packages; see scripts/ts-resolve.mjs for why.
node --conditions react-server --import ./scripts/ts-resolve.mjs tests/rover.test.mjs
node --conditions react-server --import ./scripts/ts-resolve.mjs tests/rover-loop.test.mjs
node --conditions react-server --import ./scripts/ts-resolve.mjs tests/rover-textgate.test.mjs
node tests/normalize.test.mjs      # normalisers vs cached API payloads (27 assertions)
python3 n8n/build.py --check       # workflows match source
./scripts/probe-sources.sh         # 15 endpoints, asserts records not just 200
node scripts/scrape-local.mjs      # run the real code nodes against live sources
./scripts/n8n-import.sh            # push to n8n (needs N8N_API_KEY)
```

`scrape-local.mjs` reads the **live** `sources` table when Supabase is reachable
and falls back to `db/003_seed.sql` otherwise, so it always tests the config the
workflow would actually read. `--only <kind|slug>` narrows it; `--detail N` also
fetches and parses N detail pages.

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

## 13. Bugs found by actually running it (2026-10-01)

Every one of these was invisible to `build.py` and to `probe-sources.sh`. They
are recorded because each cost real time to find.

1. **The shared library was never injected into any code node.** `build.py`
   matched the marker with `^\s*\*\s*LIB\s*$`, but every code node writes it as
   ` * LIB */` — the marker closes the header comment on the same line. So the
   regex never matched and `plain`, `fingerprint`, `toISODate`,
   `extractDeadline`, `sections` and `extractApplyLink` were **absent from the
   generated JSON**. All four normalisers would have thrown
   `plain is not defined` on their first execution — and the original W02–W12
   shipped the same way (verified against git HEAD). Structural validation
   passed throughout, because it only checked node names and `$()` references.
   Fixed, and `validate()` now fails the build if a node calls a lib helper
   without the lib. **If you add a code node that uses the lib, the build will
   tell you — do not bypass that check.**

2. **`class_list` is not always an array.** `opportunitydesk.org` returns it as
   an object keyed by index (`{"0":"post-178813",…}`), so `.filter()` threw and
   killed the run for every source queued behind it. `normalize_wp.js` now
   coerces `class_list`, `categories` and `di_urgency` through one `arr()`
   helper. Fixture: `tests/fixtures/api/wp_opportunity_desk.json`.

3. **A 200 is not evidence a source still works.** `scholars4dev.com/feed/`
   returned a valid, well-formed, **completely empty** RSS channel — 1,290 bytes,
   zero `<item>` elements. The probe called it green while ingest got nothing.
   `probe-sources.sh` now has `chk_has`, which asserts the body carries records.
   The same site exposes a full WP REST API (`X-WP-Total: 477`), so migration
   `004` changed its `kind` from `rss` to `wp_rest` — a registry edit, no
   workflow change, which is the property rule 3 protects.

4. **`cscuk.fcdo.gov.uk` sends `content-encoding: gzip` even with no
   `Accept-Encoding`.** Plain `curl` pipes binary into `grep`, which is why the
   new content assertion first reported 0 items for a feed that actually has 10.
   `probe-sources.sh` uses `--compressed`. `fetch()` handles this by itself.

5. **CORDIS `item_path` was wrong** (`hits.hits`; the API serves
   `payload.results`). Beware `payload.records` — it is a *range string*
   (`"1-5"`), not the records. Its dates are unresolved templates
   (`1 {{month_01}} 2014`) and are deliberately not stored.

6. **DAAD drops every row through a generic mapper**, because its courses are
   keyed on `courseName`, not `title`, and `link` is relative.
   `preparationForDegree` is null on every row of the unfiltered query, and
   `courseType`'s numeric mapping is undocumented — so degree level is inferred
   from the course name and `courseType` is kept in `raw`.

7. **~13% of OpenAIRE project records are placeholders** whose title is the
   literal string `"unidentified"` and whose `websiteUrl` is always null. They
   are dropped, and the project URL is built from `id`.

8. **A post's type must be chosen, not taken from the first category.**
   `opportunitydesk` files "AfDB Internship Program" under both *Hot Jobs* and
   *Internships*; `mapped[0]` made it a `job`. `normalize_wp.js` now resolves
   type through an explicit `TYPE_RANK` precedence list.

9. **The apply-link denylist needed `svfellow`.** All three sampled
   opportunitiescircle detail pages returned `svfellow.com` — an unrelated
   programme promoted through an Elementor button that outranks the real target.
   The genuine links were `theforage.com`, `unicef.org/careers/internships` and
   `erasmusintern.org/traineeships`. Guarded by an inline assertion in
   `parse.test.mjs` (`tests/fixtures/*.html` is gitignored, so a file fixture
   would not travel).

10. **Four "funder" RSS feeds are site-wide news feeds.** Measured yields
    before filtering: `erc` 0/10 real (staff vacancies, presidential speeches,
    Davos), `erasmus_plus` 0/10 (form annexes, privacy statements, EU news),
    `msca` 2/10, `commonwealth_cscuk` 2/10. For contrast `ukri_opportunities`
    was 20/20 genuine calls and `nsf_funding` 10/10, so this is per-source, not
    a global property of RSS. No dedicated opportunity feed exists for either EU
    body — `erc.europa.eu/funding/rss.xml`, `/news-events/rss.xml`,
    `/calls-proposals/feed`, and the erasmus-plus `/opportunities/` and `/calls/`
    equivalents all 404. Handled by `sourceFilter()` in `_lib_html.js` driven by
    `config.include_patterns` / `.exclude_patterns` (migrations `006`, `007`).
    **Exclusions are evaluated before includes**, which matters because several
    MSCA news items contain the word "fellowship". `erc` and `erasmus_plus`
    staying at 0 items is the correct outcome, not a failure — they remain
    enabled as a standing watch.

11. **`nih_reporter` was labelling 200 awarded projects `research_internship`.**
    They are awarded grants, not advertised openings, so this overstated that
    category by 200 rows and implied a post a student could apply to. Now
    `grant`, consistent with `nsf_awards` (non-REU), `cordis` and `openaire`.
    REU sites in `nsf_awards` *are* genuinely `research_internship` and keep
    that type, with `bachelors` as the level.

---

## 12. Definition of done for the hackathon demo

1. Schema applied; `v_source_health` shows 15 sources, none failing.
2. ≥ 300 classified opportunities with non-null `deadline` or an explicit
   `deadline_kind`, spanning bachelors / masters / phd.
3. `W02` demonstrably incremental — show a run touching ~18 records.
4. `W11` demonstrably expiring items — show one moving `active` → `expired`.
5. `W12` populating the Sheet the portal already reads.
6. One student profile → ranked matches with visible reasons (needs W13).
7. A one-slide architecture diagram (§3) plus the "add a source = one INSERT"
   claim, demonstrated live.
