#!/usr/bin/env bash
set -euo pipefail
umask 077
cd "$(dirname "$0")/.."
if docker compose version >/dev/null 2>&1; then DC=(docker compose); else DC=(docker-compose); fi
mkdir -p backups
PARTIAL=$(mktemp backups/flexdocs-XXXXXXXX.sql.partial)
trap 'rm -f "$PARTIAL"' EXIT
"${DC[@]}" exec -T db pg_dump -U flexdocs flexdocs > "$PARTIAL"
test -s "$PARTIAL"
COMPLETE="${PARTIAL%.partial}"
mv "$PARTIAL" "$COMPLETE"
printf '%s\n' "$COMPLETE"
