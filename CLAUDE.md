# Project instructions

**Read `CONTEXT.md` in full before doing anything in this repo.** It is the
authoritative brief: architecture, the verified source registry, credentials,
conventions, and an explicit list of what is not yet built. It also records
non-obvious facts about the primary source (CONTEXT.md §6) that are expensive to
rediscover.

Non-negotiables:

- **Never hand-edit `n8n/workflows/*.json`.** They are generated. Edit
  `n8n/src/code/*.js` or the graph in `n8n/build.py`, then run
  `python3 n8n/build.py`. `--check` fails on drift.
- **Shared HTML/date parsing lives only in `n8n/src/code/_lib_html.js`**, injected
  into any code node whose header comment contains a line that is just `* LIB`.
- **Adding a source of an existing kind** (`wp_rest`, `rss`, `json_api`,
  `post_api`) **is an `INSERT` into `sources`** — never a new workflow, never a
  hostname hardcoded in a node.
- **Supabase writes are idempotent**: `POST …?on_conflict=<cols>` with
  `Prefer: resolution=merge-duplicates`.
- **Migrations are append-only.** Add `db/004_*.sql`; never edit `001`–`003`.
- **Run it before claiming it works.** Structural validation is not execution.

Verify loop:

```bash
node tests/parse.test.mjs      # parser unit + live-fixture tests
python3 n8n/build.py --check   # generated JSON matches source
./scripts/probe-sources.sh     # all 16 source endpoints reachable
```
