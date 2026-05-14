#!/bin/bash
# Fetch Railway backend logs and filter for errors.
# Usage: bash fetch-railway-logs.sh [--tail=500] [--filter=errors|all]
# IMPORTANT: caller must create release-provider checkpoint BEFORE invoking.
# The release-provider-guard.sh blocks `railway` CLI without approval.
set -euo pipefail

TAIL_COUNT=500
FILTER_MODE="errors"

while [ $# -gt 0 ]; do
  case "$1" in
    --tail=*) TAIL_COUNT="${1#--tail=}"; shift ;;
    --filter=*) FILTER_MODE="${1#--filter=}"; shift ;;
    --help|-h)
      echo "Usage: bash fetch-railway-logs.sh [--tail=500] [--filter=errors|all]"
      echo "Note: caller must create release-provider checkpoint BEFORE invoking"
      exit 0 ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

if ! command -v railway >/dev/null 2>&1; then
  echo "ERROR: railway CLI is not installed or not in PATH" >&2
  exit 1
fi

FETCHED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)
RAW_LOGS=$(railway logs --tail "$TAIL_COUNT" 2>&1) || {
  echo "ERROR: railway logs command failed" >&2
  echo "$RAW_LOGS" >&2
  exit 1
}

TOTAL_LINES=$(echo "$RAW_LOGS" | wc -l | tr -d ' ')

if [ "$FILTER_MODE" = "all" ]; then
  echo "=== Railway Log Dump ==="
  echo "# Fetched at: $FETCHED_AT"
  echo "# Total lines: $TOTAL_LINES"
  echo ""
  echo "$RAW_LOGS"
  exit 0
fi

ERROR_PATTERN='[Ee]rror|[Tt]raceback|[Ee]xception|CRITICAL|FATAL|OOM|[Kk]illed|SIGTERM|SIGKILL|unhealthy|[Tt]imeout|"status":\s*5[0-9][0-9]| 500 | 502 | 503 |circuit.open|MemoryError|RuntimeError'

FILTERED=$(echo "$RAW_LOGS" | grep -iE "$ERROR_PATTERN" 2>/dev/null || true)
ERROR_COUNT=$(echo "$FILTERED" | grep -c . 2>/dev/null || echo "0")

classify_line() {
  local line="$1"
  if echo "$line" | grep -qiE 'OOM|MemoryError|[Kk]illed|SIGKILL'; then
    echo "MEMORY"
  elif echo "$line" | grep -qiE '[Tt]raceback|[Ee]xception|RuntimeError'; then
    echo "PYTHON_ERROR"
  elif echo "$line" | grep -qiE '500|502|503|"status":\s*5[0-9][0-9]'; then
    echo "HTTP_ERROR"
  elif echo "$line" | grep -qiE '[Tt]imeout'; then
    echo "TIMEOUT"
  elif echo "$line" | grep -qiE 'circuit|unhealthy|SIGTERM'; then
    echo "INFRA"
  else
    echo "GENERAL"
  fi
}

declare -A CATEGORY_LINES
declare -A CATEGORY_COUNTS

while IFS= read -r line; do
  [ -z "$line" ] && continue
  cat=$(classify_line "$line")
  CATEGORY_LINES[$cat]="${CATEGORY_LINES[$cat]:-}${line}
"
  CATEGORY_COUNTS[$cat]=$(( ${CATEGORY_COUNTS[$cat]:-0} + 1 ))
done <<< "$FILTERED"

echo "=== Railway Error Log Summary ==="
echo "# Fetched at: $FETCHED_AT"
echo "# Total lines scanned: $TOTAL_LINES"
echo "# Error lines found: $ERROR_COUNT"
echo ""

for cat in MEMORY PYTHON_ERROR HTTP_ERROR TIMEOUT INFRA GENERAL; do
  count=${CATEGORY_COUNTS[$cat]:-0}
  [ "$count" -eq 0 ] && continue
  echo "[$cat] (count: $count)"
  echo "${CATEGORY_LINES[$cat]}"
  echo ""
done

if [ "$ERROR_COUNT" -eq 0 ]; then
  echo "No error patterns found in the last $TAIL_COUNT log lines."
fi
