#!/bin/zsh

set -euo pipefail

script_dir="$(cd "$(dirname "$0")" && pwd)"
repo_root="$(cd "${script_dir}/../.." && pwd)"
source "${script_dir}/common.sh"

mode="check"
target="all"
secret_dir="${CODEX_COMPANY_SECRETS_ROOT:-/Users/saoki/work/codex-company/.secrets}/career_compass"
google_oauth_file="${CODEX_COMPANY_SECRETS_ROOT:-/Users/saoki/work/codex-company/.secrets}/google-oauth/career_compass.env"
repo_slug="saoki0913/career_compass"

usage() {
  cat <<'EOF'
Usage: sync-career-compass-secrets.sh [--check|--apply] [--target all|vercel-staging|vercel-production|railway-staging|railway-production|github|supabase|google-oauth] [--secret-dir PATH]
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --check)
      mode="check"
      ;;
    --apply)
      mode="apply"
      ;;
    --target)
      target="${2:-}"
      shift
      ;;
    --secret-dir)
      secret_dir="${2:-}"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      release_die "Unknown argument: $1"
      ;;
  esac
  shift
done

require_file() {
  [[ -f "$1" ]] || release_die "Missing required file: $1"
}

should_run_target() {
  [[ "$target" == "all" || "$target" == "$1" ]]
}

load_env_file() {
  local file="$1"
  set -a
  source "$file"
  set +a
}

iter_env_keys() {
  grep -E '^[A-Za-z_][A-Za-z0-9_]*=' "$1" | cut -d= -f1
}

is_meta_key() {
  [[ "$1" == VERCEL_* || "$1" == RAILWAY_* || "$1" == GITHUB_* || "$1" == TARGET_* || "$1" == SUPABASE_* ]]
}

is_placeholder_value() {
  [[ -z "$1" || "$1" == "replace_me" ]]
}

validate_env_file() {
  local file="$1"
  local key value

  require_file "$file"
  load_env_file "$file"
  while IFS= read -r key; do
    [[ -n "$key" ]] || continue
    is_meta_key "$key" && continue
    value="${(P)key:-}"
    is_placeholder_value "$value" && release_die "${key} missing or replace_me in $(basename "$file")"
  done < <(iter_env_keys "$file")
}

vercel_upsert_env_file() {
  local file="$1"
  local env_target="$2"
  local project_id="$3"
  local team_id="$4"
  local preview_git_branch="${5:-}"
  local key value

  validate_env_file "$file"
  while IFS= read -r key; do
    [[ -n "$key" ]] || continue
    is_meta_key "$key" && continue
    value="${(P)key}"
    if [[ "$env_target" == "preview" && -n "$preview_git_branch" ]]; then
      VERCEL_PROJECT_ID="$project_id" VERCEL_ORG_ID="$team_id" \
        run_real vercel env rm "$key" preview "$preview_git_branch" -y --cwd "$repo_root" --scope "$team_id" >/dev/null 2>&1 || true
      VERCEL_PROJECT_ID="$project_id" VERCEL_ORG_ID="$team_id" \
        run_real vercel env add "$key" preview "$preview_git_branch" --force --value "$value" --yes --cwd "$repo_root" --scope "$team_id" >/dev/null
    else
      VERCEL_PROJECT_ID="$project_id" VERCEL_ORG_ID="$team_id" \
        run_real vercel env rm "$key" "$env_target" -y --cwd "$repo_root" --scope "$team_id" >/dev/null 2>&1 || true
      VERCEL_PROJECT_ID="$project_id" VERCEL_ORG_ID="$team_id" \
        run_real vercel env add "$key" "$env_target" --force --value "$value" --yes --cwd "$repo_root" --scope "$team_id" >/dev/null
    fi
  done < <(iter_env_keys "$file")
}

railway_apply_env_file() {
  local file="$1"
  local project="$2"
  local service="$3"
  local environment="$4"
  local temp_dir key value

  validate_env_file "$file"
  temp_dir="/tmp/career-compass-railway-${service}"
  mkdir -p "$temp_dir"
  (
    cd "$temp_dir"
    run_real railway link --project "$project" --service "$service" --environment "$environment" --json >/dev/null
    while IFS= read -r key; do
      [[ -n "$key" ]] || continue
      is_meta_key "$key" && continue
      value="${(P)key}"
      run_real railway variable set "${key}=${value}" --service "$service" --environment "$environment" --skip-deploys >/dev/null
    done < <(iter_env_keys "$file")
  )
}

apply_supabase_bundle() {
  local file="$1"
  local pairs=()
  local key value

  validate_env_file "$file"
  while IFS= read -r key; do
    [[ -n "$key" ]] || continue
    [[ "$key" == SUPABASE_ACCESS_TOKEN || "$key" == SUPABASE_ORG_ID ]] && continue
    value="${(P)key}"
    pairs+=("${key}=${value}")
  done < <(iter_env_keys "$file")

  (( ${#pairs[@]} > 0 )) || release_die "No Supabase secrets to apply"
  run_real supabase secrets set --project-ref "$SUPABASE_PRODUCTION_PROJECT_REF" "${pairs[@]}" >/dev/null
}

apply_google_oauth_env() {
  validate_env_file "$google_oauth_file"
  run_real zsh "${repo_root}/scripts/auth/import-google-oauth-to-vercel.sh"
}

if should_run_target "vercel-staging"; then
  staging_file="${secret_dir}/vercel-staging.env"
  validate_env_file "$staging_file"
  if [[ "$mode" == "apply" ]]; then
    release_log "Applying Vercel staging env"
    vercel_upsert_env_file "$staging_file" production "$VERCEL_PROJECT_ID" "$VERCEL_TEAM_ID"
    vercel_upsert_env_file "$staging_file" preview "$VERCEL_PROJECT_ID" "$VERCEL_TEAM_ID" "develop"
  else
    release_log "Checked Vercel staging env"
  fi
fi

if should_run_target "vercel-production"; then
  production_file="${secret_dir}/vercel-production.env"
  validate_env_file "$production_file"
  if [[ "$mode" == "apply" ]]; then
    release_log "Applying Vercel production env"
    vercel_upsert_env_file "$production_file" production "$VERCEL_PROJECT_ID" "$VERCEL_TEAM_ID"
    vercel_upsert_env_file "$production_file" preview "$VERCEL_PROJECT_ID" "$VERCEL_TEAM_ID" "develop"
  else
    release_log "Checked Vercel production env"
  fi
fi

if should_run_target "railway-staging"; then
  railway_staging_file="${secret_dir}/railway-staging.env"
  validate_env_file "$railway_staging_file"
  if [[ "$mode" == "apply" ]]; then
    release_log "Applying Railway staging env"
    railway_apply_env_file "$railway_staging_file" "$RAILWAY_PROJECT_ID" "$RAILWAY_SERVICE_NAME" "$RAILWAY_ENVIRONMENT_NAME"
  else
    release_log "Checked Railway staging env"
  fi
fi

if should_run_target "railway-production"; then
  railway_production_file="${secret_dir}/railway-production.env"
  validate_env_file "$railway_production_file"
  if [[ "$mode" == "apply" ]]; then
    release_log "Applying Railway production env"
    railway_apply_env_file "$railway_production_file" "$RAILWAY_PROJECT_ID" "$RAILWAY_SERVICE_NAME" "$RAILWAY_ENVIRONMENT_NAME"
  else
    release_log "Checked Railway production env"
  fi
fi

if should_run_target "github" && [[ -f "${secret_dir}/github-actions.env" ]]; then
  github_file="${secret_dir}/github-actions.env"
  validate_env_file "$github_file"
  if [[ "$mode" == "apply" ]]; then
    release_log "Applying GitHub Actions env"
    run_real gh secret set -R "$repo_slug" -f "$github_file" >/dev/null
  else
    release_log "Checked GitHub Actions env"
  fi
fi

if should_run_target "supabase"; then
  supabase_file="${secret_dir}/supabase.env"
  validate_env_file "$supabase_file"
  if [[ "$mode" == "apply" ]]; then
    release_log "Applying Supabase secrets"
    apply_supabase_bundle "$supabase_file"
  else
    release_log "Checked Supabase bootstrap env"
  fi
fi

if should_run_target "google-oauth" && [[ -f "$google_oauth_file" ]]; then
  validate_env_file "$google_oauth_file"
  if [[ "$mode" == "apply" ]]; then
    release_log "Applying Google OAuth env to Vercel"
    apply_google_oauth_env
  else
    release_log "Checked Google OAuth env"
  fi
fi

release_log "Done (${mode})"
