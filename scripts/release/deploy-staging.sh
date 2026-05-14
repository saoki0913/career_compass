#!/bin/zsh
# deploy-staging.sh — staging-only deployment for career_compass
# Usage: deploy-staging.sh [--preflight-only] [--skip-local-gate] [--skip-secret-apply] [--apply-secrets]
#                           [--stage-all] [--commit-message MSG] [--skip-playwright] [--skip-user-e2e]
#
# On success, writes a checkpoint: ~/.claude/sessions/career_compass/staging-verified-<HEAD_SHA>
# Exit 0 on success, exit 1 on failure.

set -euo pipefail

script_dir="$(cd "$(dirname "$0")" && pwd)"
repo_root="$(cd "${script_dir}/../.." && pwd)"
source "${script_dir}/common.sh"

# ---- defaults ----------------------------------------------------------------
preflight_only=0
skip_local_gate=0
skip_secret_apply=0
apply_secrets=0
stage_all=0
skip_playwright=0
skip_user_e2e=0
commit_message="chore: release career_compass via develop"
repo_slug="saoki0913/career_compass"
ci_workflow="Develop CI"

# ---- arg parse ---------------------------------------------------------------
while [[ $# -gt 0 ]]; do
  case "$1" in
    --preflight-only)
      preflight_only=1
      ;;
    --skip-local-gate)
      skip_local_gate=1
      ;;
    --skip-secret-apply)
      skip_secret_apply=1
      ;;
    --apply-secrets)
      apply_secrets=1
      ;;
    --stage-all)
      stage_all=1
      ;;
    --skip-playwright)
      skip_playwright=1
      ;;
    --skip-user-e2e)
      skip_user_e2e=1
      ;;
    --commit-message)
      commit_message="${2:-}"
      shift
      ;;
    -h|--help)
      echo "Usage: $0 [--preflight-only] [--skip-local-gate] [--skip-secret-apply] [--apply-secrets] [--stage-all] [--commit-message MSG] [--skip-playwright] [--skip-user-e2e]" >&2
      exit 0
      ;;
    *)
      release_die "Unknown argument: $1"
      ;;
  esac
  shift
done

# ---- functions ---------------------------------------------------------------
assert_release_branch() {
  local current_branch
  current_branch="$(run_real git rev-parse --abbrev-ref HEAD)"
  [[ "$current_branch" == "develop" ]] || release_die "Current branch must be develop. Found: ${current_branch}"
}

assert_default_branch_develop() {
  local default_branch
  default_branch="$(run_real gh repo view "$repo_slug" --json defaultBranchRef --jq '.defaultBranchRef.name' 2>/dev/null || true)"
  [[ "$default_branch" == "develop" ]] || release_die "GitHub default branch must be develop. Found: ${default_branch:-unknown}"
}

run_release_preflight() {
  release_log "Checking provider auth"
  run_real zsh "${repo_root}/scripts/release/provider-auth-status.sh" --strict
  release_log "Checking infra bootstrap inputs"
  run_real zsh "${repo_root}/scripts/bootstrap/career-compass/bootstrap-career-compass-infra.sh" --check
  release_log "Checking provider secret inventory"
  run_real zsh "${repo_root}/scripts/release/sync-career-compass-secrets.sh" --check --target vercel-staging
  run_real zsh "${repo_root}/scripts/release/sync-career-compass-secrets.sh" --check --target railway-staging
  run_real zsh "${repo_root}/scripts/release/sync-career-compass-secrets.sh" --check --target github
  assert_release_branch
  assert_default_branch_develop
}

run_local_gate() {
  release_log "Running local gate"
  (
    cd "$repo_root"
    bash scripts/ci/run-frontend-verify.sh
    bash scripts/ci/run-backend-deterministic.sh
    npm run test:release-critical
    npx drizzle-kit check
  )
}

commit_staged_changes_if_needed() {
  local staged_changes
  local unstaged_changes
  local untracked_changes

  staged_changes="$(run_real git diff --cached --name-only)"
  unstaged_changes="$(run_real git diff --name-only)"
  untracked_changes="$(run_real git ls-files --others --exclude-standard)"

  if [[ "$stage_all" == "1" && (-n "$unstaged_changes" || -n "$untracked_changes") ]]; then
    release_log "Staging all local changes for release"
    run_real git add -A
    staged_changes="$(run_real git diff --cached --name-only)"
    unstaged_changes="$(run_real git diff --name-only)"
    untracked_changes="$(run_real git ls-files --others --exclude-standard)"
  fi

  if [[ -n "$staged_changes" ]]; then
    [[ -z "$unstaged_changes" && -z "$untracked_changes" ]] || release_die "Stage the exact release scope only. Unstaged or untracked files remain."
    release_log "Committing staged release scope"
    run_real git commit -m "$commit_message"
    return 0
  fi

  if [[ -n "$unstaged_changes" || -n "$untracked_changes" ]]; then
    release_die "Working tree is dirty but no release files are staged."
  fi
}

sync_staging_secrets() {
  if [[ "$skip_secret_apply" == "1" ]]; then
    release_warn "Skipping provider secret apply"
    return 0
  fi
  if [[ "$apply_secrets" != "1" ]]; then
    release_log "Checking staging provider secrets without applying changes"
    run_real zsh "${repo_root}/scripts/release/sync-career-compass-secrets.sh" --check --target vercel-staging
    run_real zsh "${repo_root}/scripts/release/sync-career-compass-secrets.sh" --check --target railway-staging
    run_real zsh "${repo_root}/scripts/release/sync-career-compass-secrets.sh" --check --target github
    return 0
  fi
  release_log "Applying staging provider secrets from canonical bundle"
  run_real zsh "${repo_root}/scripts/release/sync-career-compass-secrets.sh" --apply --target vercel-staging 2>&1 | redact_output
  run_real zsh "${repo_root}/scripts/release/sync-career-compass-secrets.sh" --apply --target railway-staging 2>&1 | redact_output
  run_real zsh "${repo_root}/scripts/release/sync-career-compass-secrets.sh" --apply --target github 2>&1 | redact_output
}

run_expand_migrations() {
  release_log "Checking shared production DB migrations before staging push"
  local result
  if ! result="$(node "${repo_root}/scripts/release/run-migrations.mjs" --env production --dry-run --json 2>&1)"; then
    print -r -- "$result" | redact_output
    release_die "Migration gate failed. Resolve the reported DB migration work, then rerun make deploy-staging."
  fi

  local pending
  pending="$(print -r -- "$result" | node -e "const fs=require('fs'); const j=JSON.parse(fs.readFileSync(0,'utf8')); process.stdout.write(String(j.pending || 0));")"
  if [[ "$pending" == "0" ]]; then
    release_log "No pending Drizzle migrations"
    return 0
  fi

  release_log "Applying ${pending} expand-only Drizzle migration(s) to shared production DB"
  release_log "Production-impact condition: expand-only, backward-compatible, idempotent"
  node "${repo_root}/scripts/release/run-migrations.mjs" --env production --json 2>&1 | redact_output
  "${repo_root}/scripts/release/deployment-state.sh" record-migration --env production --sha "$(run_real git rev-parse HEAD)" --pending-applied "$pending" >/dev/null || true
  release_log "Shared DB migration completed. sha=$(run_real git rev-parse HEAD), pending_applied=${pending}"
}

push_develop() {
  release_log "Pushing develop to origin"
  run_real git push origin develop
  local head_sha
  head_sha="$(run_real git rev-parse HEAD)"
  wait_for_github_workflow_success "$repo_slug" "$ci_workflow" "develop" "$head_sha"
}

write_staging_checkpoint() {
  local head_sha
  head_sha="$(run_real git rev-parse HEAD)"
  local session_dir="${HOME}/.claude/sessions/career_compass"
  mkdir -p "$session_dir"
  node "${repo_root}/scripts/harness/diff-snapshot.mjs" checkpoint \
    --kind staging-verified \
    --decision verified \
    --release-mode staging \
    --project "${repo_root}" \
    > "${session_dir}/staging-verified-${head_sha}"
  release_log "Staging checkpoint written: staging-verified-${head_sha}"
}

# ---- main flow ---------------------------------------------------------------
cd "$repo_root"
run_release_preflight

if [[ "$preflight_only" == "1" ]]; then
  release_log "Staging preflight completed"
  exit 0
fi

if [[ "$skip_local_gate" != "1" ]]; then
  run_local_gate
fi

commit_staged_changes_if_needed
run_expand_migrations
sync_staging_secrets
push_develop

playwright_args=()
[[ "$skip_playwright" == "1" ]] && playwright_args+=(--skip-playwright)
[[ "$skip_user_e2e" == "1" ]] && playwright_args+=(--skip-user-e2e)

run_real zsh "${repo_root}/scripts/release/verify-health.sh" staging "${playwright_args[@]}"

write_staging_checkpoint
"${repo_root}/scripts/release/deployment-state.sh" record --env staging --sha "$(run_real git rev-parse HEAD)" --note "staging deployment completed" >/dev/null || true
release_log "Staging deployment completed"
