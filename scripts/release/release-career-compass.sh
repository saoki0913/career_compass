#!/bin/zsh
# release-career-compass.sh — thin orchestrator for career_compass release pipeline
#
# Dispatches to:
#   scripts/release/deploy-staging.sh    — staging deployment
#   scripts/release/deploy-production.sh — production deployment
#
# Usage:
#   release-career-compass.sh                     # full release (staging → production)
#   release-career-compass.sh --check             # preflight only
#   release-career-compass.sh --preflight-only    # preflight only (alias)
#   release-career-compass.sh --staging-only      # staging only
#   release-career-compass.sh --stage-all         # full release, staging all local changes first
#
# Backward-compatible flags forwarded to the appropriate sub-script:
#   --skip-playwright, --skip-user-e2e, --skip-secret-apply, --apply-secrets
#   --commit-message MSG

set -euo pipefail

script_dir="$(cd "$(dirname "$0")" && pwd)"
repo_root="$(cd "${script_dir}/../.." && pwd)"
source "${script_dir}/common.sh"

# ---- defaults ----------------------------------------------------------------
mode="release"

# passthrough arrays — populated while parsing; forwarded verbatim to sub-scripts
staging_args=()
production_args=()

# ---- arg parse ---------------------------------------------------------------
while [[ $# -gt 0 ]]; do
  case "$1" in
    --check|--preflight-only)
      mode="preflight"
      ;;
    --staging-only)
      mode="staging"
      ;;
    --skip-playwright)
      staging_args+=(--skip-playwright)
      production_args+=(--skip-playwright)
      ;;
    --skip-user-e2e)
      staging_args+=(--skip-user-e2e)
      ;;
    --skip-secret-apply)
      staging_args+=(--skip-secret-apply)
      ;;
    --apply-secrets)
      staging_args+=(--apply-secrets)
      ;;
    --stage-all)
      staging_args+=(--stage-all)
      ;;
    --commit-message)
      staging_args+=(--commit-message "${2:-}")
      shift
      ;;
    -h|--help)
      echo "Usage: $0 [--check|--preflight-only|--staging-only] [--skip-playwright] [--skip-user-e2e] [--apply-secrets] [--skip-secret-apply] [--stage-all] [--commit-message MSG]" >&2
      exit 0
      ;;
    *)
      release_die "Unknown argument: $1"
      ;;
  esac
  shift
done

# ---- dependency check --------------------------------------------------------
require_release_dependencies() {
  require_real_binary git
  require_real_binary gh
  require_real_binary curl
  require_real_binary npm
  require_real_binary python
  require_real_binary vercel
  require_real_binary railway
  require_real_binary supabase
  require_real_binary gcloud
}

# ---- common preflight (provider auth + bootstrap) ---------------------------
run_common_preflight() {
  release_log "Checking provider auth"
  run_real zsh "${repo_root}/scripts/release/provider-auth-status.sh" --strict
  release_log "Checking infra bootstrap inputs"
  run_real zsh "${repo_root}/scripts/bootstrap/career-compass/bootstrap-career-compass-infra.sh" --check
}

# ---- secret drift check (env-scoped) ----------------------------------------
run_secret_drift_check() {
  local env_scope="${1:-all}"
  release_log "Secret drift check: scope=${env_scope}"
  case "$env_scope" in
    staging)
      run_real zsh "${repo_root}/scripts/release/sync-career-compass-secrets.sh" --check --target vercel-staging
      run_real zsh "${repo_root}/scripts/release/sync-career-compass-secrets.sh" --check --target railway-staging
      run_real zsh "${repo_root}/scripts/release/sync-career-compass-secrets.sh" --check --target github
      ;;
    production)
      run_real zsh "${repo_root}/scripts/release/sync-career-compass-secrets.sh" --check --target vercel-production
      run_real zsh "${repo_root}/scripts/release/sync-career-compass-secrets.sh" --check --target railway-production
      ;;
    all)
      run_real zsh "${repo_root}/scripts/release/sync-career-compass-secrets.sh" --check --target all
      ;;
  esac
}

# ---- dispatch ----------------------------------------------------------------
require_release_dependencies
cd "$repo_root"

case "$mode" in
  preflight)
    run_common_preflight
    run_secret_drift_check all
    release_log "Preflight completed"
    exit 0
    ;;

  staging)
    run_common_preflight
    run_secret_drift_check staging
    # deploy-staging.sh runs its own lightweight preflight (branch/gh-default checks).
    # Provider auth + bootstrap are already verified above, so pass --skip-local-gate=false (default)
    # but the redundant auth check inside deploy-staging is acceptable for safety.
    run_real zsh "${repo_root}/scripts/release/deploy-staging.sh" "${staging_args[@]}"
    release_log "Staging flow completed"
    exit 0
    ;;

  release)
    run_common_preflight
    run_secret_drift_check all
    run_real zsh "${repo_root}/scripts/release/deploy-staging.sh" "${staging_args[@]}"
    run_real zsh "${repo_root}/scripts/release/deploy-production.sh" "${production_args[@]}"
    release_log "Release completed for career_compass"
    exit 0
    ;;
esac
