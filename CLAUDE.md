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
- **`supabase/migrations/` is generated, never hand-edited.** `db/` is
  canonical; run `scripts/sync-supabase-migrations.sh` (`--check` fails on
  drift) and apply with `supabase db push --linked`. It starts at `016` on
  purpose: `000`–`015` predate the CLI and are absent from the remote history,
  so generating them would make `db push` re-run them, `003_seed.sql` included.
- **`docs/design-ieee.md` is the UI rulebook, and the code cites it by
  section.** `§14` is the application shell, `§67` one navigation at a time,
  `§101` table rules, `§105` the data-integrity rules, `§115` implementation.
  Read the cited section before changing anything that carries one. It lived
  outside the repo until now, which is exactly how the desk ended up with a top
  tab bar, a 1500px container and `font-weight: 650` — all defensible guesses by
  someone who could not read the rules they were being judged against.
- **Shared UI lives in `packages/ui` (`@rof/ui`), imported by both apps.** The
  rail, buttons, fields, pills, banners, the icon set and the theme toggle are
  one implementation. A second copy in an app is how the two deployments stop
  agreeing what a button is — the same argument `@rof/styles` already settles
  for tokens.
- **Spacing, radius, type and control sizes come off the scale in
  `packages/styles/globals.css`.** An undefined custom property voids its whole
  declaration silently: `var(--space-7)` does not exist (the scale steps
  24 → 32; the legacy `--s-7` is the 28px one), and it cost the desk's sign-in
  card all of its padding. `tests/tokens.test.mjs` fails on any that do not
  resolve.
- **Run it before claiming it works.** Structural validation is not execution.

Verify loop:

```bash
node tests/parse.test.mjs      # parser unit + live-fixture tests
node tests/tokens.test.mjs     # every var() in web/, admin/ and @rof/ui resolves
python3 n8n/build.py --check   # generated JSON matches source
./scripts/probe-sources.sh     # all 15 source endpoints reachable

# The agent chat (Rover). Two flags, both about reaching TypeScript from plain
# node rather than through Next — see scripts/ts-resolve.mjs.
node --conditions react-server --import ./scripts/ts-resolve.mjs tests/rover.test.mjs
node --conditions react-server --import ./scripts/ts-resolve.mjs tests/rover-loop.test.mjs
node --conditions react-server --import ./scripts/ts-resolve.mjs tests/rover-textgate.test.mjs
node --conditions react-server --import ./scripts/ts-resolve.mjs tests/rover-richtext.test.mjs
```
