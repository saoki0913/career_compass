#!/bin/bash
# Fetch recent unresolved Sentry errors for career-compass projects.
# Usage: bash fetch-sentry-errors.sh [--since=24h|1h|5m] [--project=frontend|backend|both]
# Requires: SENTRY_AUTH_TOKEN env var (NEVER reads .env files)
set -euo pipefail

SENTRY_ORG="japan-qs"
FRONTEND_PROJECT="career-compass-frontend"
BACKEND_PROJECT="career-compass-backend"
SENTRY_API="https://sentry.io/api/0"
SINCE="24h"
TARGET_PROJECT="both"
TOP_N=3

while [ $# -gt 0 ]; do
  case "$1" in
    --since=*) SINCE="${1#--since=}"; shift ;;
    --project=*) TARGET_PROJECT="${1#--project=}"; shift ;;
    --help|-h)
      echo "Usage: bash fetch-sentry-errors.sh [--since=24h|1h|5m] [--project=frontend|backend|both]"
      echo "Requires: SENTRY_AUTH_TOKEN env var"
      exit 0 ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

if [ -z "${SENTRY_AUTH_TOKEN:-}" ]; then
  echo '{"error":"SENTRY_AUTH_TOKEN env var is not set. Set it before running this script."}' >&2
  exit 1
fi

since_to_iso() {
  local val="$1"
  local num="${val%[hmd]}"
  local unit="${val##*[0-9]}"
  case "$unit" in
    m) date -u -v-"${num}M" +"%Y-%m-%dT%H:%M:%S" 2>/dev/null || date -u -d "${num} minutes ago" +"%Y-%m-%dT%H:%M:%S" ;;
    h) date -u -v-"${num}H" +"%Y-%m-%dT%H:%M:%S" 2>/dev/null || date -u -d "${num} hours ago" +"%Y-%m-%dT%H:%M:%S" ;;
    d) date -u -v-"${num}d" +"%Y-%m-%dT%H:%M:%S" 2>/dev/null || date -u -d "${num} days ago" +"%Y-%m-%dT%H:%M:%S" ;;
    *) date -u -v-24H +"%Y-%m-%dT%H:%M:%S" 2>/dev/null || date -u -d "24 hours ago" +"%Y-%m-%dT%H:%M:%S" ;;
  esac
}

SINCE_ISO=$(since_to_iso "$SINCE")

fetch_issues() {
  local project="$1"
  local response
  response=$(curl -sS -w "\n%{http_code}" \
    -H "Authorization: Bearer $SENTRY_AUTH_TOKEN" \
    "${SENTRY_API}/projects/${SENTRY_ORG}/${project}/issues/?query=is:unresolved&sort=date&limit=10&start=${SINCE_ISO}" 2>&1)

  local http_code
  http_code=$(echo "$response" | tail -1)
  local body
  body=$(echo "$response" | sed '$d')

  if [ "$http_code" = "401" ] || [ "$http_code" = "403" ]; then
    echo '[]'
    echo "SENTRY_AUTH_TOKEN is invalid or expired (HTTP $http_code for $project)" >&2
    return
  fi

  if [ "$http_code" != "200" ]; then
    echo '[]'
    echo "Sentry API error: HTTP $http_code for $project" >&2
    return
  fi

  echo "$body" | jq -c '[.[] | {
    id: .id,
    title: .title,
    count: .count,
    level: .level,
    firstSeen: .firstSeen,
    lastSeen: .lastSeen,
    culprit: .culprit,
    shortId: .shortId
  }]' 2>/dev/null || echo '[]'
}

fetch_latest_event() {
  local issue_id="$1"
  local response
  response=$(curl -sS -w "\n%{http_code}" \
    -H "Authorization: Bearer $SENTRY_AUTH_TOKEN" \
    "${SENTRY_API}/issues/${issue_id}/events/latest/" 2>&1)

  local http_code
  http_code=$(echo "$response" | tail -1)
  local body
  body=$(echo "$response" | sed '$d')

  if [ "$http_code" != "200" ]; then
    echo '[]'
    return
  fi

  echo "$body" | jq -c '[
    .entries[]? |
    select(.type == "exception") |
    .data.values[]? |
    {
      type: .type,
      value: .value,
      frames: [
        .stacktrace.frames[]? |
        select(.inApp == true) |
        {file: .filename, line: .lineNo, function: .function}
      ]
    }
  ]' 2>/dev/null || echo '[]'
}

enrich_top_issues() {
  local issues_json="$1"
  local count
  count=$(echo "$issues_json" | jq 'length' 2>/dev/null || echo "0")
  local limit=$TOP_N
  [ "$count" -lt "$limit" ] && limit=$count

  local result="[]"
  for i in $(seq 0 $((limit - 1))); do
    local issue_id
    issue_id=$(echo "$issues_json" | jq -r ".[$i].id")
    local stacktrace
    stacktrace=$(fetch_latest_event "$issue_id")
    result=$(echo "$result" | jq -c --argjson idx "$i" --argjson st "$stacktrace" \
      ". + [($issues_json | .[$idx]) + {stacktrace: \$st}]" \
      --argjson issues_json "$issues_json" 2>/dev/null || echo "$result")
  done

  if [ "$result" = "[]" ] && [ "$count" -gt 0 ]; then
    echo "$issues_json" | jq -c '[.[] | . + {stacktrace: []}]'
  else
    echo "$result"
  fi
}

frontend_issues="[]"
backend_issues="[]"

if [ "$TARGET_PROJECT" = "frontend" ] || [ "$TARGET_PROJECT" = "both" ]; then
  frontend_issues=$(fetch_issues "$FRONTEND_PROJECT")
  if [ "$(echo "$frontend_issues" | jq 'length' 2>/dev/null)" -gt 0 ]; then
    frontend_enriched=$(enrich_top_issues "$frontend_issues")
    remaining=$(echo "$frontend_issues" | jq -c ".[${TOP_N}:] // []" 2>/dev/null || echo "[]")
    remaining_with_empty=$(echo "$remaining" | jq -c '[.[] | . + {stacktrace: []}]' 2>/dev/null || echo "[]")
    frontend_issues=$(echo "null" | jq -c --argjson a "$frontend_enriched" --argjson b "$remaining_with_empty" '$a + $b' 2>/dev/null || echo "$frontend_enriched")
  fi
fi

if [ "$TARGET_PROJECT" = "backend" ] || [ "$TARGET_PROJECT" = "both" ]; then
  backend_issues=$(fetch_issues "$BACKEND_PROJECT")
  if [ "$(echo "$backend_issues" | jq 'length' 2>/dev/null)" -gt 0 ]; then
    backend_enriched=$(enrich_top_issues "$backend_issues")
    remaining=$(echo "$backend_issues" | jq -c ".[${TOP_N}:] // []" 2>/dev/null || echo "[]")
    remaining_with_empty=$(echo "$remaining" | jq -c '[.[] | . + {stacktrace: []}]' 2>/dev/null || echo "[]")
    backend_issues=$(echo "null" | jq -c --argjson a "$backend_enriched" --argjson b "$remaining_with_empty" '$a + $b' 2>/dev/null || echo "$backend_enriched")
  fi
fi

jq -n -c \
  --argjson frontend "$frontend_issues" \
  --argjson backend "$backend_issues" \
  --arg since "$SINCE_ISO" \
  --arg fetched_at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  '{since: $since, fetchedAt: $fetched_at, frontend: $frontend, backend: $backend}'
