#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ ! -f .env ]]; then
  echo "No .env found. Run: bash scripts/setup.sh" >&2
  exit 1
fi

phase='configuration validation'
trap 'echo "Update stopped during $phase. Inspect the error above; do not reset or remove data volumes." >&2' ERR
bash scripts/compose.sh config --quiet
phase='database backup'
bash scripts/database-backup.sh
phase='image build'
bash scripts/compose.sh build init app
phase='database migration and seed'
bash scripts/compose.sh run --rm init
phase='application startup'
bash scripts/compose.sh up -d redis
# Initialization already succeeded using the newly built image.
bash scripts/compose.sh up -d --no-deps app
phase='readiness verification'
bash scripts/wait-for-health.sh
echo 'Update completed successfully.'
