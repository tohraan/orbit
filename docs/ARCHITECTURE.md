# Architecture

How Orbit is put together, what runs where, and which parts of the schema are
live. Written for someone reviewing the project in half an hour.

A note on honesty before the diagrams: the database contains a normalisation
layer (`opportunities`, `classifications`, `matches`, `digest_log`) that is
**designed and migrated but not populated**. The portal reads `raw_items`
directly. That is marked throughout rather than drawn as if it were running,
because an architecture diagram that shows unbuilt things is a diagram you
cannot trust for the built ones.

---

## 1. The whole system

```
                         ┌───────────────────────────────┐
   16 public sources     │   n8n  ·  W01 Scrape          │     every day 02:00
   WordPress REST        │   (self-hosted, Docker)       │     or on demand
   RSS / Atom       ────▶│                               │
   JSON APIs             │   fetch → normalise → upsert  │
   POST APIs             └───────────────┬───────────────┘
                                         │  PostgREST, idempotent upsert
                                         ▼
                         ┌───────────────────────────────┐
                         │   Supabase (Postgres)         │
                         │                               │
                         │   sources      16 rows        │  the registry
                         │   raw_items  2 274 rows       │  ◀── the live table
                         │   run_log                     │  observability
                         │   students / saved / tracker  │  accounts, RLS
                         │   student_documents           │  the Dossier
                         │   opportunity_interest        │  aggregate counts
                         └───────────────┬───────────────┘
                                         │  service key, server-side only
                                         ▼
                         ┌───────────────────────────────┐
                         │   api/   (Vercel, Node)       │
                         │   /api/opportunities  /feed   │
                         │   /facets  /stats  /admin     │
                         │   in-process cache + SWR      │
                         └───────────────┬───────────────┘
                                         │  JSON over HTTPS
                                         ▼
                         ┌───────────────────────────────┐
                         │   web/   (Vercel, Next 16)    │
                         │   Explore · Deadlines · Home  │
                         │   Dossier · Compare · Admin   │
                         └───────────────────────────────┘
                                         ▲
                                         │  Supabase Auth + RLS, direct
                         ┌───────────────┴───────────────┐
                         │   the student's browser       │
                         │   session, saved list,        │
                         │   documents, PDF parsing      │
                         └───────────────────────────────┘
```

### Why the API is a separate deployment

`web` and `api` are two Vercel projects sharing one monorepo. The split exists
so the service key never reaches a bundle that ships to a browser: everything
under `packages/server` is marked `server-only`, and the only credential the
frontend holds is the Supabase **anon** key, which is public by design and safe
only because row-level security is the real access control.

### What talks to Supabase directly

Two different clients, with two different keys, for two different jobs:

| Caller | Key | Reaches | Guarded by |
| --- | --- | --- | --- |
| `api/` (server) | service | `raw_items`, `sources`, `opportunity_interest` | never leaves the server |
| browser | anon | `students`, `student_saved`, `student_tracker`, `student_documents`, storage | row-level security on `auth.uid()` |

A student's saved list is written by their own browser, not proxied through the
API. That is safe because every one of those tables has an RLS policy keyed to
`auth.uid()`, so a forged request with the public anon key still cannot read
another student's row.

---

## 2. The n8n workflow

One workflow, `W01 · Scrape Opportunities`, 31 nodes. It is **generated**, not
hand-drawn: `python3 n8n/build.py` assembles `n8n/workflows/W01_*.json` from the
JavaScript in `n8n/src/code/`. `--check` fails on drift. Never edit the JSON.

```
  Every Day 02:00 ─┐
                   ├─▶ Get Enabled Sources ─▶ Loop Sources ─┬─▶ Log Run ─▶ (detail pass, below)
  Run Manually ────┘      (GET sources)       (batches of 1) │
                                                             ▼
                                                      Route By Kind
                                                             │
         ┌────────────────┬──────────────────┬───────────────┴────────┐
         │ wp_rest        │ rss              │ json_api / post_api    │
         ▼                ▼                  ▼                        │
   Build Probe URL   Expand Feed URLs   Plan API Requests             │
         ▼                ▼                  ▼                        │
   Probe Total Pages   Read Feed          Is POST? ─┬─▶ Call POST API │
         ▼                ▼                         └─▶ Call GET API  │
   Plan Pages        Normalize RSS                      ▼             │
         ▼                │                         Normalize API     │
   Fetch WP Page          │                             │             │
         ▼                │                             │             │
   Normalize WP ──────────┴─────────────────────────────┘             │
                                  ▼                                   │
                             Any Rows? ──no──▶ Source Done ◀──────────┘
                                  │ yes              │
                            Dedupe Batch             ▼
                                  ▼            Mark Source OK ─▶ (next source)
                           Upsert Raw Items ─────────┘

  ── detail pass ──────────────────────────────────────────────────────
  Get Detail Queue ─▶ Loop Detail Queue ─┬─▶ Scrape Complete
                              ▲          │
                              │          └─▶ Fetch Detail Page
                              │                     ▼
                         Throttle 2s ◀── Save Detail ◀── Parse Detail
```

### The four source kinds

`Route By Kind` is the reason adding a source is an `INSERT` and not a new
workflow. Each branch knows how to talk to one *shape* of endpoint; which
hostnames it talks to comes from the `sources` table at runtime.

| Kind | How it is fetched | Pagination |
| --- | --- | --- |
| `wp_rest` | WordPress REST `/wp-json/wp/v2/...` | probes `X-WP-TotalPages`, then plans one request per page |
| `rss` | RSS/Atom via the feed reader | feed URLs expanded from config |
| `json_api` | GET with query params | planned up front from config |
| `post_api` | POST with a JSON body | same planner, `Is POST?` picks the verb |

All four converge on one normaliser output shape, so everything downstream —
dedupe, upsert, the detail pass — is written once.

### Shared parsing

Any code node whose header comment contains a line that is exactly `* LIB` gets
`n8n/src/code/_lib_html.js` injected at build time. That is where HTML
stripping, date parsing, amount extraction and deadline inference live, so the
six normalisers cannot drift apart in how they read a date.

### Idempotency

Every write is `POST …?on_conflict=<cols>` with
`Prefer: resolution=merge-duplicates`. The workflow can be re-run at any time —
after a failure, or twice by accident — without duplicating a row. `Dedupe
Batch` removes duplicates *within* a batch first, because `on_conflict` cannot
resolve two conflicting rows in the same request.

### The detail pass

The listing endpoints give a title, a URL and a date. The eligibility,
benefits, documents and how-to-apply prose only exists on the listing's own
page, so a second pass walks a queue of rows that have no `detail` yet, fetches
each page and parses it. `Throttle 2s` between fetches is deliberate: the
sources are public, often small, and being polite to them is a condition of
being allowed to read them at all.

> `findaphd.com` is deliberately excluded on terms-of-service grounds. It is the
> obvious source for this problem and it is not used. See `docs/sources.md`.

---

## 3. The database

20 tables and views. They fall into four groups, and only three of them are
live.

### 3.1 The pipeline — live

```
  sources ──────────────┐
  16 rows               │ source_slug
  slug, kind, config,   │
  authority_tier,       ▼
  enabled, record_kind  raw_items ── 2 274 rows
                        id, source_slug, url, payload jsonb,
                        detail jsonb, deadline, deadline_kind,
                        first_seen_at, fingerprint
                              │
                              │ written by every run
                              ▼
                        run_log
                        per-source timing, counts, errors
```

`sources` is the registry and the reason the pipeline is configuration-driven.
A row carries the hostname, the kind, a JSON config, an authority tier (1 =
the funder itself, 3 = an aggregator) and a `record_kind` that decides whether
its rows are shown to students at all.

`raw_items` is **the table the portal reads.** `payload` holds the normalised
listing; `detail` holds whatever the detail pass found. Keeping the source's
own shape in jsonb rather than forcing it into columns is what let the
projection change five times without a migration.

### 3.2 Student accounts — live, RLS throughout

```
  auth.users (Supabase Auth)
       │ 1
       │                       ┌── student_saved      (student_id, opportunity_id)
       ▼ 1                     │
  students ───────────────┬────┼── student_tracker    (+ status, updated_at)
  id = auth.users.id      │    │
  email, full_name,       │    └── student_documents  (the Dossier)
  degree, branch, year,   │            file_path, kind, parse_status,
  level, funding,         │            extracted jsonb, applied jsonb
  fields, countries,      │
  share_interest ─────────┘  consent, read by the interest triggers
```

Every one of those tables has the same policy:

```sql
create policy <t>_own on <t> for all
  using (auth.uid() = student_id) with check (auth.uid() = student_id);
```

Documents live in a **private** Storage bucket where the object's first path
segment must equal the owner's id:

```sql
(storage.foldername(name))[1] = auth.uid()::text
```

`extracted` and `applied` are two columns on purpose. Parsing a CV produces a
*claim*; only what the student confirms reaches their profile. One is evidence,
the other is consent, and keeping them apart is what makes "we read your CV" an
offer rather than a surprise.

**Who may have an account at all** is a separate question from what an account
may read, and it is enforced separately. `db/019` puts a `BEFORE INSERT` trigger
on `auth.users` that refuses any address outside `@dubai.bits-pilani.ac.in`:

```sql
create trigger on_auth_user_campus_check before insert on auth.users
  for each row execute function enforce_campus_email();
```

It is there because the two checks that came before it did not hold. The
browser's `isCampusEmail` can be skipped by posting straight to
`/auth/v1/signup` with the anon key, which ships in the bundle; and the
confirmation email — the second layer, on the theory that a non-campus address
never receives one — stopped existing when confirmations were turned off so
that reviewers could sign up without waiting on mail that Supabase's built-in
SMTP only delivers to organisation members anyway. The trigger is the version
every path goes through.

Two things it is *not*. It is not the data-access boundary: RLS above is, and
it does not care which domain anyone signed up from. And it is not a claim that
the person is a student — it is a claim that they can receive mail at the
campus domain, which is as far as an email check can go.

Password length is likewise enforced on both sides: the form asks for 8, and
`[auth] minimum_password_length = 8` in `supabase/config.toml` makes the server
agree. It accepted 6 until that was set, so the form's rule was advisory too.

### 3.3 Interest counts — live

```
  student_saved ──┐  AFTER INSERT/DELETE trigger
                  ├──▶ bump_interest()  SECURITY DEFINER
  student_tracker ┘          │
                             ▼
                    opportunity_interest
                    opportunity_id, saved_count, tracked_count
                    SELECT: public      WRITE: nobody
```

This table exists because `student_saved` is RLS'd to its owner, so
`count(*)` from a browser returns 1 or 0 however many students saved a listing
— and relaxing that policy to make counting work would expose *who* saved
what. Totals are maintained by `SECURITY DEFINER` triggers instead: identities
stay sealed, the aggregate is public, and nothing client-side can write it.
A count the browser reports is a count the browser can invent.

### 3.4 The normalisation layer — migrated, NOT populated

`opportunities` (37 columns), `classifications`, `matches`, `digest_log`,
`opportunity_sources`, `student_profiles`, `taxonomy_fields`, and the views
`v_portal_feed`, `v_closing_soon`, `v_review_queue`, `v_source_health`.

These are the design for a classified, deduplicated opportunity record with an
LLM classification audit trail and per-student match storage. **`opportunities`
currently holds 0 rows.** The portal projects straight from `raw_items` in
`packages/server/src/project.ts`, and the matcher scores in the browser.

They are left in place because the migrations are append-only and the design is
the intended direction, not because anything reads them. A reviewer should
treat §3.1–3.3 as the system and this section as the roadmap.

### Migrations

`db/*.sql`, numbered, append-only, each one idempotent — `000`–`019` at the
time of writing. `001`–`003` are never
edited. From `016` onward they are also mirrored into `supabase/migrations/`
by `scripts/sync-supabase-migrations.sh` and applied with
`supabase db push --linked`; the mirror deliberately starts at `016` because
`000`–`015` predate the CLI and are absent from the remote history, so
generating them would make `db push` re-run `003_seed.sql`.

---

## 4. The frontend

```
  packages/core     isomorphic — types, projection, query validation,
                    seeded ordering, the match scorer, the Dossier extractor
  packages/server   server-only — Supabase reads, caching, rate limits,
                    the API route handlers
  web/              Next 16 App Router, CSS Modules, nonce-based CSP
  api/              the same handlers, mounted as a standalone deployment
```

Three things worth knowing before reading the code:

**The CSP is nonce-based with `strict-dynamic`.** Next reads the nonce from the
*request* header, not the response, so `proxy.ts` sets it on both. `connect-src`
must name the Supabase origin or sign-in silently fails, and `worker-src` must
be set or the Dossier's PDF parsing silently fails — `strict-dynamic` makes the
browser ignore `script-src 'self'` for workers.

**The index is cached in-process with stale-while-revalidate**, keyed by a
`Symbol.for` on `globalThis` because instrumentation and route handlers are
separate module instances with separate module state. Interest counts are a
second, shorter cache: the index turns over when a scrape runs, the counts
whenever anyone saves anything.

**The matcher is explainable, not trained.** There is no labelled outcome data
in this project, so there is nothing to train on and nothing to validate
against. `packages/core/src/match.ts` publishes its weights, and every screen
that shows a score shows the reasons that produced it.
