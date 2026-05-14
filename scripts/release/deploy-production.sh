#!/bin/zsh
# deploy-production.sh — production-only deployment for career_compass
# Usage: deploy-production.sh [--skip-staging-gate] [--skip-playwright] [--skip-seo]
#
# Prerequisites: staging must already be healthy (enforced via staging gate).
# Exit 0 on success, exit 1 on failure.

set -euo pipefail

script_dir="$(cd "$(dirname "$0")" && pwd)"
repo_root="$(cd "${script_dir}/../.." && pwd)"
source "${script_dir}/common.sh"

# ---- defaults ----------------------------------------------------------------
skip_staging_gate=0
skip_playwright=0
skip_seo=0
repo_slug="saoki0913/career_compass"

# ---- arg parse ---------------------------------------------------------------
while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-staging-gate)
      skip_staging_gate=1
      ;;
    --skip-playwright)
      skip_playwright=1
      ;;
    --skip-seo)
      skip_seo=1
      ;;
    -h|--help)
      echo "Usage: $0 [--skip-staging-gate] [--skip-playwright] [--skip-seo]" >&2
      exit 0
      ;;
    *)
      release_die "Unknown argument: $1"
      ;;
  esac
  shift
done

# ---- functions ---------------------------------------------------------------
assert_staging_healthy() {
  if [[ "$skip_staging_gate" == "1" ]]; then
    release_warn "Skipping staging gate (--skip-staging-gate)"
    return 0
  fi
  release_log "Verifying staging health before production promotion"
  local health_args=(--skip-playwright)
  [[ "$skip_seo" == "1" ]] && health_args+=(--skip-seo)
  run_real zsh "${repo_root}/scripts/release/verify-health.sh" staging "${health_args[@]}"
}

check_production_secrets() {
  release_log "Verifying production provider secrets (check-only, no apply)"
  run_real zsh "${repo_root}/scripts/release/sync-career-compass-secrets.sh" --check --target all 2>&1 | redact_output
}

verify_migrations_applied() {
  release_log "Verifying shared DB migration state before production promotion"
  local result
  if ! result="$(node "${repo_root}/scripts/release/run-migrations.mjs" --env production --dry-run --json 2>&1)"; then
    print -r -- "$result" | redact_output
    release_die "Shared DB migration verification failed. Run make deploy-staging or follow docs/release/ops/DB_MIGRATION.md."
  fi

  local pending
  pending="$(print -r -- "$result" | node -e "const fs=require('fs'); const j=JSON.parse(fs.readFileSync(0,'utf8')); process.stdout.write(String(j.pending || 0));")"
  if [[ "$pending" != "0" ]]; then
    release_die "Shared DB has ${pending} pending Drizzle migration(s). Run make deploy-staging first."
  fi
  release_log "Shared DB migration state is current"
}

assert_production_readonly_prerequisites() {
  [[ -n "${E2E_PRODUCTION_COMPANY_ID:-}" ]] || release_die "E2E_PRODUCTION_COMPANY_ID is required before promoting to main."
  if [[ -z "${PLAYWRIGHT_AUTH_STATE:-}" && "${RELEASE_CAPTURE_GOOGLE_AUTH:-1}" != "1" ]]; then
    release_die "PLAYWRIGHT_AUTH_STATE is required when RELEASE_CAPTURE_GOOGLE_AUTH is not enabled."
  fi
}

create_or_reuse_promotion_pr() {
  local existing_pr
  local pr_url

  existing_pr="$(run_real gh pr list --repo "$repo_slug" --base main --head develop --json number --jq '.[0].number')"
  if [[ -n "$existing_pr" && "$existing_pr" != "null" ]]; then
    print -r -- "$existing_pr"
    return 0
  fi

  pr_url="$(run_real gh pr create --repo "$repo_slug" --base main --head develop --title "Promote career_compass develop to main" --body "Automated promotion after local/staging verification.")"
  print -r -- "${pr_url##*/}"
}

promote_to_main() {
  local pr_number

  pr_number="$(create_or_reuse_promotion_pr)"
  release_log "Merging PR #${pr_number}"
  if ! run_real gh pr merge "$pr_number" --repo "$repo_slug" --auto --merge 2>/dev/null; then
    release_log "Auto-merge unavailable; waiting for checks before merge"
    run_real gh pr checks "$pr_number" --repo "$repo_slug" --watch
    run_real gh pr merge "$pr_number" --repo "$repo_slug" --merge
  fi
  wait_for_pr_merge "$pr_number"
}

# ---- main flow ---------------------------------------------------------------
cd "$repo_root"

assert_staging_healthy
check_production_secrets
verify_migrations_applied
assert_production_readonly_prerequisites
promote_to_main

playwright_args=()
[[ "$skip_playwright" == "1" ]] && playwright_args+=(--skip-playwright)
[[ "$skip_seo" == "1" ]] && playwright_args+=(--skip-seo)

run_real zsh "${repo_root}/scripts/release/verify-health.sh" production "${playwright_args[@]}"

"${repo_root}/scripts/release/deployment-state.sh" record --env production --sha "$(run_real git rev-parse HEAD)" --note "production deployment completed" >/dev/null || true
release_log "Production deployment completed"
