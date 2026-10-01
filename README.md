# Research Opportunity Aggregation & Discovery Platform

Automated discovery, classification and freshness-tracking of research
opportunities — scholarships, fellowships, research internships, grants — from
16 public sources, feeding an existing university web portal.

Hackathon entry for the Research / Academic Administration problem statement.

## Start here

| File | What it is |
| --- | --- |
| **[CONTEXT.md](CONTEXT.md)** | **The brief. Read this first, in full.** Architecture, verified sources, credentials, conventions, and what is not yet built. |
| [PROMPT.md](PROMPT.md) | Kickoff prompt for a fresh Claude Code session, plus the three secrets to have ready. |
| [docs/roadmap.md](docs/roadmap.md) | Phased plan, each phase with an exit test. |
| [docs/sources.md](docs/sources.md) | Every source with probe evidence, and why the rejected ones were rejected. |

## Layout

```
db/                 001 schema · 002 views · 003 seed (append-only migrations)
n8n/
  build.py          generates workflows/*.json from src/  — the only way to edit them
  src/code/*.js     code nodes; _lib_html.js is the shared parsing library
  workflows/*.json  GENERATED — never hand-edit
scripts/
  probe-sources.sh  re-verify all 15 endpoints (non-zero exit if tier 1 is down)
  n8n-import.sh     push workflows to n8n, matched by name (needs N8N_API_KEY)
tests/parse.test.mjs  parser unit tests + assertions against cached live pages
```

## Verify

```bash
node tests/parse.test.mjs      # parser tests
python3 n8n/build.py --check   # generated JSON matches source
./scripts/probe-sources.sh     # all 15 endpoints reachable
```

## Pipeline

```
sources (registry) → W02/W04/W05/W06 ingest → raw_items → W03 detail parse
  → W09 classify (Claude, forced tool call) → opportunities
  → W11 freshness sweeper → v_portal_feed → W12 → portal
```

Adding a source of an existing kind is one SQL `INSERT`, not new code.
