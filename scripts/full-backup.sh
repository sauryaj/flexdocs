#!/usr/bin/env bash
set -euo pipefail
umask 077
cd "$(dirname "$0")/.."

BACKUP_ROOT="${BACKUP_ROOT:-backups/full}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DEST="$BACKUP_ROOT/flexdocs-$STAMP"
PARTIAL="$DEST.partial"
APP_WAS_RUNNING=0

cleanup() {
  status=$?
  if [ "$APP_WAS_RUNNING" = 1 ]; then
    bash scripts/compose.sh up -d --no-deps app >/dev/null || true
  fi
  if [ "$status" -ne 0 ] && [ -d "$PARTIAL" ]; then
    printf 'Incomplete backup retained for inspection: %s\n' "$PARTIAL" >&2
  fi
  trap - EXIT
  exit "$status"
}
trap cleanup EXIT

mkdir -p "$BACKUP_ROOT"
mkdir "$PARTIAL"

if [ -n "$(bash scripts/compose.sh ps --status running -q app)" ]; then
  APP_WAS_RUNNING=1
  bash scripts/compose.sh stop app
fi

bash scripts/compose.sh exec -T db pg_dump -U flexdocs flexdocs > "$PARTIAL/database.sql"
test -s "$PARTIAL/database.sql"
bash scripts/compose.sh run --rm --no-deps --entrypoint tar app -C /app/uploads -cpf - . > "$PARTIAL/uploads.tar"
test -f "$PARTIAL/uploads.tar"
install -m 600 .env "$PARTIAL/environment.env"
bash scripts/compose.sh config > "$PARTIAL/effective-compose.yml"
git rev-parse HEAD > "$PARTIAL/source-commit.txt"
(cd "$PARTIAL" && sha256sum database.sql uploads.tar environment.env effective-compose.yml source-commit.txt > SHA256SUMS)
mv "$PARTIAL" "$DEST"
printf '%s\n' "$DEST"
