#!/bin/zsh
#
# Sync provider env from the canonical secrets bundle.
#
# SSOT resolution (highest priority first):
#   1. --secret-dir PATH
#   2. CAREER_COMPASS_SECRETS_DIR env var
#   3. ${repo_root}/.secrets  (project-local, primary SSOT)
#   4. ${CAREER_COMPASS_SECRETS_ROOT_EFFECTIVE}/career_compass  (codex-company fallback)

set -euo pipefail

script_dir="$(cd "$(dirname "$0")" && pwd)"
repo_root="$(cd "${script_dir}/../.." && pwd)"
source "${script_dir}/common.sh"
# shellcheck source=career-compass-secrets-root.sh
source "${script_dir}/career-compass-secrets-root.sh"
# shellcheck source=lib/release-topology.sh
source "${script_dir}/lib/release-topology.sh"

mode="check"
target="all"
vercel_env_scope="$TOPOLOGY_VERCEL_ENV_SCOPE"
cli_secret_dir=""
repo_slug="saoki0913/career_compass"
check_provider_drift=1
output_json=0

usage() {
  cat <<'EOF'
Usage: sync-career-compass-secrets.sh [--check|--apply] [--target all|vercel-staging|vercel-production|railway-staging|railway-production|github|supabase-staging|supabase-production|supabase|google-oauth] [--vercel-env production] [--secret-dir PATH] [--skip-provider-drift] [--json]

Secrets bundle (Vercel/Railway/supabase env files):
  Primary: ${repo_root}/.secrets (project-local SSOT)
  Fallback: ${CODEX_COMPANY_SECRETS_ROOT}/career_compass (codex-company)
  Override: CAREER_COMPASS_SECRETS_DIR or --secret-dir

Google OAuth file: <same secrets root>/google-oauth/career_compass.env

Vercel env scope is production-only. The staging project uses its own Vercel Production environment.
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
    --vercel-env)
      vercel_env_scope="${2:-}"
      shift
      ;;
    --secret-dir)
      cli_secret_dir="${2:-}"
      shift
      ;;
    --skip-provider-drift)
      check_provider_drift=0
      ;;
    --json)
      output_json=1
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

case "$vercel_env_scope" in
  "$TOPOLOGY_VERCEL_ENV_SCOPE") ;;
  *) release_die "Invalid --vercel-env: ${vercel_env_scope}. Expected ${TOPOLOGY_VERCEL_ENV_SCOPE}." ;;
esac
topology_is_known_target "$target" || release_die "Unknown target: ${target}"
if [[ "$mode" == "apply" && "$target" == "supabase" ]]; then
  release_die "Use --target supabase-production or --target supabase-staging for apply. Legacy --target supabase is check-only."
fi

if [[ -n "$cli_secret_dir" ]]; then
  secret_dir="$cli_secret_dir"
elif [[ -n "${CAREER_COMPASS_SECRETS_DIR:-}" ]]; then
  secret_dir="$CAREER_COMPASS_SECRETS_DIR"
elif [[ -d "${repo_root}/.secrets" ]]; then
  secret_dir="${repo_root}/.secrets"
else
  secret_dir="${CAREER_COMPASS_SECRETS_ROOT_EFFECTIVE}/career_compass"
fi
google_oauth_file="${CAREER_COMPASS_SECRETS_ROOT_EFFECTIVE}/google-oauth/career_compass.env"

# Detect bundle layout.
# Subdirectory layout: .secrets/production/ and .secrets/staging/ subdirs (repo-local).
# Flat layout: files directly under secret_dir (codex-company convention).
detect_secret_layout() {
  if [[ -d "${secret_dir}/production" || -d "${secret_dir}/staging" ]]; then
    print -r -- "subdir"
  else
    print -r -- "flat"
  fi
}

SECRET_LAYOUT="$(detect_secret_layout)"

# Merge env files into a temp file (subdir layout only).
# Later files override earlier ones for duplicate keys.
merge_env_files() {
  local outfile="$1"
  shift
  local file
  : > "$outfile"
  for file in "$@"; do
    [[ -f "$file" ]] || continue
    cat "$file" >> "$outfile"
    printf "\\n" >> "$outfile"
  done
}

# Resolve the bundle file for a given target, accounting for layout.
# For flat layout: returns the existing flat file path.
# For subdir layout: merges component files into a temp file and returns it.
TEMP_BUNDLE_FILES=()
SHARED_RUNTIME_KEYS=(
  INTERNAL_API_JWT_SECRET
  CAREER_PRINCIPAL_HMAC_SECRET
  TENANT_KEY_SECRET
)

resolve_bundle_file() {
  local tgt="$1"
  local temp_file

  if [[ "$SECRET_LAYOUT" == "flat" ]]; then
    case "$tgt" in
      vercel-staging)     print -r -- "${secret_dir}/vercel-staging.env" ;;
      vercel-production)  print -r -- "${secret_dir}/vercel-production.env" ;;
      railway-staging)    print -r -- "${secret_dir}/railway-staging.env" ;;
      railway-production) print -r -- "${secret_dir}/railway-production.env" ;;
      github)             print -r -- "${secret_dir}/github-actions.env" ;;
      supabase-staging)   print -r -- "${secret_dir}/supabase-staging.env" ;;
      supabase-production|supabase) print -r -- "${secret_dir}/supabase.env" ;;
      google-oauth)       print -r -- "${google_oauth_file}" ;;
      *) release_die "Unknown target for resolve_bundle_file: $tgt" ;;
    esac
    return 0
  fi

  # Subdirectory layout: merge component env files into a temp file
  temp_file="$(mktemp /tmp/career-compass-bundle-${tgt}.XXXXXX)"
  TEMP_BUNDLE_FILES+=("$temp_file")
  case "$tgt" in
    vercel-staging)
      merge_env_files "$temp_file" \
        "${secret_dir}/staging/shared.env" \
        "${secret_dir}/staging/nextjs.env"
      ;;
    vercel-production)
      merge_env_files "$temp_file" \
        "${secret_dir}/production/shared.env" \
        "${secret_dir}/production/nextjs.env"
      ;;
    railway-staging)
      merge_env_files "$temp_file" \
        "${secret_dir}/staging/shared.env" \
        "${secret_dir}/staging/fastapi.env"
      ;;
    railway-production)
      merge_env_files "$temp_file" \
        "${secret_dir}/production/shared.env" \
        "${secret_dir}/production/fastapi.env"
      ;;
    github)
      merge_env_files "$temp_file" \
        "${secret_dir}/ci/github-actions.env"
      ;;
    supabase-staging)
      merge_env_files "$temp_file" \
        "${secret_dir}/staging/supabase.env"
      ;;
    supabase-production|supabase)
      merge_env_files "$temp_file" \
        "${secret_dir}/production/supabase.env"
      ;;
    google-oauth)
      merge_env_files "$temp_file" \
        "${secret_dir}/google-oauth.env"
      ;;
    *) release_die "Unknown target for resolve_bundle_file (subdir): $tgt" ;;
  esac
  print -r -- "$temp_file"
}

# Validate that cross-service variables are defined only in shared.env.
env_key_exists() {
  local file="$1"
  local key="$2"
  [[ -f "$file" ]] || return 1
  iter_env_keys "$file" | grep -Fxq "$key"
}

validate_shared_env_consistency() {
  [[ "$SECRET_LAYOUT" == "subdir" ]] || return 0
  local env_name=""
  for env_name in staging production; do
    local shared_file="${secret_dir}/${env_name}/shared.env"
    local nextjs_file="${secret_dir}/${env_name}/nextjs.env"
    local fastapi_file="${secret_dir}/${env_name}/fastapi.env"
    if [[ ! -f "$shared_file" ]]; then
      if [[ -f "$nextjs_file" || -f "$fastapi_file" ]]; then
        release_die "${env_name}: shared.env が必要です。共有変数は shared.env だけに定義してください"
      fi
      continue
    fi
    local required_shared_key=""
    for required_shared_key in "${SHARED_RUNTIME_KEYS[@]}"; do
      if ! env_key_exists "$shared_file" "$required_shared_key"; then
        release_die "${env_name}: ${required_shared_key} は shared.env に定義してください"
      fi
      if env_key_exists "$nextjs_file" "$required_shared_key" || env_key_exists "$fastapi_file" "$required_shared_key"; then
        release_die "${env_name}: ${required_shared_key} は shared.env だけに定義してください。nextjs.env / fastapi.env への重複定義は禁止です"
      fi
    done
    local shared_key=""
    while IFS= read -r shared_key || [[ -n "$shared_key" ]]; do
      [[ -n "$shared_key" ]] || continue
      if env_key_exists "$nextjs_file" "$shared_key" || env_key_exists "$fastapi_file" "$shared_key"; then
        release_die "${env_name}: ${shared_key} は shared.env だけに定義してください。nextjs.env / fastapi.env への重複定義は禁止です"
      fi
    done < <(iter_env_keys "$shared_file")
  done
  release_log "Cross-service shared variable consistency: OK"
}

# Cleanup temp bundle files on exit
cleanup_temp_bundles() {
  local f
  for f in "${TEMP_BUNDLE_FILES[@]+"${TEMP_BUNDLE_FILES[@]}"}"; do
    rm -f "$f"
  done
}
trap cleanup_temp_bundles EXIT

require_file() {
  [[ -f "$1" ]] || release_die "Missing required file: $1"
}

should_run_target() {
  [[ "$target" == "all" || "$target" == "$1" ]]
}

should_run_vercel_env() {
  [[ "$vercel_env_scope" == "$1" ]]
}

load_env_file() {
  return 0
}

iter_env_keys() {
  sed -nE 's/^[[:space:]]*(export[[:space:]]+)?([A-Za-z_][A-Za-z0-9_]*)[[:space:]]*=.*$/\2/p' "$1"
}

get_env_value() {
  local file="$1"
  local key="$2"
  local value

  value="$(sed -nE "s/^[[:space:]]*(export[[:space:]]+)?(${key})[[:space:]]*=(.*)$/\\3/p" "$file" | tail -n 1)" || return 1
  [[ -n "$value" ]] || return 1

  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"

  if [[ "$value" == \"*\" && "$value" == *\" ]]; then
    value="${value:1:${#value}-2}"
  elif [[ "$value" == \'*\' && "$value" == *\' ]]; then
    value="${value:1:${#value}-2}"
  fi

  print -r -- "$value"
}

validate_shared_env_consistency

require_env_value() {
  local file="$1"
  local key="$2"
  local value

  value="$(get_env_value "$file" "$key" 2>/dev/null || true)"
  [[ -n "$value" ]] || release_die "${key} missing in $(basename "$file")"
  print -r -- "$value"
}

is_meta_key() {
  [[ "$1" == VERCEL_* || "$1" == RAILWAY_* || "$1" == GITHUB_* || "$1" == TARGET_* || "$1" == SUPABASE_STAGING_PROJECT_REF || "$1" == SUPABASE_PRODUCTION_PROJECT_REF || "$1" == SUPABASE_ACCESS_TOKEN || "$1" == SUPABASE_ORG_ID ]]
}

is_placeholder_value() {
  local value
  value="$(print -r -- "${1:-}" | tr '[:upper:]' '[:lower:]')"
  [[ -z "$value" ]] && return 0
  [[ "$value" == "replace_me" || "$value" == "replace-me" ]] && return 0
  [[ "$value" == "changeme" || "$value" == "change-me" ]] && return 0
  [[ "$value" == "dummy" || "$value" == "dev" || "$value" == "test" ]] && return 0
  [[ "$value" == "todo" || "$value" == "placeholder" ]] && return 0
  [[ "$value" == *xxxx* || "$value" == xxx* ]] && return 0
  return 1
}

is_sensitive_key() {
  case "$1" in
    DATABASE_URL|DIRECT_URL) return 0 ;;
    *SECRET*|*_KEY|*_TOKEN) return 0 ;;
    ENCRYPTION_KEY) return 0 ;;
    NEXT_PUBLIC_*) return 1 ;;
  esac
  return 1
}

sensitive_flag_for_key() {
  if is_sensitive_key "$1"; then
    print -r -- "--sensitive"
  fi
}

bundle_keys_for_file() {
  local file="$1"
  shift || true
  local key

  while IFS= read -r key || [[ -n "$key" ]]; do
    [[ -n "$key" ]] || continue
    is_meta_key "$key" && continue
    print -r -- "$key"
  done < <(iter_env_keys "$file" | sort -u)
  for key in "$@"; do
    [[ -n "$key" ]] || continue
    print -r -- "$key"
  done
}

report_key_drift() {
  local label="$1"
  local bundle_keys="$2"
  local provider_keys="$3"
  local missing unexpected

  missing="$(comm -23 <(print -r -- "$bundle_keys" | sed '/^$/d' | sort -u) <(print -r -- "$provider_keys" | sed '/^$/d' | sort -u) || true)"
  unexpected="$(comm -13 <(print -r -- "$bundle_keys" | sed '/^$/d' | sort -u) <(print -r -- "$provider_keys" | sed '/^$/d' | sort -u) || true)"

  if [[ -n "$missing" || -n "$unexpected" ]]; then
    [[ -z "$missing" ]] || release_warn "${label} missing provider keys: $(print -r -- "$missing" | paste -sd ',' -)"
    [[ -z "$unexpected" ]] || release_warn "${label} unexpected provider keys: $(print -r -- "$unexpected" | paste -sd ',' -)"
    [[ -z "$missing" ]] || release_die "${label} provider key drift detected"
  fi

  release_log "Checked ${label} provider key drift"
}

assert_no_forbidden_keys_in_list() {
  local label="$1"
  local keys="$2"
  shift 2
  local forbidden=""

  for forbidden in "$@"; do
    if print -r -- "$keys" | grep -Fxq "$forbidden"; then
      release_die "${label} must not contain ${forbidden}"
    fi
  done
}

assert_no_forbidden_keys_in_file() {
  local file="$1"
  local label="$2"
  shift 2
  require_file "$file"
  assert_no_forbidden_keys_in_list "$label" "$(iter_env_keys "$file" | sort -u)" "$@"
}

vercel_provider_keys() {
  local env_target="$1"
  local project_id="$2"
  local team_id="$3"
  local temp_file
  local pull_status

  temp_file="$(mktemp "/tmp/career-compass-vercel-env-${env_target}.XXXXXX")" || release_die "Could not create temp file for Vercel env pull"
  if VERCEL_PROJECT_ID="$project_id" VERCEL_ORG_ID="$team_id" \
    run_real vercel env pull "$temp_file" --yes --environment "$env_target" --cwd "$repo_root" --scope "$team_id" >/dev/null 2>&1; then
    pull_status=0
  else
    pull_status=$?
  fi

  if [[ "$pull_status" -ne 0 ]]; then
    rm -f "$temp_file"
    release_die "Could not pull Vercel ${env_target} env keys"
  fi

  iter_env_keys "$temp_file" | sort -u
  rm -f "$temp_file"
}

check_vercel_key_drift() {
  local file="$1"
  local label="$2"
  local env_target="$3"
  local project_id="$4"
  local team_id="$5"

  shift 5
  report_key_drift "$label" "$(bundle_keys_for_file "$file" "$@")" "$(vercel_provider_keys "$env_target" "$project_id" "$team_id")"
}

railway_provider_keys() {
  local project="$1"
  local service="$2"
  local environment="$3"
  local temp_dir output

  temp_dir="/tmp/career-compass-railway-drift-${service}"
  mkdir -p "$temp_dir"
  output="$(
    cd "$temp_dir"
    run_real railway link --project "$project" --service "$service" --environment "$environment" --json >/dev/null
    run_real railway variables --service "$service" --environment "$environment" --json 2>/dev/null || true
  )"

  [[ -n "$output" ]] || release_die "Could not list Railway ${service}/${environment} variable keys"
  if command -v jq >/dev/null 2>&1; then
    print -r -- "$output" | jq -r 'if type == "array" then .[].name // empty elif type == "object" then keys[] else empty end' | sort -u
  else
    print -r -- "$output" | sed -nE 's/.*"name"[[:space:]]*:[[:space:]]*"([A-Za-z_][A-Za-z0-9_]*)".*/\1/p; s/^[[:space:]]*"([A-Za-z_][A-Za-z0-9_]*)"[[:space:]]*:.*/\1/p' | sort -u
  fi
}

check_railway_key_drift() {
  local file="$1"
  local label="$2"
  local project="$3"
  local service="$4"
  local environment="$5"
  report_key_drift "$label" "$(bundle_keys_for_file "$file")" "$(railway_provider_keys "$project" "$service" "$environment")"
}

github_provider_keys() {
  run_real gh secret list -R "$repo_slug" --json name --jq '.[].name' 2>/dev/null || release_die "Could not list GitHub Actions secret keys"
}

check_github_key_drift() {
  local file="$1"
  report_key_drift "GitHub Actions" "$(bundle_keys_for_file "$file")" "$(github_provider_keys)"
}

supabase_provider_keys() {
  local project_ref="$1"
  local output

  output="$(run_real supabase secrets list --project-ref "$project_ref" 2>/dev/null || true)"
  [[ -n "$output" ]] || release_die "Could not list Supabase secret keys"
  print -r -- "$output" | sed -nE 's/^[[:space:]]*([A-Za-z_][A-Za-z0-9_]*)[[:space:]].*$/\1/p' | sort -u
}

check_supabase_key_drift() {
  local file="$1"
  local project_ref="$2"
  local provider_keys

  provider_keys="$(supabase_provider_keys "$project_ref")"
  assert_no_forbidden_keys_in_list "Supabase provider secrets" "$provider_keys" "${SHARED_RUNTIME_KEYS[@]}"
  report_key_drift "Supabase" "$(bundle_keys_for_file "$file")" "$provider_keys"
}

validate_env_file() {
  local file="$1"
  local key value

  require_file "$file"
  load_env_file "$file"
  while IFS= read -r key || [[ -n "$key" ]]; do
    [[ -n "$key" ]] || continue
    is_meta_key "$key" && continue
    value="$(get_env_value "$file" "$key" 2>/dev/null || true)"
    is_placeholder_value "$value" && release_die "${key} missing or placeholder value in $(basename "$file")"
  done < <(iter_env_keys "$file")
}

validate_env_keys() {
  local file="$1"
  shift
  local key="" value=""

  require_file "$file"
  for key in "$@"; do
    value="$(get_env_value "$file" "$key" 2>/dev/null || true)"
    is_placeholder_value "$value" && release_die "${key} missing or placeholder value in $(basename "$file")"
  done
}

require_env_keys() {
  local file="$1"
  shift
  local key
  require_file "$file"
  for key in "$@"; do
    require_env_value "$file" "$key" >/dev/null
  done
}

require_env_key_value() {
  local file="$1"
  local key="$2"
  local expected="$3"
  local actual

  actual="$(require_env_value "$file" "$key")"
  if [[ "$actual" != "$expected" ]]; then
    release_die "${key} must be ${expected} in $(basename "$file")"
  fi
}

warn_if_env_key_exists() {
  local file="$1"
  local key="$2"
  local label="$3"
  if env_key_exists "$file" "$key"; then
    release_warn "${label}: ${key} is retired and should be removed from provider secrets"
  fi
}

require_env_key_prefix() {
  local file="$1"
  local key="$2"
  local prefix="$3"
  local actual

  actual="$(require_env_value "$file" "$key")"
  if [[ "$actual" != ${prefix}* ]]; then
    release_die "${key} must start with ${prefix} in $(basename "$file")"
  fi
}

require_distinct_env_key_values() {
  local left_file="$1"
  local left_key="$2"
  local right_file="$3"
  local right_key="$4"
  local label="$5"
  local left_value right_value

  [[ -f "$left_file" && -f "$right_file" ]] || return 0
  left_value="$(get_env_value "$left_file" "$left_key" 2>/dev/null || true)"
  right_value="$(get_env_value "$right_file" "$right_key" 2>/dev/null || true)"
  [[ -n "$left_value" && -n "$right_value" ]] || return 0
  if [[ "$left_value" == "$right_value" ]]; then
    release_die "${label} must use separate staging and production projects"
  fi
}

validate_provider_project_separation() {
  local vercel_staging vercel_production railway_staging railway_production supabase_staging supabase_production

  if should_run_target "vercel-staging" || should_run_target "vercel-production"; then
    vercel_staging="$(resolve_bundle_file vercel-staging)"
    vercel_production="$(resolve_bundle_file vercel-production)"
    require_distinct_env_key_values "$vercel_staging" VERCEL_PROJECT_ID "$vercel_production" VERCEL_PROJECT_ID "Vercel"
  fi

  if should_run_target "railway-staging" || should_run_target "railway-production"; then
    railway_staging="$(resolve_bundle_file railway-staging)"
    railway_production="$(resolve_bundle_file railway-production)"
    require_distinct_env_key_values "$railway_staging" RAILWAY_PROJECT_ID "$railway_production" RAILWAY_PROJECT_ID "Railway"
  fi

  if should_run_target "supabase-staging" || should_run_target "supabase-production"; then
    supabase_staging="$(resolve_bundle_file supabase-staging)"
    supabase_production="$(resolve_bundle_file supabase-production)"
    require_distinct_env_key_values "$supabase_staging" SUPABASE_STAGING_PROJECT_REF "$supabase_production" SUPABASE_PRODUCTION_PROJECT_REF "Supabase"
  fi
}

validate_target_runtime_contracts() {
  local file github_file

  if should_run_target "vercel-staging"; then
    file="$(resolve_bundle_file vercel-staging)"
    github_file="$(resolve_bundle_file github)"
    validate_env_file "$file"
    validate_env_keys "$github_file" "CI_E2E_AUTH_SECRET" "CI_E2E_AUTH_ENABLED" "PLAYWRIGHT_BASE_URL"
    require_env_key_value "$file" "APP_ENV" "staging"
    require_env_key_value "$file" "NEXT_PUBLIC_APP_ENV" "staging"
    require_env_keys "$file" "UPSTASH_REDIS_REST_URL" "UPSTASH_REDIS_REST_TOKEN"
    require_env_key_value "$file" "UPSTASH_REDIS_NAMESPACE" "staging"
    require_env_key_prefix "$file" "STRIPE_SECRET_KEY" "sk_test_"
    warn_if_env_key_exists "$file" "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY" "Vercel staging"
    warn_if_env_key_exists "$file" "NEXT_PUBLIC_LOGO_DEV_TOKEN" "Vercel staging"
    warn_if_env_key_exists "$file" "NEXT_PUBLIC_BRANDFETCH_CLIENT_ID" "Vercel staging"
  fi

  if should_run_target "vercel-production"; then
    file="$(resolve_bundle_file vercel-production)"
    validate_env_file "$file"
    require_env_key_value "$file" "APP_ENV" "production"
    require_env_key_value "$file" "NEXT_PUBLIC_APP_ENV" "production"
    require_env_keys "$file" "UPSTASH_REDIS_REST_URL" "UPSTASH_REDIS_REST_TOKEN"
    require_env_key_value "$file" "UPSTASH_REDIS_NAMESPACE" "production"
    require_env_key_prefix "$file" "STRIPE_SECRET_KEY" "sk_live_"
    warn_if_env_key_exists "$file" "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY" "Vercel production"
    warn_if_env_key_exists "$file" "NEXT_PUBLIC_LOGO_DEV_TOKEN" "Vercel production"
    warn_if_env_key_exists "$file" "NEXT_PUBLIC_BRANDFETCH_CLIENT_ID" "Vercel production"
  fi

  if should_run_target "railway-staging"; then
    file="$(resolve_bundle_file railway-staging)"
    validate_env_file "$file"
    require_env_key_value "$file" "APP_ENV" "staging"
    require_env_key_value "$file" "RAILWAY_ENVIRONMENT_NAME" "$(topology_railway_environment_name_for_target railway-staging)"
    require_env_keys "$file" "REDIS_URL"
    require_env_key_value "$file" "REDIS_NAMESPACE" "staging"
  fi

  if should_run_target "railway-production"; then
    file="$(resolve_bundle_file railway-production)"
    validate_env_file "$file"
    require_env_key_value "$file" "APP_ENV" "production"
    require_env_key_value "$file" "RAILWAY_ENVIRONMENT_NAME" "$(topology_railway_environment_name_for_target railway-production)"
    require_env_keys "$file" "REDIS_URL"
    require_env_key_value "$file" "REDIS_NAMESPACE" "production"
  fi

  if should_run_target "github"; then
    file="$(resolve_bundle_file github)"
    validate_env_file "$file"
  fi

  if should_run_target "supabase-staging"; then
    file="$(resolve_bundle_file supabase-staging)"
    validate_env_file "$file"
    assert_no_forbidden_keys_in_file "$file" "Supabase staging bundle" "${SHARED_RUNTIME_KEYS[@]}"
  fi

  if should_run_target "supabase-production"; then
    file="$(resolve_bundle_file supabase-production)"
    validate_env_file "$file"
    assert_no_forbidden_keys_in_file "$file" "Supabase production bundle" "${SHARED_RUNTIME_KEYS[@]}"
  fi

  if should_run_target "google-oauth"; then
    file="$(resolve_bundle_file google-oauth)"
    validate_env_file "$file"
  fi

  validate_provider_project_separation
}

vercel_upsert_env_file() {
  local file="$1"
  local env_target="$2"
  local project_id="$3"
  local team_id="$4"
  local key value sens_flag

  validate_env_file "$file"
  while IFS= read -r key || [[ -n "$key" ]]; do
    [[ -n "$key" ]] || continue
    is_meta_key "$key" && continue
    value="$(get_env_value "$file" "$key")"
    sens_flag="$(sensitive_flag_for_key "$key")"
    VERCEL_PROJECT_ID="$project_id" VERCEL_ORG_ID="$team_id" \
      run_real vercel env rm "$key" "$env_target" -y --cwd "$repo_root" --scope "$team_id" >/dev/null 2>&1 </dev/null || true
    print -rn -- "$value" | VERCEL_PROJECT_ID="$project_id" VERCEL_ORG_ID="$team_id" \
      run_real vercel env add "$key" "$env_target" --force ${sens_flag} --yes --cwd "$repo_root" --scope "$team_id" >/dev/null
  done < <(iter_env_keys "$file")
}

vercel_upsert_selected_keys_from_file() {
  local file="$1"
  local env_target="$2"
  local project_id="$3"
  local team_id="$4"
  shift 4
  local key value sens_flag

  [[ -f "$file" ]] || release_die "Missing required file: $file"

  for key in "$@"; do
    value="$(get_env_value "$file" "$key" 2>/dev/null || true)"
    [[ -n "$value" ]] || release_die "${key} missing in $(basename "$file")"
    sens_flag="$(sensitive_flag_for_key "$key")"
    VERCEL_PROJECT_ID="$project_id" VERCEL_ORG_ID="$team_id" \
      run_real vercel env rm "$key" "$env_target" -y --cwd "$repo_root" --scope "$team_id" >/dev/null 2>&1 </dev/null || true
    print -rn -- "$value" | VERCEL_PROJECT_ID="$project_id" VERCEL_ORG_ID="$team_id" \
      run_real vercel env add "$key" "$env_target" --force ${sens_flag} --yes --cwd "$repo_root" --scope "$team_id" >/dev/null
  done
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
    while IFS= read -r key || [[ -n "$key" ]]; do
      [[ -n "$key" ]] || continue
      is_meta_key "$key" && continue
      value="$(get_env_value "$file" "$key")"
      print -rn -- "$value" | run_real railway variable set "$key" --service "$service" --environment "$environment" --skip-deploys --stdin >/dev/null
    done < <(iter_env_keys "$file")
  )
}

apply_supabase_bundle() {
  local file="$1"
  local project_ref="$2"
  local key value temp_file supabase_bin key_count rc

  validate_env_file "$file"
  assert_no_forbidden_keys_in_file "$file" "Supabase bundle" "${SHARED_RUNTIME_KEYS[@]}"
  temp_file="$(mktemp /tmp/career-compass-supabase-secrets.XXXXXX)"
  chmod 600 "$temp_file"
  key_count=0
  while IFS= read -r key || [[ -n "$key" ]]; do
    [[ -n "$key" ]] || continue
    is_meta_key "$key" && continue
    value="$(get_env_value "$file" "$key")"
    printf '%s=%s\n' "$key" "$value" >> "$temp_file"
    (( key_count += 1 ))
  done < <(iter_env_keys "$file")

  if (( key_count == 0 )); then
    rm -f "$temp_file"
    release_log "No Supabase runtime secrets to apply"
    return 0
  fi
  release_log "exec: supabase secrets set --project-ref ${project_ref} --env-file [REDACTED ${key_count} keys]"
  supabase_bin="$(find_real_binary supabase)"
  if [[ -z "$supabase_bin" ]]; then
    rm -f "$temp_file"
    release_die "Missing command: supabase"
  fi
  set +e
  "$supabase_bin" secrets set --project-ref "$project_ref" --env-file "$temp_file" >/dev/null
  rc=$?
  set -e
  rm -f "$temp_file"
  return "$rc"
}

apply_google_oauth_env() {
  validate_env_file "$google_oauth_file"
  run_real zsh "${repo_root}/scripts/auth/import-google-oauth-to-vercel.sh"
}

validate_target_runtime_contracts

# --check --json: delegate to secret-plan.sh which outputs structured JSON to stdout
# after local bundle invariants have been checked.
if [[ "$mode" == "check" && "$output_json" == "1" ]]; then
  plan_args=(--target "$target" --secret-dir "$secret_dir" --vercel-env "$vercel_env_scope")
  exec zsh "${script_dir}/lib/secret-plan.sh" "${plan_args[@]}"
fi

if should_run_target "vercel-staging"; then
  staging_file="$(resolve_bundle_file vercel-staging)"
  github_file="$(resolve_bundle_file github)"
  staging_project_id="$(require_env_value "$staging_file" "VERCEL_PROJECT_ID")"
  staging_team_id="$(require_env_value "$staging_file" "VERCEL_TEAM_ID")"
  validate_env_file "$staging_file"
  require_env_keys "$staging_file" "APP_ENV" "NEXT_PUBLIC_APP_ENV"
  if [[ "$mode" == "apply" ]]; then
    release_log "Applying Vercel staging env"
    if should_run_vercel_env "production"; then
      vercel_upsert_env_file "$staging_file" production "$staging_project_id" "$staging_team_id"
    fi
    release_log "Overlaying staging test-auth env from github-actions bundle"
    if should_run_vercel_env "production"; then
      vercel_upsert_selected_keys_from_file \
        "$github_file" \
        production \
        "$staging_project_id" \
        "$staging_team_id" \
        "CI_E2E_AUTH_SECRET" \
        "CI_E2E_AUTH_ENABLED" \
        "PLAYWRIGHT_BASE_URL"
    fi
  else
    release_log "Checked Vercel staging env"
    if [[ "$check_provider_drift" == "1" ]]; then
      if should_run_vercel_env "production"; then
        check_vercel_key_drift "$staging_file" "Vercel staging production" production "$staging_project_id" "$staging_team_id" \
          "CI_E2E_AUTH_SECRET" "CI_E2E_AUTH_ENABLED" "PLAYWRIGHT_BASE_URL"
      fi
    fi
  fi
fi

if should_run_target "vercel-production"; then
  production_file="$(resolve_bundle_file vercel-production)"
  production_project_id="$(require_env_value "$production_file" "VERCEL_PROJECT_ID")"
  production_team_id="$(require_env_value "$production_file" "VERCEL_TEAM_ID")"
  validate_env_file "$production_file"
  require_env_keys "$production_file" "APP_ENV" "NEXT_PUBLIC_APP_ENV"
  if [[ "$mode" == "apply" ]]; then
    release_log "Applying Vercel production env"
    if should_run_vercel_env "production"; then
      vercel_upsert_env_file "$production_file" production "$production_project_id" "$production_team_id"
    fi
  else
    release_log "Checked Vercel production env"
    if [[ "$check_provider_drift" == "1" ]]; then
      if should_run_vercel_env "production"; then
        check_vercel_key_drift "$production_file" "Vercel production" production "$production_project_id" "$production_team_id"
      fi
    fi
  fi
fi

if should_run_target "railway-staging"; then
  railway_staging_file="$(resolve_bundle_file railway-staging)"
  railway_staging_project_id="$(require_env_value "$railway_staging_file" "RAILWAY_PROJECT_ID")"
  railway_staging_service_name="$(require_env_value "$railway_staging_file" "RAILWAY_SERVICE_NAME")"
  railway_staging_environment_name="$(require_env_value "$railway_staging_file" "RAILWAY_ENVIRONMENT_NAME")"
  validate_env_file "$railway_staging_file"
  require_env_keys "$railway_staging_file" "APP_ENV"
  if [[ "$mode" == "apply" ]]; then
    release_log "Applying Railway staging env"
    railway_apply_env_file "$railway_staging_file" "$railway_staging_project_id" "$railway_staging_service_name" "$railway_staging_environment_name"
  else
    release_log "Checked Railway staging env"
    if [[ "$check_provider_drift" == "1" ]]; then
      check_railway_key_drift "$railway_staging_file" "Railway staging" "$railway_staging_project_id" "$railway_staging_service_name" "$railway_staging_environment_name"
    fi
  fi
fi

if should_run_target "railway-production"; then
  railway_production_file="$(resolve_bundle_file railway-production)"
  railway_production_project_id="$(require_env_value "$railway_production_file" "RAILWAY_PROJECT_ID")"
  railway_production_service_name="$(require_env_value "$railway_production_file" "RAILWAY_SERVICE_NAME")"
  railway_production_environment_name="$(require_env_value "$railway_production_file" "RAILWAY_ENVIRONMENT_NAME")"
  validate_env_file "$railway_production_file"
  require_env_keys "$railway_production_file" "APP_ENV"
  if [[ "$mode" == "apply" ]]; then
    release_log "Applying Railway production env"
    railway_apply_env_file "$railway_production_file" "$railway_production_project_id" "$railway_production_service_name" "$railway_production_environment_name"
  else
    release_log "Checked Railway production env"
    if [[ "$check_provider_drift" == "1" ]]; then
      check_railway_key_drift "$railway_production_file" "Railway production" "$railway_production_project_id" "$railway_production_service_name" "$railway_production_environment_name"
    fi
  fi
fi

if should_run_target "github"; then
  github_file="$(resolve_bundle_file github)"
  validate_env_file "$github_file"
  if [[ "$mode" == "apply" ]]; then
    release_log "Applying GitHub Actions env"
    gh_bin="$(find_real_binary gh)"
    [[ -n "$gh_bin" ]] || release_die "Missing command: gh"
    while IFS= read -r key || [[ -n "$key" ]]; do
      [[ -n "$key" ]] || continue
      is_meta_key "$key" && continue
      value="$(get_env_value "$github_file" "$key")"
      release_log "exec: gh secret set ${key} -R ${repo_slug} [REDACTED stdin]"
      print -rn -- "$value" | "$gh_bin" secret set "$key" -R "$repo_slug" >/dev/null
    done < <(iter_env_keys "$github_file")
  else
    release_log "Checked GitHub Actions env"
    if [[ "$check_provider_drift" == "1" ]]; then
      check_github_key_drift "$github_file"
    fi
  fi
fi

if should_run_target "supabase-staging"; then
  supabase_staging_file="$(resolve_bundle_file supabase-staging)"
  supabase_staging_project_ref="$(require_env_value "$supabase_staging_file" "SUPABASE_STAGING_PROJECT_REF")"
  validate_env_file "$supabase_staging_file"
  assert_no_forbidden_keys_in_file "$supabase_staging_file" "Supabase staging bundle" "${SHARED_RUNTIME_KEYS[@]}"
  if [[ "$mode" == "apply" ]]; then
    release_log "Applying Supabase staging secrets"
    apply_supabase_bundle "$supabase_staging_file" "$supabase_staging_project_ref"
  else
    release_log "Checked Supabase staging bootstrap env"
    if [[ "$check_provider_drift" == "1" ]]; then
      check_supabase_key_drift "$supabase_staging_file" "$supabase_staging_project_ref"
    fi
  fi
fi

if should_run_target "supabase-production" || should_run_target "supabase"; then
  supabase_file="$(resolve_bundle_file supabase-production)"
  supabase_production_project_ref="$(require_env_value "$supabase_file" "SUPABASE_PRODUCTION_PROJECT_REF")"
  validate_env_file "$supabase_file"
  assert_no_forbidden_keys_in_file "$supabase_file" "Supabase production bundle" "${SHARED_RUNTIME_KEYS[@]}"
  if [[ "$mode" == "apply" ]]; then
    release_log "Applying Supabase production secrets"
    apply_supabase_bundle "$supabase_file" "$supabase_production_project_ref"
  else
    release_log "Checked Supabase production bootstrap env"
    if [[ "$check_provider_drift" == "1" ]]; then
      check_supabase_key_drift "$supabase_file" "$supabase_production_project_ref"
    fi
  fi
fi

if should_run_target "google-oauth"; then
  google_oauth_file="$(resolve_bundle_file google-oauth)"
  validate_env_file "$google_oauth_file"
  if [[ "$mode" == "apply" ]]; then
    release_log "Applying Google OAuth env to Vercel"
    apply_google_oauth_env
  else
    release_log "Checked Google OAuth env"
  fi
fi

release_log "Done (${mode})"
