#!/bin/zsh

set -euo pipefail

script_dir="$(cd "$(dirname "$0")" && pwd)"
repo_root="$(cd "${script_dir}/../.." && pwd)"
source "${script_dir}/common.sh"

mode="release"
skip_playwright=0
skip_user_e2e=0
commit_message="chore: release career_compass via develop"
repo_slug="saoki0913/career_compass"
staging_frontend_url="https://stg.shupass.jp"
staging_backend_health_url="https://stg-api.shupass.jp/health"
production_frontend_url="https://www.shupass.jp"
production_backend_health_url="https://shupass-backend-production.up.railway.app/health"
production_apex_url="https://shupass.jp"
ci_workflow="Develop CI"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --check)
      mode="preflight"
      ;;
    --preflight-only)
      mode="preflight"
      ;;
    --staging-only)
      mode="staging"
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
      echo "Usage: $0 [--check|--preflight-only|--staging-only] [--skip-playwright] [--skip-user-e2e] [--commit-message MSG]" >&2
      exit 0
      ;;
    *)
      release_die "Unknown argument: $1"
      ;;
  esac
  shift
done

require_release_dependencies() {
  require_real_binary git
  require_real_binary gh
  require_real_binary curl
  require_real_binary npm
  require_real_binary vercel
  require_real_binary railway
  require_real_binary supabase
  require_real_binary gcloud
}

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
  run_real zsh "${repo_root}/scripts/release/sync-career-compass-secrets.sh" --check
  assert_release_branch
  assert_default_branch_develop
}

run_local_gate() {
  release_log "Running local gate"
  (
    cd "$repo_root"
    npm run lint
    npm run build
    npm run test:unit
  )
}

commit_staged_changes_if_needed() {
  local staged_changes
  local unstaged_changes
  local untracked_changes

  staged_changes="$(run_real git diff --cached --name-only)"
  unstaged_changes="$(run_real git diff --name-only)"
  untracked_changes="$(run_real git ls-files --others --exclude-standard)"

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

push_develop() {
  release_log "Pushing develop to origin"
  run_real git push origin develop
  wait_for_github_workflow_success "$repo_slug" "$ci_workflow" "develop" "$(run_real git rev-parse HEAD)"
}

run_staging_checks() {
  release_log "Waiting for staging health"
  wait_for_http_ok "$staging_backend_health_url" 40 10
  wait_for_http_ok "$staging_frontend_url" 40 10
  assert_url_contains "${staging_frontend_url}" "https://stg.shupass.jp"
  assert_url_contains "${staging_frontend_url}/robots.txt" "https://stg.shupass.jp"
  assert_url_contains "${staging_frontend_url}/sitemap.xml" "https://stg.shupass.jp"
  if [[ "${skip_playwright}" != "1" ]]; then
    if [[ "${skip_user_e2e}" == "1" ]]; then
      RELEASE_CAPTURE_GOOGLE_AUTH=0 run_real zsh "${repo_root}/scripts/release/post-deploy-playwright.sh" staging
    else
      RELEASE_CAPTURE_GOOGLE_AUTH="${RELEASE_CAPTURE_GOOGLE_AUTH:-1}" run_real zsh "${repo_root}/scripts/release/post-deploy-playwright.sh" staging
    fi
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

run_production_checks() {
  release_log "Waiting for production health"
  wait_for_http_ok "$production_backend_health_url" 40 10
  wait_for_http_ok "$production_frontend_url" 40 10
  wait_for_http_ok "$production_apex_url" 20 10
  assert_url_contains "${production_frontend_url}" "https://www.shupass.jp"
  assert_url_contains "${production_frontend_url}/robots.txt" "https://www.shupass.jp"
  assert_url_contains "${production_frontend_url}/sitemap.xml" "https://www.shupass.jp"
  if [[ "${skip_playwright}" != "1" ]]; then
    RELEASE_CAPTURE_GOOGLE_AUTH="${RELEASE_CAPTURE_GOOGLE_AUTH:-1}" run_real zsh "${repo_root}/scripts/release/post-deploy-playwright.sh" production
  fi
}

require_release_dependencies
cd "$repo_root"
run_release_preflight

if [[ "$mode" == "preflight" ]]; then
  release_log "Preflight completed"
  exit 0
fi

run_local_gate
commit_staged_changes_if_needed
push_develop
run_staging_checks

if [[ "$mode" == "staging" ]]; then
  release_log "Staging flow completed"
  exit 0
fi

promote_to_main
run_production_checks
release_log "Release completed for career_compass"
