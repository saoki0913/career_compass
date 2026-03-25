#!/bin/zsh

set -euo pipefail

script_dir="$(cd "$(dirname "$0")" && pwd)"
repo_root="$(cd "${script_dir}/../.." && pwd)"
source "${repo_root}/scripts/release/common.sh"

secret_file="${CODEX_COMPANY_SECRETS_ROOT:-/Users/saoki/work/codex-company/.secrets}/google-oauth/career_compass.env"
[[ -f "$secret_file" ]] || release_die "Missing secret file: ${secret_file}"

set -a
source "$secret_file"
set +a

[[ -n "${GOOGLE_CLIENT_ID:-}" ]] || release_die "GOOGLE_CLIENT_ID is missing in ${secret_file}"
[[ -n "${GOOGLE_CLIENT_SECRET:-}" ]] || release_die "GOOGLE_CLIENT_SECRET is missing in ${secret_file}"
[[ -n "${VERCEL_STAGING_PROJECT_ID:-}" ]] || release_die "VERCEL_STAGING_PROJECT_ID is missing in ${secret_file}"
[[ -n "${VERCEL_STAGING_TEAM_ID:-}" ]] || release_die "VERCEL_STAGING_TEAM_ID is missing in ${secret_file}"
[[ -n "${VERCEL_PRODUCTION_PROJECT_ID:-}" ]] || release_die "VERCEL_PRODUCTION_PROJECT_ID is missing in ${secret_file}"
[[ -n "${VERCEL_PRODUCTION_TEAM_ID:-}" ]] || release_die "VERCEL_PRODUCTION_TEAM_ID is missing in ${secret_file}"

upsert_env() {
  local key="$1"
  local value="$2"
  local project_id="$3"
  local team_id="$4"

  VERCEL_PROJECT_ID="$project_id" VERCEL_ORG_ID="$team_id" \
    run_real vercel env rm "$key" production -y --cwd "$repo_root" --scope "$team_id" >/dev/null 2>&1 || true
  VERCEL_PROJECT_ID="$project_id" VERCEL_ORG_ID="$team_id" \
    run_real vercel env add "$key" production --force --value "$value" --yes --cwd "$repo_root" --scope "$team_id" >/dev/null
}

upsert_env "GOOGLE_CLIENT_ID" "${GOOGLE_CLIENT_ID}" "${VERCEL_STAGING_PROJECT_ID}" "${VERCEL_STAGING_TEAM_ID}"
upsert_env "GOOGLE_CLIENT_SECRET" "${GOOGLE_CLIENT_SECRET}" "${VERCEL_STAGING_PROJECT_ID}" "${VERCEL_STAGING_TEAM_ID}"
upsert_env "GOOGLE_CLIENT_ID" "${GOOGLE_CLIENT_ID}" "${VERCEL_PRODUCTION_PROJECT_ID}" "${VERCEL_PRODUCTION_TEAM_ID}"
upsert_env "GOOGLE_CLIENT_SECRET" "${GOOGLE_CLIENT_SECRET}" "${VERCEL_PRODUCTION_PROJECT_ID}" "${VERCEL_PRODUCTION_TEAM_ID}"

release_log "Synced Google OAuth env to Vercel staging and production projects"
