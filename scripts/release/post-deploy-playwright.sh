#!/bin/zsh

set -euo pipefail

script_dir="$(cd "$(dirname "$0")" && pwd)"
repo_root="$(cd "${script_dir}/../.." && pwd)"
source "${script_dir}/common.sh"

environment="${1:-}"
[[ -n "$environment" ]] || release_die "Usage: $0 <staging|production>"

base_url=""
case "$environment" in
  staging)
    base_url="https://stg.shupass.jp"
    ;;
  production)
    base_url="https://www.shupass.jp"
    ;;
  *)
    release_die "Unsupported environment: ${environment}"
    ;;
esac

capture_google_auth_if_needed() {
  if [[ -n "${PLAYWRIGHT_AUTH_STATE:-}" ]]; then
    return 0
  fi
  if [[ "${RELEASE_CAPTURE_GOOGLE_AUTH:-0}" != "1" ]]; then
    return 0
  fi
  local state_file
  state_file="$(run_real zsh "${repo_root}/scripts/release/capture-google-storage-state.sh" "$environment")"
  export PLAYWRIGHT_AUTH_STATE="$state_file"
}

run_playwright_args() {
  release_log "Running Playwright against ${base_url}: $*"
  (
    cd "$repo_root"
    PLAYWRIGHT_BASE_URL="$base_url" \
      PLAYWRIGHT_SKIP_WEBSERVER=1 \
      npm run test:e2e -- "$@"
  )
}

capture_google_auth_if_needed

if [[ "$environment" == "staging" ]]; then
  run_playwright_args e2e/guest-major.spec.ts
  if [[ -n "${PLAYWRIGHT_AUTH_STATE:-}" ]]; then
    run_playwright_args e2e/user-major.spec.ts
  else
    release_warn "PLAYWRIGHT_AUTH_STATE is not set. Skipping authenticated staging suite."
  fi
  if [[ "${RELEASE_RUN_LIVE_AI:-0}" == "1" ]]; then
    (
      cd "$repo_root"
      PLAYWRIGHT_BASE_URL="$base_url" \
        PLAYWRIGHT_SKIP_WEBSERVER=1 \
        npm run test:e2e:major:live
    )
  fi
  exit 0
fi

run_playwright_args e2e/release-production-readonly.spec.ts
