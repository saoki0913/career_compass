#!/bin/bash
# Production health check and HTTP status verification.
# Usage: bash verify-production.sh [--verbose]
set -euo pipefail

VERBOSE=false
FRONTEND_URL="https://www.shupass.jp"
BACKEND_URL="https://shupass-backend-production.up.railway.app"
PASS_COUNT=0
FAIL_COUNT=0
WARN_COUNT=0

while [ $# -gt 0 ]; do
  case "$1" in
    --verbose|-v) VERBOSE=true; shift ;;
    --help|-h)
      echo "Usage: bash verify-production.sh [--verbose]"
      exit 0 ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

report() {
  local status="$1" name="$2" detail="$3"
  case "$status" in
    PASS) PASS_COUNT=$((PASS_COUNT + 1)); printf '  [PASS] %s\n' "$name" ;;
    FAIL) FAIL_COUNT=$((FAIL_COUNT + 1)); printf '  [FAIL] %s — %s\n' "$name" "$detail" ;;
    WARN) WARN_COUNT=$((WARN_COUNT + 1)); printf '  [WARN] %s — %s\n' "$name" "$detail" ;;
  esac
}

check_http_status() {
  local url="$1" name="$2" expected="${3:-200}"
  local status
  status=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 15 "$url" 2>/dev/null || echo "000")
  if [ "$status" = "$expected" ]; then
    report PASS "$name" ""
  elif [ "$status" = "000" ]; then
    report FAIL "$name" "Connection failed (timeout or DNS)"
  else
    report FAIL "$name" "Expected $expected, got $status"
  fi
  [ "$VERBOSE" = true ] && echo "    curl $url → $status"
}

check_json_health() {
  local url="$1" name="$2" expected_field="$3" expected_value="$4"
  local response
  response=$(curl -sS --max-time 15 "$url" 2>/dev/null || echo "")
  if [ -z "$response" ]; then
    report FAIL "$name" "No response"
    return
  fi
  local actual
  actual=$(echo "$response" | jq -r ".$expected_field // empty" 2>/dev/null || echo "")
  if [ "$actual" = "$expected_value" ]; then
    report PASS "$name" ""
  else
    report FAIL "$name" "Expected $expected_field=$expected_value, got '$actual'"
  fi
  [ "$VERBOSE" = true ] && echo "    $response"
}

check_body_contains() {
  local url="$1" name="$2" pattern="$3"
  local body
  body=$(curl -sS --max-time 15 "$url" 2>/dev/null || echo "")
  if echo "$body" | grep -qE "$pattern"; then
    report PASS "$name" ""
  else
    report FAIL "$name" "Body does not contain pattern: $pattern"
  fi
}

check_redirect() {
  local url="$1" name="$2" expected_location="$3"
  local status location
  status=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 15 "$url" 2>/dev/null || echo "000")
  location=$(curl -sS -o /dev/null -w '%{redirect_url}' --max-time 15 "$url" 2>/dev/null || echo "")
  if [ "$status" = "301" ] || [ "$status" = "307" ] || [ "$status" = "308" ]; then
    if echo "$location" | grep -q "$expected_location"; then
      report PASS "$name" ""
    else
      report WARN "$name" "Redirects to $location (expected $expected_location)"
    fi
  else
    report FAIL "$name" "Expected redirect, got $status"
  fi
}

FETCHED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)
echo "=== Production Health Check ==="
echo "# Timestamp: $FETCHED_AT"
echo ""

echo "--- Backend Health ---"
check_json_health "$BACKEND_URL/health" "Backend liveness" "status" "healthy"
check_json_health "$BACKEND_URL/health/ready" "Backend readiness" "status" "ready"

echo ""
echo "--- Frontend HTTP ---"
check_http_status "$FRONTEND_URL/" "Homepage" "200"
check_http_status "$FRONTEND_URL/pricing" "Pricing page" "200"
check_http_status "$FRONTEND_URL/terms" "Terms page" "200"
check_http_status "$FRONTEND_URL/privacy" "Privacy page" "200"
check_http_status "$FRONTEND_URL/contact" "Contact page" "200"

echo ""
echo "--- Marketing LPs ---"
check_http_status "$FRONTEND_URL/es-tensaku-ai" "ES AI LP" "200"
check_http_status "$FRONTEND_URL/gakuchika-ai" "Gakuchika AI LP" "200"
check_http_status "$FRONTEND_URL/shiboudouki-ai" "Shiboudouki AI LP" "200"
check_http_status "$FRONTEND_URL/tools" "Tools page" "200"
check_http_status "$FRONTEND_URL/tools/es-counter" "ES Counter tool" "200"

echo ""
echo "--- SEO Assets ---"
check_body_contains "$FRONTEND_URL/robots.txt" "robots.txt" "shupass"
check_http_status "$FRONTEND_URL/sitemap.xml" "sitemap.xml" "200"

echo ""
echo "--- Redirects ---"
check_redirect "https://shupass.jp/" "www redirect" "www.shupass.jp"

echo ""
echo "=== Summary ==="
echo "PASS: $PASS_COUNT | FAIL: $FAIL_COUNT | WARN: $WARN_COUNT"
if [ "$FAIL_COUNT" -gt 0 ]; then
  echo "STATUS: UNHEALTHY"
  exit 1
else
  echo "STATUS: HEALTHY"
  exit 0
fi
