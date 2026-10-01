#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
DC=(bash scripts/compose.sh)
BACKUP=$(bash scripts/database-backup.sh)
SCRATCH="flexdocs_drill_$(date +%s)_$$"
CREATED=0
cleanup() {
  if [ "$CREATED" = 1 ]; then "${DC[@]}" exec -T db dropdb -U flexdocs "$SCRATCH"; fi
}
trap cleanup EXIT
"${DC[@]}" exec -T db createdb -U flexdocs "$SCRATCH"
CREATED=1
"${DC[@]}" exec -T db psql -v ON_ERROR_STOP=1 --single-transaction -U flexdocs "$SCRATCH" < "$BACKUP" > /dev/null
"${DC[@]}" exec -T db psql -v ON_ERROR_STOP=1 -U flexdocs "$SCRATCH" -c 'SELECT (SELECT count(*) FROM "Document") AS documents, (SELECT count(*) FROM "DocumentRevision") AS revisions, (SELECT count(*) FROM "Attachment") AS attachments;'
printf 'Restore passed: %s (database only; verify uploaded files and encryption keys separately).\n' "$BACKUP"
