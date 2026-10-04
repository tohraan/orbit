# Orbit

**Every research opportunity a BITS Pilani Dubai student can actually apply
to, in one place — with the deadline that matters next.**

Scholarships, fellowships, research internships and grants are scattered across
sixteen public sources, each with its own format, its own idea of a deadline,
and no notion of who is eligible. Orbit collects them on a schedule, normalises
them, strips the ones a student cannot apply to, and presents what is left as
something you can plan against.

Hackathon entry — Research / Academic Administration.

| | |
| --- | --- |
| **Live** | _see Deployment below_ |
| **Index** | 427 open calls from 16 sources · 107 with a published date |
| **Stack** | Next.js 16 · Supabase (Postgres + Auth + Storage) · n8n · Vercel |

---

## What it does

**Collects.** One n8n workflow, scheduled nightly, reads sixteen sources across
four endpoint shapes (WordPress REST, RSS, GET and POST JSON APIs). Adding a
source of an existing shape is an `INSERT`, not code.

**Filters honestly.** Six of the sixteen sources publish *awarded* grants,
institutional mechanisms, or course catalogues — real data that is not an open
call a student can apply to. They are collected and deliberately excluded from
the student view rather than padded into the headline count. Expired listings
are dropped index-wide.

**Ranks explainably.** A published weights table — degree level 34%, field 26%,
funding 18%, country 12%, time to prepare 10% — and every score shows the
reasons that produced it. It is **not** a trained model, and the UI says so.

**Reads your documents, with permission.** The Dossier keeps the files
applications ask for, extracts text from PDFs *in your browser*, and offers
what it found for you to accept or reject. Nothing reaches your profile until
you say yes, and every term shows the sentence it came from plus how many live
listings it would actually reach.

**Plans.** A calendar with per-day density beside a filterable list, so "when
is it busy" and "what closes that day" are one glance apart.

**Advises, in conversation.** Rover — the portal's agent — takes a request in
the words a student would actually use ("a fellowship I can do alongside
college, in the US or Canada"), asks one or two questions to narrow it, then
searches the index through the same filters Explore uses and answers in the
portal's own opportunity cards. Chat is the interface; the index stays the
source of truth. It states facts only from a tool result, so a card it shows
is a listing that is open right now, and it says plainly when the index cannot
express a constraint — weekly hours and selectivity are not recorded anywhere,
and it will tell you so rather than invent them. Optional: with no Anthropic
key the screen says it is switched off and nothing else changes.

---

## Reviewing this project

Start here, in this order:

| Read | For |
| --- | --- |
| **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** | **System diagram, the full n8n node graph, and the database schema — including which parts are live and which are not.** |
| [docs/sources.md](docs/sources.md) | Every source with probe evidence, and why the rejected ones were rejected |
| [CONTEXT.md](CONTEXT.md) | The working brief: conventions, non-obvious facts about the sources, and what is not yet built |
| [HANDOVER.md](HANDOVER.md) | An unvarnished list of what is built and what is not |

### The parts worth looking at

| | Where |
| --- | --- |
| Workflow graph, generated not hand-drawn | `n8n/build.py`, `n8n/src/code/` |
| Shared HTML and date parsing, injected into every normaliser | `n8n/src/code/_lib_html.js` |
| Schema, append-only | `db/*.sql` |
| Row-level security and the document bucket | `db/015_student_accounts.sql` |
| Interest counts that a client cannot forge | `db/017_interest.sql` |
| The projection from raw rows to cards | `packages/core/src/project.ts` |
| The match scorer and its weights | `packages/core/src/match.ts` |
| The CV extractor, and why reach decides what is offered | `packages/core/src/dossier.ts` |
| Caching and the Supabase reads | `packages/server/src/source.ts` |
| Rover's four tools, and what stops it inventing a listing | `packages/server/src/rover/tools.ts` |
| What Rover is allowed to do, and the cached half of its prompt | `packages/server/src/rover/prompt.ts` |
| The agent loop, and why it is manual rather than the SDK's runner | `packages/server/src/rover/agent.ts` |

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

Everything below must pass. "Run it before claiming it works" is the rule this
project is built on.

```bash
npm run typecheck                          # all four workspaces
npm run build                              # both deployments
node tests/parse.test.mjs                  # parser unit + live-fixture tests
node tests/dossier.test.mjs                # CV extraction, against a real PDF
node tests/interest.test.mjs               # interest thresholds
node --conditions react-server --import ./scripts/ts-resolve.mjs \
  tests/rover.test.mjs                     # Rover's tools, against the real index
node --conditions react-server --import ./scripts/ts-resolve.mjs \
  tests/rover-loop.test.mjs                # Rover's agent loop, against a fake Messages API
python3 n8n/build.py --check               # generated workflow matches source
./scripts/probe-sources.sh                 # all 16 source endpoints reachable
./scripts/sync-supabase-migrations.sh --check
```

### Working on the pipeline

```bash
python3 n8n/build.py                       # regenerate the workflow JSON
./scripts/n8n-import.sh                    # import it into a local n8n
```

**Never hand-edit `n8n/workflows/*.json`.** They are generated. Edit
`n8n/src/code/*.js` or the graph in `n8n/build.py`.

---

## Deployment

Two Vercel projects from one repo, because the service key must never reach a
browser bundle:

| Project | Root | Holds |
| --- | --- | --- |
| `orbit` | `web/` | the frontend. Supabase **anon** key only |
| `orbit-api` | `api/` | the data service. Supabase **service** key |

`web` is pointed at `api` with `NEXT_PUBLIC_API_BASE`. See
[DEPLOY.md](DEPLOY.md) for the environment variables each one needs.

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
docs/             architecture, sources, roadmap
scripts/          migrations, source probes, workflow import
```

---

## What is deliberately not here

Stated plainly, because a reviewer should not have to discover it:

- **`findaphd.com` is excluded on terms-of-service grounds.** It is the obvious
  source for this problem and it is not used.
- **The matcher is not trained.** No labelled outcome data exists in this
  project, so there is nothing to train on or validate against.
- **No OCR.** A PDF's text layer is exact; OCR guesses. A scan is reported as a
  scan rather than run through a guesser whose mistakes would be shown back as
  findings.
- **The normalisation layer is designed, not populated.** `opportunities`,
  `classifications`, `matches` and `digest_log` are migrated and empty; the
  portal reads `raw_items`. See ARCHITECTURE §3.4.
- **Not built:** email and push notifications, the chatbot, public comments,
  historical round data, click-through analytics. See
  [HANDOVER.md](HANDOVER.md).
