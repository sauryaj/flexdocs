#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

attempts="${HEALTH_ATTEMPTS:-60}"
interval="${HEALTH_INTERVAL_SECONDS:-3}"
if [[ ! "$attempts" =~ ^[1-9][0-9]*$ ]] || [[ ! "$interval" =~ ^[0-9]+$ ]]; then
  echo "HEALTH_ATTEMPTS must be positive and HEALTH_INTERVAL_SECONDS must be a nonnegative integer." >&2
  exit 1
fi
command -v curl >/dev/null 2>&1 || { echo "curl is required to check readiness." >&2; exit 1; }

for ((attempt = 1; attempt <= attempts; attempt++)); do
  binding=$(bash scripts/compose.sh port app 3000 2>/dev/null | head -n 1) || binding=''
  port="${binding##*:}"
  host="${binding%:*}"
  case "$host" in
    0.0.0.0) host=127.0.0.1 ;;
    '[::]') host='[::1]' ;;
  esac
  if [[ -n "$binding" && "$port" =~ ^[0-9]+$ ]]; then
    status=$(curl --silent --show-error --output /dev/null --write-out '%{http_code}' --connect-timeout 2 --max-time 5 "http://${host}:${port}/api/health") || status=''
    if [[ "$status" == 200 ]]; then
      printf 'App is ready at http://%s:%s\n' "$host" "$port"
      exit 0
    fi
  fi
  if (( attempt < attempts )); then sleep "$interval"; fi
done

echo "App did not become ready after $attempts checks. Inspect: bash scripts/compose.sh logs app init db redis" >&2
exit 1
