#!/usr/bin/env bash
# FlexDocs end-to-end API smoke test.
# Run against a live instance: ./scripts/smoke-test.sh [BASE_URL]
# Requires: curl, python3. Exits non-zero on any failure.
set -u
BASE="${1:-http://localhost:3001}"
EMAIL="${SMOKE_EMAIL:-admin@flexdocs.local}"
PASSWORD="${SMOKE_PASSWORD:-admin12345}"
JAR="$(mktemp)"
PASS=0; FAIL=0

say()  { printf '%s\n' "$*"; }
ok()   { PASS=$((PASS+1)); say "  PASS $1"; }
bad()  { FAIL=$((FAIL+1)); say "  FAIL $1 ${2:+— $2}"; }
check() { # name, expected, actual
  if [ "$2" = "$3" ]; then ok "$1"; else bad "$1" "expected=$2 actual=$3"; fi
}
contains() { # name, needle, haystack
  case "$3" in *"$2"*) ok "$1";; *) bad "$1" "missing: $2";; esac
}

cleanup() {
  [ -n "${DOC_ID:-}" ] && curl -s -b "$JAR" -X DELETE "${BASE}/api/documents/${DOC_ID}" >/dev/null 2>&1
  [ -n "${PASS_ID:-}" ] && curl -s -b "$JAR" -X DELETE "${BASE}/api/passwords/${PASS_ID}" >/dev/null 2>&1
  rm -f "$JAR"
}
trap cleanup EXIT

say "== auth =="
CODE=$(curl -s -o /dev/null -w '%{http_code}' -c "$JAR" -X POST -H 'Content-Type: application/json' \
  "${BASE}/api/login" -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")
check "login" 200 "$CODE"

CODE=$(curl -s -o /dev/null -w '%{http_code}' "${BASE}/api/dashboard")
check "unauthenticated dashboard rejected" 401 "$CODE"

say "== dashboard =="
BODY=$(curl -s -b "$JAR" "${BASE}/api/dashboard")
contains "dashboard has docCount" '"docCount"' "$BODY"
contains "dashboard has activityTrend" '"activityTrend"' "$BODY"
contains "dashboard has staleServerCount" '"staleServerCount"' "$BODY"

say "== documents CRUD + tag join fix =="
BODY=$(curl -s -b "$JAR" -X POST -H 'Content-Type: application/json' \
  "${BASE}/api/documents" \
  -d '{"title":"SMOKE TEST DOC","content":"# hello","type":"markdown","category":"general","tags":["smoketag"]}')
DOC_ID=$(printf '%s' "$BODY" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("id",""))' 2>/dev/null)
[ -n "$DOC_ID" ] && ok "create document ($DOC_ID)" || bad "create document" "$BODY"

BODY=$(curl -s -b "$JAR" "${BASE}/api/documents/${DOC_ID}")
contains "tag persisted via join table" '"smoketag"' "$BODY"

BODY=$(curl -s -b $JAR -X PUT -H 'Content-Type: application/json' \
  "${BASE}/api/documents/${DOC_ID}" \
  -d '{"title":"SMOKE TEST DOC v2","content":"# hi","tags":[]}')
CODE=$(curl -s -o /dev/null -w '%{http_code}' -b "$JAR" "${BASE}/api/documents/${DOC_ID}")
check "update document readable" 200 "$CODE"
BODY=$(curl -s -b "$JAR" "${BASE}/api/documents/${DOC_ID}")
if printf '%s' "$BODY" | grep -q '"smoketag"'; then bad "tag removed on update" "$BODY"; else ok "tag removed on update"; fi

say "== passwords =="
BODY=$(curl -s -b "$JAR" -X POST -H 'Content-Type: application/json' \
  "${BASE}/api/passwords" \
  -d '{"name":"SMOKE TEST PW","username":"smoke","password":"password","category":"general"}')
PASS_ID=$(printf '%s' "$BODY" | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d.get("id") or d.get("password",{}).get("id",""))' 2>/dev/null)
[ -n "$PASS_ID" ] && ok "create password ($PASS_ID)" || bad "create password" "$BODY"

CODE=$(curl -s -o /dev/null -w '%{http_code}' -b "$JAR" -X POST "${BASE}/api/passwords/${PASS_ID}/breach")
check "breach check reachable" 200 "$CODE"
BODY=$(curl -s -b "$JAR" "${BASE}/api/passwords/health")
contains "health endpoint responds" '"totalPasswords"' "$BODY"

say "== notification preferences =="
BODY=$(curl -s -b "$JAR" -X PUT -H 'Content-Type: application/json' \
  "${BASE}/api/notifications/preferences" -d '{"types":["webhook"]}')
contains "mute webhook accepted" '"webhook"' "$BODY"
BODY=$(curl -s -b "$JAR" -X PUT -H 'Content-Type: application/json' \
  "${BASE}/api/notifications/preferences" -d '{"types":[]}')
contains "unmute all accepted" '"mutedTypes":[]' "$BODY"
BODY=$(curl -s -b "$JAR" "${BASE}/api/notifications")
contains "notifications list shape" '"unreadCount"' "$BODY"

say "== reports (8 types x csv+pdf) =="
for T in documents passwords domains assets organizations activity compliance health; do
  HDR=$(curl -s -b "$JAR" -D - -o /dev/null "${BASE}/api/reports?type=${T}&format=csv" | grep -i '^HTTP')
  case "$HDR" in *200*) ok "csv $T";; *) bad "csv $T" "$HDR";; esac
done
PDF_MAGIC_FAIL=0
for T in documents passwords domains assets organizations activity compliance health; do
  curl -s -b "$JAR" "${BASE}/api/reports?type=${T}&format=pdf" -o /tmp/smoke.pdf
  head -c 5 /tmp/smoke.pdf | grep -q '%PDF-' || { PDF_MAGIC_FAIL=1; bad "pdf magic $T"; }
done
[ "$PDF_MAGIC_FAIL" = "0" ] && ok "all 8 pdf types valid (%PDF-)"

say "== ssl + maintenance + sse =="
BODY=$(curl -s -b "$JAR" -X POST -H 'Content-Type: application/json' \
  "${BASE}/api/ssl/check" -d '{"hostname":"example.com"}')
contains "ssl check returns issuer data" '"issuer"' "$BODY"

BODY=$(curl -s -b "$JAR" -X POST --max-time 100 "${BASE}/api/automation/maintenance")
contains "maintenance run ok" '"ok":true' "$BODY"

SSE=$(curl -s -N --max-time 4 -b "$JAR" "${BASE}/api/notifications/stream" | head -1)
case "$SSE" in data:*) ok "sse stream emits initial event";; *) bad "sse stream" "$SSE";; esac

say ""
say "RESULTS: $PASS passed, $FAIL failed"
[ "$FAIL" = "0" ]
