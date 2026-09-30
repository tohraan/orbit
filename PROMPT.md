# PROMPT.md — kickoff prompt for a fresh Claude Code session

Paste **§1** into a new Claude Code session opened at
`~/research-opportunity-platform`. Everything after it is reference for you, the
human — not for pasting.

---

## §1 — paste this

```
You are taking over an in-progress hackathon project in this directory.

FIRST, before any other action: read CONTEXT.md in full, then docs/sources.md.
CONTEXT.md is the authoritative brief — architecture, verified source list,
credentials, conventions, and an explicit list of what is NOT yet done. It
records hard-won facts about the primary source that you will otherwise waste an
hour rediscovering. Do not start work until you have read it.

Then confirm the ground truth for yourself rather than trusting that the repo is
still accurate:

  node tests/parse.test.mjs          # parser tests (expect all pass)
  python3 n8n/build.py --check       # workflows match source (expect no drift)
  ./scripts/probe-sources.sh         # 16 endpoints (expect all reachable)
  curl -s -o /dev/null -w '%{http_code}\n' http://localhost:5678/healthz   # expect 200

Report anything that disagrees with CONTEXT.md before changing code. Sources rot
and this repo was last verified 2026-09-30.

Then work through the phases in docs/roadmap.md in order, stopping at the end of
each phase to report what you did and what you verified.

Phase 1 is blocked on things only I can do: provide the Supabase service key and
the Anthropic API key, create an n8n API key in the UI, and run the migrations
against Supabase. Ask me for those rather than inventing a way around them.
Two notes on Phase 1 you must not skip:

  * Migrations run in order 000, 001, 002, 003. `scripts/apply-migrations.sh`
    does this (psql if SUPABASE_DB_URL is set, otherwise it copies one
    concatenated file to the clipboard for Supabase Studio).
  * 000 exists because the project's ORIGINAL workflow already created an
    `opportunities` table keyed on `url`. Since 001 uses
    `create table if not exists`, skipping 000 means 001 silently does nothing
    and every later insert fails on a missing `fingerprint` column. If inserts
    fail with a column error, check this first.

Hard rules for this project:

1. NEVER hand-edit n8n/workflows/*.json. They are generated. Edit
   n8n/src/code/*.js or the graph in n8n/build.py, then run python3 n8n/build.py.
   If you find yourself editing generated JSON, you are in the wrong file.
2. Shared HTML/date parsing lives ONLY in n8n/src/code/_lib_html.js. It is
   injected into every code node whose header comment contains a line that is
   just "* LIB". Fix a parser once, not five times.
3. Adding a source whose kind is already supported (wp_rest, rss, json_api,
   post_api) must be an INSERT into `sources`, never a new workflow and never a
   hostname hardcoded in a node. If you feel the urge to hardcode, add a
   config key instead and document it in the DDL comment.
4. Every write to Supabase must be idempotent: POST with ?on_conflict=<cols> and
   Prefer: resolution=merge-duplicates. A re-run must repair a partial run, not
   duplicate it.
5. Every network node stays fail-soft (neverError / onError continue) so one dead
   source cannot abort a run for the other fifteen. Throttle detail fetches.
   Send a real User-Agent. Only publicly accessible sources; honour robots/ToS
   and record the answer in sources.tos_note.
6. Migrations are append-only. Do not edit db/001-003; add db/004_*.sql.
7. Before claiming anything works, run it. "The JSON validates" is not "the
   workflow ran". Show me the actual output — row counts, a sample record, the
   run_log entry. If you could not run something, say so plainly and say why.
8. Add a fixture to tests/fixtures/ and an assertion whenever you teach the
   parser a new page shape, so the next change cannot silently regress an old
   source.
9. Do not add dependencies, frameworks, or a web app. The stack is n8n +
   Postgres + shell/python builders, deliberately.
10. When a design decision is genuinely ambiguous (scoring weights, which
    region's sources to prioritise), state your recommendation and proceed —
    do not stall — but flag it in your report.

Start by reading CONTEXT.md.
```

---

## §2 — the phases, in priority order

These live in `docs/roadmap.md` so the session can read them; summarised here.

| Phase | Goal | Blocked on |
| --- | --- | --- |
| 1 | Apply schema; import workflows; make one source work end to end | Supabase service key, Anthropic key, n8n API key |
| 2 | Turn on all 16 sources; backfill; get the review queue small | phase 1 |
| 3 | W13 student matching + digest | phase 2 |
| 4 | Admin review UI for `v_review_queue` | phase 2 |
| 5 | Real portal integration (RLS + anon role on the views) | phase 2 |
| 6 | Regional coverage: India / UAE sources, `kind: html` ingester | decision in CONTEXT.md §11 |

## §3 — the three secrets to have ready

1. **Supabase service-role key** — project `pcctpzvhakdutzzwpmsh`, Settings → API.
   Goes into `.env` as `SUPABASE_SERVICE_KEY`. The n8n side already has it inside
   the `Header Auth account` credential.
2. **Anthropic API key** — for the `W09` classifier. In n8n: create an HTTP
   Header Auth credential named `Anthropic API (x-api-key)`, header `x-api-key`,
   then paste its credential id into `CRED_ANTHROPIC` in `n8n/build.py` and
   rebuild.
3. **n8n API key** — n8n UI → Settings → n8n API → create. Into `.env` as
   `N8N_API_KEY`. Without it `scripts/n8n-import.sh` cannot run.

## §4 — how to tell the session is doing well

Good signs: it read CONTEXT.md before touching anything; it re-probed instead of
trusting the repo; it reported a real row count from a real run; it pushed back
when a phase was blocked rather than faking progress.

Bad signs: editing `n8n/workflows/*.json` directly; a new workflow for a source
that fits an existing `kind`; "should work now" without output; re-deriving the
opportunitiescircle facts from scratch (it did not read §6).
