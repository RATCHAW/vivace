#!/usr/bin/env bash
#
# Guards the Drizzle migration history against the two things a pull request can
# do to it that no test would catch.
#
#   1. Adding more than one migration. They are applied at boot, in order, by
#      the container that is about to start serving (apps/api/src/db/migrate.ts).
#      One file per pull request keeps that a reviewable change and keeps a
#      rollback to "revert the commit" rather than "work out which half applied".
#
#   2. Editing or deleting a migration that has already run. Drizzle records a
#      sha256 of each file in drizzle.__drizzle_migrations and decides what to
#      apply from the journal's `when`, so a rewritten file is never re-applied —
#      production keeps the old schema while the repository claims the new one,
#      and nothing anywhere reports a problem. 0000_init is the sharpest case:
#      its hash is the row that says the production database was adopted rather
#      than built.
#
# Usage: check-new-migrations.sh <base-sha> <head-sha>
set -euo pipefail

BASE=${1:?usage: check-new-migrations.sh <base-sha> <head-sha>}
HEAD=${2:?usage: check-new-migrations.sh <base-sha> <head-sha>}

readonly DIR="apps/api/drizzle"
readonly LIMIT=1

# `--diff-filter` splits the change by what happened to the file: A added, M
# modified, D deleted, R renamed. A rename is a delete and an add to Drizzle,
# which matches on the filename in the journal.
changed() {
  git diff --name-only --diff-filter="$1" "$BASE" "$HEAD" -- "$DIR/*.sql"
}

added=$(changed A)
touched=$(changed MDR)

fail=0

if [ -n "$touched" ]; then
  echo "::error::A migration that may already have been applied was changed or removed."
  while IFS= read -r file; do
    [ -n "$file" ] && echo "  $file"
  done <<<"$touched"
  echo "Migrations are append-only: any database that already ran one will never run it"
  echo "again, so it keeps the old schema while this repository describes the new one."
  echo "Put the change in a new migration (pnpm db:generate) instead."
  fail=1
fi

count=$(printf '%s' "$added" | grep -c . || true)

if [ "$count" -gt "$LIMIT" ]; then
  echo "::error::$count new migrations in one pull request; the limit is $LIMIT."
  while IFS= read -r file; do
    [ -n "$file" ] && echo "  $file"
  done <<<"$added"
  echo "Squash them into one: delete the generated files, revert meta/_journal.json"
  echo "and meta/*_snapshot.json to origin/main, then run pnpm db:generate once."
  fail=1
fi

[ "$fail" -eq 0 ] || exit 1

if [ "$count" -eq 0 ]; then
  echo "No new migrations."
else
  echo "One new migration: $added"
fi
