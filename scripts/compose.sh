#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

if docker compose version >/dev/null 2>&1; then
  exec docker compose "$@"
elif command -v docker-compose >/dev/null 2>&1; then
  exec docker-compose "$@"
else
  echo "Docker Compose is unavailable. Install the Docker Compose plugin." >&2
  exit 1
fi
