#!/usr/bin/env bash
# Generate supabase/migrations/ from db/*.sql.
#
# db/ stays canonical (CLAUDE.md: append-only, numbered). The Supabase CLI
# insists on its own directory and its own <timestamp>_<name>.sql names, so
# that directory is GENERATED rather than hand-maintained — two hand-edited
# copies of a migration is how a schema and its history diverge.
#
# IT STARTS AT 016, NOT 000, AND THAT IS DELIBERATE.
#
# db/000–015 were applied before the CLI was used here, so they are not in the
# remote migration history. Generating files for them would make `db push`
# consider all sixteen "new" and re-run them — including 003_seed.sql, which
# reseeds the source registry. The CLI took over at 016; everything before it
# is history that db/ records and the CLI must not touch.
#
# The version is YYYYMMDDHHMMSS with the migration number in the seconds
# field, so the CLI's lexical order matches db/'s numeric order and the names
# match what was already pushed.
#
#   ./scripts/sync-supabase-migrations.sh           regenerate
#   ./scripts/sync-supabase-migrations.sh --check   fail on drift
set -euo pipefail
cd "$(dirname "$0")/.."

OUT=supabase/migrations
FIRST=16                     # the migration the CLI took over at
PREFIX=20261003              # the date it did
CHECK=${1:-}
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

for f in db/[0-9][0-9][0-9]_*.sql; do
  n=$(basename "$f"); num=${n%%_*}; rest=${n#*_}
  [ "$((10#$num))" -ge "$FIRST" ] || continue
  cp "$f" "$TMP/${PREFIX}0000$(printf '%02d' "$((10#$num))")_${rest}"
done

if [ "$CHECK" = "--check" ]; then
  if diff -rq "$TMP" "$OUT" >/dev/null 2>&1; then
    echo "supabase/migrations matches db/ from $FIRST onward ($(ls -1 "$TMP" | wc -l | tr -d ' ') files)"
  else
    echo "DRIFT: run scripts/sync-supabase-migrations.sh" >&2
    diff -rq "$TMP" "$OUT" >&2 || true
    exit 1
  fi
else
  mkdir -p "$OUT"
  rm -f "$OUT"/*.sql
  cp "$TMP"/*.sql "$OUT"/
  echo "wrote $(ls -1 "$OUT" | wc -l | tr -d ' ') files to $OUT (db/$(printf '%03d' $FIRST) onward)"
fi
