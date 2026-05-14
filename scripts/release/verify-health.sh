#!/bin/zsh
# verify-health.sh — standalone health verification utility for career_compass
# Usage: verify-health.sh <staging|production|all> [--retries N] [--delay S] [--skip-seo] [--skip-playwright]
#
# Exit 0 on success, exit 1 on any failure.

set -euo pipefail

script_dir="$(cd "$(dirname "$0")" && pwd)"
repo_root="$(cd "${script_dir}/../.." && pwd)"
source "${script_dir}/common.sh"

# ---- defaults ----------------------------------------------------------------
env_target=""
retries=40
delay=10
skip_seo=0
skip_playwright=0
skip_user_e2e=0

staging_frontend_url="https://stg.shupass.jp"
staging_backend_health_url="https://stg-api.shupass.jp/health"
staging_backend_ready_url="https://stg-api.shupass.jp/health/ready"
staging_backend_version_url="https://stg-api.shupass.jp/health/version"
production_frontend_url="https://www.shupass.jp"
production_backend_health_url="https://shupass-backend-production.up.railway.app/health"
production_backend_ready_url="https://shupass-backend-production.up.railway.app/health/ready"
production_backend_version_url="https://shupass-backend-production.up.railway.app/health/version"
production_apex_url="https://shupass.jp"

# ---- arg parse ---------------------------------------------------------------
while [[ $# -gt 0 ]]; do
  case "$1" in
    staging|production|all)
      env_target="$1"
      ;;
    --retries)
      retries="${2:-40}"
      shift
      ;;
    --delay)
      delay="${2:-10}"
      shift
      ;;
    --skip-seo)
      skip_seo=1
      ;;
    --skip-playwright)
      skip_playwright=1
      ;;
    --skip-user-e2e)
      skip_user_e2e=1
      ;;
    -h|--help)
      echo "Usage: $0 <staging|production|all> [--retries N] [--delay S] [--skip-seo] [--skip-playwright] [--skip-user-e2e]" >&2
      exit 0
      ;;
    *)
      release_die "Unknown argument: $1"
      ;;
  esac
  shift
done

[[ -n "$env_target" ]] || release_die "Usage: $0 <staging|production|all> [options]"

# ---- helpers -----------------------------------------------------------------
assert_ready_json() {
  local url="$1"
  local body=""
  local idx

  for idx in $(seq 1 3); do
    body="$(run_real curl -sS --max-time 20 "$url" || true)"
    if print -r -- "$body" | node -e '
      const fs = require("fs");
      try {
        const payload = JSON.parse(fs.readFileSync(0, "utf8"));
        const failed = Array.isArray(payload.failed) ? payload.failed : [];
        process.exit(payload.status === "ready" && failed.length === 0 ? 0 : 1);
      } catch {
        process.exit(2);
      }
    '; then
      return 0
    fi
    if [[ "$idx" -lt 3 ]]; then
      sleep 5
    fi
  done

  release_die "Readiness JSON check failed for ${url}"
}

check_version_json() {
  local url="$1"
  local expected_sha="${2:-}"
  local body
  body="$(run_real curl -sS --max-time 20 "$url" || true)"
  local sha
  sha="$(print -r -- "$body" | node -e '
    const fs = require("fs");
    try {
      const payload = JSON.parse(fs.readFileSync(0, "utf8"));
      if (payload && Object.prototype.hasOwnProperty.call(payload, "sha")) {
        process.stdout.write(String(payload.sha || ""));
        process.exit(0);
      }
      process.exit(1);
    } catch {
      process.exit(2);
    }
  ' || true)"
  if [[ -z "$sha" ]]; then
    release_warn "Version JSON unavailable or sha is null for ${url}"
    return 0
  fi
  if [[ -n "$expected_sha" && "$sha" != "${expected_sha:0:8}" ]]; then
    release_warn "Backend version sha mismatch for ${url}: got=${sha}, expected=${expected_sha:0:8}"
  else
    release_log "Backend version sha for ${url}: ${sha}"
  fi
}

verify_staging() {
  release_log "Verifying staging health (retries=${retries}, delay=${delay}s)"
  wait_for_http_ok "$staging_backend_health_url" "$retries" "$delay"
  assert_ready_json "$staging_backend_ready_url"
  check_version_json "$staging_backend_version_url" "${EXPECTED_BACKEND_SHA:-}"
  wait_for_http_ok "$staging_frontend_url" "$retries" "$delay"
  assert_url_contains "${staging_frontend_url}" "https://stg.shupass.jp"
  if [[ "$skip_seo" != "1" ]]; then
    assert_url_contains "${staging_frontend_url}/robots.txt" "https://stg.shupass.jp"
    assert_url_contains "${staging_frontend_url}/sitemap.xml" "https://stg.shupass.jp"
  fi
  if [[ "$skip_playwright" != "1" ]]; then
    if [[ "$skip_user_e2e" == "1" ]]; then
      RELEASE_CAPTURE_GOOGLE_AUTH=0 run_real zsh "${repo_root}/scripts/release/post-deploy-playwright.sh" staging
    else
      RELEASE_CAPTURE_GOOGLE_AUTH="${RELEASE_CAPTURE_GOOGLE_AUTH:-1}" run_real zsh "${repo_root}/scripts/release/post-deploy-playwright.sh" staging
    fi
  fi
  release_log "Staging health: OK"
}

verify_production() {
  release_log "Verifying production health (retries=${retries}, delay=${delay}s)"
  wait_for_http_ok "$production_backend_health_url" "$retries" "$delay"
  assert_ready_json "$production_backend_ready_url"
  check_version_json "$production_backend_version_url" "${EXPECTED_BACKEND_SHA:-}"
  wait_for_http_ok "$production_frontend_url" "$retries" "$delay"
  wait_for_http_ok "$production_apex_url" 20 "$delay"
  assert_url_contains "${production_frontend_url}" "https://www.shupass.jp"
  if [[ "$skip_seo" != "1" ]]; then
    assert_url_contains "${production_frontend_url}/robots.txt" "https://www.shupass.jp"
    assert_url_contains "${production_frontend_url}/sitemap.xml" "https://www.shupass.jp"
  fi
  if [[ "$skip_playwright" != "1" ]]; then
    RELEASE_CAPTURE_GOOGLE_AUTH="${RELEASE_CAPTURE_GOOGLE_AUTH:-1}" run_real zsh "${repo_root}/scripts/release/post-deploy-playwright.sh" production
  fi
  release_log "Production health: OK"
}

# ---- dispatch ----------------------------------------------------------------
case "$env_target" in
  staging)
    verify_staging
    ;;
  production)
    verify_production
    ;;
  all)
    verify_staging
    verify_production
    ;;
esac
