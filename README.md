# Orbit

**Every research opportunity a BITS Pilani Dubai student can actually apply
to, in one place — with the deadline that matters next.**

Scholarships, fellowships, research internships and grants are scattered across
sixteen public sources, each with its own format, its own idea of a deadline,
and no notion of who is eligible. Orbit collects them on a schedule, normalises
them, strips the ones a student cannot apply to, and presents what is left as
something you can plan against.

Hackathon entry — **Research / Academic Administration.**

---

## For the judging panel

> ### Reviewer access — no account needed
>
> The portal is gated to `@dubai.bits-pilani.ac.in` addresses, enforced by a
> database trigger (`db/019_campus_signup.sql`). You do not have one, so we
> built you a door instead of asking you to score a sign-in screen.
>
> **On the sign-in page, press “I am judging — open without an account”.**
> Or open the deployed link with `?judge=1` appended.
>
> You get the entire product: the full index, matching, the deadline calendar,
> comparison and the application tracker. The only difference is that anything
> you save is kept in your browser rather than against an account, and a
> small bar at the bottom of the screen says so for the whole visit.
>
> It is a front-door exemption, not a security hole: it mints no session and
> relaxes no database policy, so no student's data is reachable through it, and
> the staff desk at `/admin` stays behind its own server-checked token. The
> mechanism and its limits are documented in `web/lib/demo.ts`.

| | |
| --- | --- |
| **Live** | _see **Deployment** below_ |
| **Index** | **431 open calls** from 6 publishing sources · 111 with a firm deadline · 155 with full eligibility and an apply link |
| **Collected** | **2,274 raw records** from 14 enabled sources, nightly at 02:00 |
| **Stack** | Next.js 16 · React 19 · TypeScript · Supabase (Postgres + Auth + Storage) · n8n · Python · Vercel |
| **Start reading** | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) |

### The three things that prove this is automated, not curated

1. **Adding a source is one SQL `INSERT`.** The scraper is driven by a registry
   table, not by code. No new workflow, no hostname in a node.
2. **A run touches what changed, not everything.** The primary source is polled
   with `?modified_after=…`; a nightly run picks up ~18 modified records out of
   3,000, not the whole site.
3. **The index curates itself down.** Six of sixteen sources publish records a
   student *cannot* apply to. They are collected, classified by kind, and kept
   out of the student view — rather than padded into the headline number.

---

## Features

| | What it does |
| --- | --- |
| **Index** | 431 open calls, deduplicated, expired listings dropped index-wide. Full-text search, filters on degree level, type, funding, country and deadline window. |
| **Match** | A published weights table — degree level 34%, field 26%, funding 18%, country 12%, time to prepare 10% — scores every listing against the student's profile and **shows the reasons that produced the score**. Not a trained model, and the UI says so. |
| **Gaps** | The matcher reports which missing profile facts would most improve the match, so the app asks for them instead of silently scoring badly. A score below the confidence floor is presented as uncertain, never as a recommendation. |
| **Deadlines** | A calendar with per-day density beside a filterable list, so “when is it busy” and “what closes that day” are one glance apart. Exports to `.ics`. |
| **Dossier** | Keeps the files applications ask for. Extracts text from PDFs **in your browser**, then offers what it found for you to accept or reject — nothing reaches your profile until you say yes, and every suggested term shows the sentence it came from plus how many live listings it would actually reach. |
| **Compare** | Two or three listings side by side on the fields that decide an application. |
| **Tracker** | Per-application status through the stages of applying, so a half-finished application is not lost. |
| **Interest counts** | How many students saved each listing, maintained by database triggers so the number cannot be forged by a browser — and holding no student identities, so the aggregate is public while the identities stay sealed (`db/017_interest.sql`). |
| **Accounts** | Supabase Auth, campus-restricted, with row-level security on every student table. Onboarding runs once and is recorded as a fact, not inferred. |
| **College desk** | `/admin` — staff add opportunities they already know about, behind a shared server-checked token. |

---

## The pipeline

```
┌──────────────────────────────────────────────────────────────┐
│  sources  — the registry. 16 rows, 14 enabled, 4 endpoint    │
│  shapes, authority tiers 1–3. Every fetch is driven by a row │
└──────────────────────────────────────────────────────────────┘
          │  n8n · W01 · Scrape Opportunities · 31 nodes
          │  cron 0 2 * * *  (daily 02:00, Asia/Dubai)
          ▼
   ┌──────────────┬──────────────┬──────────────┬──────────────┐
   │   wp_rest    │     rss      │   post_api   │   json_api   │
   │  3 sources   │  6 sources   │  2 sources   │  4 sources   │
   └──────────────┴──────────────┴──────────────┴──────────────┘
          │  normalise · shared HTML/date library · relevance filters
          ▼
   ┌──────────────────────────────────────────┐
   │  raw_items   2,274 rows                  │  append-only landing zone
   │  verbatim payload + content hash         │  (re-process without re-crawling)
   └──────────────────────────────────────────┘
          │  detail queue · fetch rendered page · parse
          │  eligibility · benefits · how to apply · documents
          │  deadline · apply link · amounts     (155 enriched)
          ▼
   ┌──────────────────────────────────────────┐
   │  record_kind split  (db/012, db/013)     │
   │  open_call · awarded · institutional ·   │
   │  programme                               │
   └──────────────────────────────────────────┘
          │  allowlist: open_call only
          ▼
   431 open calls  ──▶  data service (Supabase + cache)  ──▶  portal
```

### Why each stage exists

**The registry.** `sources.config` is JSONB whose shape depends on `kind`, so a
WordPress source, an RSS feed and a POST JSON API are all rows in one table
rather than three code paths. Adding a source of an existing shape is an
`INSERT`. This is the property the whole design protects.

**The landing zone.** `raw_items` keeps the verbatim source payload. When a
parser or a filter changes, it is re-run over stored rows — 15 sources are not
re-crawled. Cheaper, and the polite thing to do.

**The honest filter.** Four of the sources are registers of money *already
granted* (`nsf_awards`, `nih_reporter`, `openaire`, `cordis`), one publishes
mechanisms whose applicant is a university rather than a student
(`grants_gov`), and one is a fee-paying course catalogue (`daad_programmes`).
All are real data and all are collected. None is something a student can apply
to, so `record_kind` keeps them out of the student view — and the headline
number is 431 rather than 2,274 because of it. The measured before/after is in
[docs/sources.md](docs/sources.md) § Audience fit.

**Audience fit.** The finder serves a campus where ~99% of students are Indian
nationals. One high-volume aggregator was Africa-targeted — 46% of the corpus
and the wrong 46% — and is disabled. Roundup listicles and nationality-locked
listings are rejected at ingest.

**Invariants every run keeps.** Idempotent (every write is an upsert on a
conflict target, so a re-run repairs a partial run instead of duplicating it);
polite (throttled detail fetches, a real User-Agent, never parallel-hammering
one host); fail-soft (one dead source cannot abort the run for the other
fifteen); observable (every run writes `run_log`); registry-driven (a hostname
belongs in a table, not in a node).

### Sources currently publishing into the index

| Source | Shape | Tier | Open calls |
| --- | --- | --- | --- |
| Opportunities Circle | `wp_rest` | 3 | 215 |
| Scholars4Dev | `wp_rest` | 3 | 182 |
| UKRI Opportunities | `rss` | 1 | 22 |
| NSF Funding (upcoming) | `rss` | 1 | 8 |
| Commonwealth Scholarships (CSC UK) | `rss` | 2 | 2 |
| Marie Skłodowska-Curie Actions | `rss` | 1 | 2 |

Collected but deliberately outside the student view: `grants_gov`,
`nih_reporter`, `nsf_awards`, `openaire`, `cordis`, `daad_programmes`.
Enabled as a standing watch with zero current yield: `erc`, `erasmus_plus` —
[and why that is the correct outcome](CONTEXT.md) (§13.10).

`findaphd.com` is **excluded on terms-of-service grounds.** It is the obvious
source for this problem and it is not used.

---

## Software and languages

| Layer | Technology | Why |
| --- | --- | --- |
| Frontend | **Next.js 16.3.8**, React 19.2, TypeScript 5.9, CSS Modules | App Router; no component framework, so the design tokens are the system |
| Data service | **Next.js** route handlers, deployed separately | Holds the Supabase **service** key, which must never reach a browser bundle |
| Shared code | **TypeScript** (`packages/core`, `packages/server`) | npm workspaces, so both deployments import one projection, one scorer, one query validator |
| Database | **Supabase** — Postgres 15, Auth, Storage | Row-level security is the access control; generated `tsvector` + trigram indexes for search |
| Scraper | **n8n 2.33.7** (self-hosted, Docker), code nodes in **JavaScript** | One workflow, 31 nodes, registry-driven |
| Workflow build | **Python 3** (`n8n/build.py`) | Workflow JSON is **generated**, never hand-edited; `--check` fails CI on drift |
| PDF extraction | **pdfjs-dist 4.10** | Runs in the browser — a student's CV is never uploaded to read it |
| Tests | **Node test scripts** (`node:assert`) | No framework; live fixtures and real PDFs |
| Hosting | **Vercel** (two projects), Supabase cloud | |

### Code by language

| Language | Lines | Files | Where |
| --- | --: | --: | --- |
| TypeScript (`.tsx`) | 9,468 | 52 | React components and screens |
| TypeScript (`.ts`) | 5,207 | 55 | shared logic, libraries, route handlers |
| CSS | 5,210 | 29 | design tokens and CSS Modules |
| Markdown | 2,607 | 15 | architecture, sources, context, handover |
| SQL | 1,564 | 20 | append-only migrations |
| JavaScript (`.mjs`) | 1,283 | 10 | tests, local harness, data build |
| JavaScript (`.js`) | 1,176 | 7 | n8n code nodes and the shared parsing library |
| Python | 627 | 2 | workflow generator and seed export |
| Shell | 255 | 5 | migrations, source probes, workflow import |

Generated artefacts (`n8n/workflows/*.json`, `supabase/migrations/`) are
excluded from the counts — they are outputs, not source.

---

## Reviewing this project

Start here, in this order:

| Read | For |
| --- | --- |
| **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** | **System diagram, the full n8n node graph, and the database schema — including which parts are live and which are not.** |
| [docs/sources.md](docs/sources.md) | Every source with probe evidence, and why the rejected ones were rejected |
| [CONTEXT.md](CONTEXT.md) | The working brief: conventions, non-obvious facts about the sources, and the bugs that only appeared when it was actually run |
| [HANDOVER.md](HANDOVER.md) | An unvarnished list of what is built and what is not |

### The parts worth looking at

| | Where |
| --- | --- |
| Workflow graph, generated not hand-drawn | `n8n/build.py`, `n8n/src/code/` |
| Shared HTML and date parsing, injected into every normaliser | `n8n/src/code/_lib_html.js` |
| The match scorer and its weights | `packages/core/src/match.ts` |
| The projection from raw rows to cards | `packages/core/src/project.ts` |
| The CV extractor, and why reach decides what is offered | `packages/core/src/dossier.ts` |
| Row-level security and the document bucket | `db/015_student_accounts.sql` |
| Interest counts a client cannot forge | `db/017_interest.sql` |
| Why the index is 431 and not 2,274 | `db/012_audience_fit.sql`, `db/013_record_kind_split.sql` |
| Reviewer access, and what it deliberately does not do | `web/lib/demo.ts` |
| Caching and the Supabase reads | `packages/server/src/source.ts` |

Every migration and most modules open with a comment explaining **why** the
thing is shaped that way — including the alternatives that were tried and
rejected. That is the fastest way to read this repository.

---

## Running it

Requires Node 20+, Python 3, and a Supabase project.

```bash
npm install
cp .env.example .env                       # SUPABASE_URL, SUPABASE_SERVICE_KEY
cp web/.env.local.example web/.env.local   # NEXT_PUBLIC_SUPABASE_URL + ANON_KEY
cp api/.env.local.example api/.env.local

# schema
./scripts/sync-supabase-migrations.sh
supabase db push --linked                  # or paste db/*.sql into the SQL editor

npm run dev          # frontend on :3100
npm run dev:api      # data service on :3101  (second terminal)
```

### Verify loop

Everything below must pass. **“Run it before claiming it works”** is the rule
this project is built on — structural validation is not execution, and
[CONTEXT.md §13](CONTEXT.md) is a list of eleven bugs that passed every
structural check and only appeared when the pipeline was actually run.

```bash
npm run typecheck                          # all four workspaces
npm run build                              # both deployments
node tests/parse.test.mjs                  # parser unit + live-fixture tests
node tests/normalize.test.mjs              # normalisers vs cached API payloads
node tests/dossier.test.mjs                # CV extraction, against a real PDF
node tests/interest.test.mjs               # interest thresholds
python3 n8n/build.py --check               # generated workflow matches source
./scripts/probe-sources.sh                 # every source endpoint reachable
./scripts/sync-supabase-migrations.sh --check
```

### Working on the pipeline

```bash
node scripts/scrape-local.mjs              # run the real code nodes against live
                                           # sources, with no n8n and no Supabase
python3 n8n/build.py                       # regenerate the workflow JSON
./scripts/n8n-import.sh                    # import it into a local n8n
node scripts/build-ui-data.mjs             # rebuild the finder's data file
```

**Never hand-edit `n8n/workflows/*.json`.** They are generated. Edit
`n8n/src/code/*.js` or the graph in `n8n/build.py`, then rebuild.
**Migrations are append-only** — add `db/0NN_*.sql`, never edit an applied one.

---

## Deployment

Two Vercel projects from one repo, because the service key must never reach a
browser bundle:

| Project | Root | Holds |
| --- | --- | --- |
| `orbit` | `web/` | the frontend. Supabase **anon** key only |
| `orbit-api` | `api/` | the data service. Supabase **service** key |

`web` is pointed at `api` with `NEXT_PUBLIC_API_BASE`. The scraper runs on
self-hosted n8n on its own nightly cron, independent of both. See
[DEPLOY.md](DEPLOY.md) for the environment variables each project needs.

**Reviewer access is a deployment switch.** `NEXT_PUBLIC_DEMO_MODE=1` on the
judging deployment renders the bypass. Unset — as in a student build — it is
inert: the flag is checked on every path into demo mode, not just on the
button, so there is no sequence of client-side actions that enables it. It
gates rendering and activation rather than bundling; the copy is still in the
bundle, which `web/lib/demo.ts` says plainly rather than overclaiming.

---

## Layout

```
packages/core     isomorphic: types, projection, query validation, seeded
                  ordering, the match scorer, the CV extractor
packages/server   server-only: Supabase reads, caching, rate limiting,
                  the API route handlers
web/              Next 16 App Router frontend
api/              the same handlers as a standalone deployment
n8n/              workflow source; build.py generates workflows/
db/               append-only migrations
supabase/         generated mirror of db/ for the Supabase CLI
tests/            executable checks, including real-PDF fixtures
docs/             architecture, sources, roadmap, the opportunity landscape
scripts/          migrations, source probes, local scrape harness, data build
```

---

## What is deliberately not here

Stated plainly, because a reviewer should not have to discover it:

- **`findaphd.com` is excluded on terms-of-service grounds.** The obvious
  source for this problem, and it is not used.
- **The matcher is not trained.** No labelled outcome data exists in this
  project, so there is nothing to train on or validate against. It is a
  transparent weighted scorer whose weights are in one table you can argue
  with.
- **No OCR.** A PDF's text layer is exact; OCR guesses. A scan is reported as a
  scan rather than run through a guesser whose mistakes would be shown back as
  findings.
- **There is no classifier.** `opportunities`, `classifications`, `matches` and
  `digest_log` are migrated and empty; the portal reads `raw_items`. So
  `fields_of_study` is unpopulated and subject matching works off title and
  summary text, which is weaker than it looks. The design, the cost and the
  reason it was cut are in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) §3.4.
- **India, UAE and Gulf sources are absent.** For this audience that is a real
  gap. Those bodies publish HTML only, with no feed or API, so they need a
  fifth ingester shape or staff curation through the college desk.
- **Not built:** email and push notifications, the chatbot, public comments,
  historical round data, click-through analytics. See
  [HANDOVER.md](HANDOVER.md).
