#!/bin/zsh
#
# secret-plan.sh — Compute structured JSON diff of bundle keys vs provider keys.
#
# Usage: secret-plan.sh --target <target> [--secret-dir PATH] [--vercel-env production]
#
# Outputs JSON to stdout:
#   {"target":"vercel-production","added":["KEY_A"],"modified":[],"removed":["KEY_C"],"unchanged":12}
#
# IMPORTANT: Only key NAMES are emitted — never secret values.
# "modified" is always empty because --check mode does not retrieve provider values.

set -euo pipefail

script_dir="$(cd "$(dirname "$0")/.." && pwd)"
source "${script_dir}/common.sh"
source "${script_dir}/career-compass-secrets-root.sh"
source "${script_dir}/lib/release-topology.sh"

# Argument parsing
plan_target=""
cli_secret_dir=""
vercel_env_scope="$TOPOLOGY_VERCEL_ENV_SCOPE"
SHARED_RUNTIME_KEYS=(
  INTERNAL_API_JWT_SECRET
  CAREER_PRINCIPAL_HMAC_SECRET
  TENANT_KEY_SECRET
)

while [[ $# -gt 0 ]]; do
  case "$1" in
    --target)       plan_target="${2:-}"; shift ;;
    --secret-dir)   cli_secret_dir="${2:-}"; shift ;;
    --vercel-env)   vercel_env_scope="${2:-}"; shift ;;
    -h|--help)
      print -r -- "Usage: secret-plan.sh --target <target> [--secret-dir PATH] [--vercel-env production]" >&2
      exit 0
      ;;
    *) release_die "Unknown argument: $1" ;;
  esac
  shift
done

[[ -n "$plan_target" ]] || release_die "--target is required"
[[ "$vercel_env_scope" == "$TOPOLOGY_VERCEL_ENV_SCOPE" ]] || release_die "Invalid --vercel-env: ${vercel_env_scope}. Expected ${TOPOLOGY_VERCEL_ENV_SCOPE}."
topology_is_known_target "$plan_target" || release_die "Unknown target: ${plan_target}"

# Secret dir resolution (mirrors sync-career-compass-secrets.sh)
if [[ -n "$cli_secret_dir" ]]; then
  secret_dir="$cli_secret_dir"
elif [[ -n "${CAREER_COMPASS_SECRETS_DIR:-}" ]]; then
  secret_dir="$CAREER_COMPASS_SECRETS_DIR"
elif [[ -d "${repo_root:-}/.secrets" ]]; then
  secret_dir="${repo_root}/.secrets"
else
  _plan_repo_root="$(cd "${script_dir}/../.." && pwd)"
  if [[ -d "${_plan_repo_root}/.secrets" ]]; then
    secret_dir="${_plan_repo_root}/.secrets"
  else
    secret_dir="${CAREER_COMPASS_SECRETS_ROOT_EFFECTIVE}/career_compass"
  fi
fi

google_oauth_file="${CAREER_COMPASS_SECRETS_ROOT_EFFECTIVE}/google-oauth/career_compass.env"

# Layout detection (mirrors sync script)
detect_secret_layout() {
  if [[ -d "${secret_dir}/production" || -d "${secret_dir}/staging" ]]; then
    print -r -- "subdir"
  else
    print -r -- "flat"
  fi
}

SECRET_LAYOUT="$(detect_secret_layout)"
TEMP_PLAN_FILES=()

cleanup_plan_temps() {
  local f
  for f in "${TEMP_PLAN_FILES[@]+"${TEMP_PLAN_FILES[@]}"}"; do
    rm -f "$f"
  done
}
trap cleanup_plan_temps EXIT

merge_env_files() {
  local outfile="$1"; shift
  local file
  : > "$outfile"
  for file in "$@"; do
    [[ -f "$file" ]] || continue
    cat "$file" >> "$outfile"
    printf '\n' >> "$outfile"
  done
}

resolve_bundle_file() {
  local tgt="$1"
  local tmp

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
      *) release_die "Unknown target: $tgt" ;;
    esac
    return 0
  fi

  tmp="$(mktemp /tmp/secret-plan-${tgt}.XXXXXX)"
  TEMP_PLAN_FILES+=("$tmp")
  case "$tgt" in
    vercel-staging)
      merge_env_files "$tmp" \
        "${secret_dir}/staging/shared.env" \
        "${secret_dir}/staging/nextjs.env"
      ;;
    vercel-production)
      merge_env_files "$tmp" \
        "${secret_dir}/production/shared.env" \
        "${secret_dir}/production/nextjs.env"
      ;;
    railway-staging)
      merge_env_files "$tmp" \
        "${secret_dir}/staging/shared.env" \
        "${secret_dir}/staging/fastapi.env"
      ;;
    railway-production)
      merge_env_files "$tmp" \
        "${secret_dir}/production/shared.env" \
        "${secret_dir}/production/fastapi.env"
      ;;
    github)
      merge_env_files "$tmp" "${secret_dir}/ci/github-actions.env"
      ;;
    supabase-staging)
      merge_env_files "$tmp" \
        "${secret_dir}/staging/supabase.env"
      ;;
    supabase-production|supabase)
      merge_env_files "$tmp" \
        "${secret_dir}/production/supabase.env"
      ;;
    google-oauth)
      merge_env_files "$tmp" "${secret_dir}/google-oauth.env"
      ;;
    *) release_die "Unknown target (subdir): $tgt" ;;
  esac
  print -r -- "$tmp"
}

# Key helpers (mirrors sync script)
iter_env_keys() {
  sed -nE 's/^[[:space:]]*(export[[:space:]]+)?([A-Za-z_][A-Za-z0-9_]*)[[:space:]]*=.*$/\2/p' "$1"
}

require_file() {
  [[ -f "$1" ]] || release_die "Missing required file: $1"
}

get_env_value() {
  local file="$1"
  local key="$2"
  local value=""

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

is_meta_key() {
  [[ "$1" == VERCEL_* || "$1" == RAILWAY_* || "$1" == GITHUB_* || "$1" == TARGET_* \
    || "$1" == SUPABASE_STAGING_PROJECT_REF || "$1" == SUPABASE_PRODUCTION_PROJECT_REF || "$1" == SUPABASE_ACCESS_TOKEN \
    || "$1" == SUPABASE_ORG_ID ]]
}

is_placeholder_value() {
  local value=""
  value="$(print -r -- "${1:-}" | tr '[:upper:]' '[:lower:]')"
  [[ -z "$value" ]] && return 0
  [[ "$value" == "replace_me" || "$value" == "replace-me" ]] && return 0
  [[ "$value" == "changeme" || "$value" == "change-me" ]] && return 0
  [[ "$value" == "dummy" || "$value" == "dev" || "$value" == "test" ]] && return 0
  [[ "$value" == "todo" || "$value" == "placeholder" ]] && return 0
  [[ "$value" == *xxxx* || "$value" == xxx* ]] && return 0
  return 1
}

validate_env_file() {
  local file="$1"
  local key="" value=""

  require_file "$file"
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

bundle_keys_sorted() {
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
}

require_env_value() {
  local file="$1"
  local key="$2"
  local value=""
  value="$(get_env_value "$file" "$key" 2>/dev/null || true)"
  [[ -n "$value" ]] || release_die "${key} missing in $(basename "$file")"
  print -r -- "$value"
}

require_env_keys() {
  local file="$1"
  shift
  local key=""
  require_file "$file"
  for key in "$@"; do
    require_env_value "$file" "$key" >/dev/null
  done
}

require_env_key_value() {
  local file="$1"
  local key="$2"
  local expected="$3"
  local actual=""

  actual="$(require_env_value "$file" "$key")"
  if [[ "$actual" != "$expected" ]]; then
    release_die "${key} must be ${expected} in $(basename "$file")"
  fi
}

require_env_key_prefix() {
  local file="$1"
  local key="$2"
  local prefix="$3"
  local actual=""

  actual="$(get_env_value "$file" "$key" 2>/dev/null || true)"
  is_placeholder_value "$actual" && release_die "${key} missing or placeholder value in $(basename "$file")"
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
  local left_value="" right_value=""

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

  vercel_staging="$(resolve_bundle_file vercel-staging)"
  vercel_production="$(resolve_bundle_file vercel-production)"
  require_distinct_env_key_values "$vercel_staging" VERCEL_PROJECT_ID "$vercel_production" VERCEL_PROJECT_ID "Vercel"

  railway_staging="$(resolve_bundle_file railway-staging)"
  railway_production="$(resolve_bundle_file railway-production)"
  require_distinct_env_key_values "$railway_staging" RAILWAY_PROJECT_ID "$railway_production" RAILWAY_PROJECT_ID "Railway"

  supabase_staging="$(resolve_bundle_file supabase-staging)"
  supabase_production="$(resolve_bundle_file supabase-production)"
  require_distinct_env_key_values "$supabase_staging" SUPABASE_STAGING_PROJECT_REF "$supabase_production" SUPABASE_PRODUCTION_PROJECT_REF "Supabase"
}

validate_target_runtime_contract() {
  local target_name="$1"
  local file="$2"
  local github_file=""

  case "$target_name" in
    vercel-staging)
      github_file="$(resolve_bundle_file github)"
      validate_env_file "$file"
      validate_env_keys "$github_file" "CI_E2E_AUTH_SECRET" "CI_E2E_AUTH_ENABLED" "PLAYWRIGHT_BASE_URL"
      require_env_key_value "$file" "APP_ENV" "staging"
      require_env_key_value "$file" "NEXT_PUBLIC_APP_ENV" "staging"
      require_env_keys "$file" "UPSTASH_REDIS_REST_URL" "UPSTASH_REDIS_REST_TOKEN"
      require_env_key_value "$file" "UPSTASH_REDIS_NAMESPACE" "staging"
      require_env_key_prefix "$file" "STRIPE_SECRET_KEY" "sk_test_"
      ;;
    vercel-production)
      validate_env_file "$file"
      require_env_key_value "$file" "APP_ENV" "production"
      require_env_key_value "$file" "NEXT_PUBLIC_APP_ENV" "production"
      require_env_keys "$file" "UPSTASH_REDIS_REST_URL" "UPSTASH_REDIS_REST_TOKEN"
      require_env_key_value "$file" "UPSTASH_REDIS_NAMESPACE" "production"
      require_env_key_prefix "$file" "STRIPE_SECRET_KEY" "sk_live_"
      ;;
    railway-staging)
      validate_env_file "$file"
      require_env_key_value "$file" "APP_ENV" "staging"
      require_env_key_value "$file" "RAILWAY_ENVIRONMENT_NAME" "$(topology_railway_environment_name_for_target railway-staging)"
      require_env_keys "$file" "REDIS_URL"
      require_env_key_value "$file" "REDIS_NAMESPACE" "staging"
      ;;
    railway-production)
      validate_env_file "$file"
      require_env_key_value "$file" "APP_ENV" "production"
      require_env_key_value "$file" "RAILWAY_ENVIRONMENT_NAME" "$(topology_railway_environment_name_for_target railway-production)"
      require_env_keys "$file" "REDIS_URL"
      require_env_key_value "$file" "REDIS_NAMESPACE" "production"
      ;;
    github|supabase-staging|supabase-production|supabase|google-oauth)
      validate_env_file "$file"
      ;;
  esac
}

# Provider key fetchers (key names only — no secret values)
vercel_provider_keys_plan() {
  local env_target="$1" project_id="$2" team_id="$3"
  local tmp pull_status=0

  tmp="$(mktemp "/tmp/secret-plan-vercel-${env_target}.XXXXXX")"
  TEMP_PLAN_FILES+=("$tmp")

  VERCEL_PROJECT_ID="$project_id" VERCEL_ORG_ID="$team_id" \
    vercel env pull "$tmp" --yes --environment "$env_target" \
      --cwd "${secret_dir}" --scope "$team_id" >/dev/null 2>&1 || pull_status=$?

  [[ "$pull_status" -eq 0 ]] || release_die "Could not pull Vercel ${env_target} env keys"
  iter_env_keys "$tmp" | sort -u
}

railway_provider_keys_plan() {
  local project="$1" service="$2" environment="$3" tmp_dir output

  tmp_dir="/tmp/secret-plan-railway-${service}"
  mkdir -p "$tmp_dir"
  output="$(
    cd "$tmp_dir"
    railway link --project "$project" --service "$service" \
      --environment "$environment" --json >/dev/null 2>&1
    railway variables --service "$service" --environment "$environment" \
      --json 2>/dev/null || true
  )"
  [[ -n "$output" ]] || release_die "Could not list Railway ${service}/${environment} variable keys"

  if command -v jq >/dev/null 2>&1; then
    print -r -- "$output" | jq -r \
      'if type=="array" then .[].name//empty elif type=="object" then keys[] else empty end' \
      | sort -u
  else
    print -r -- "$output" \
      | sed -nE 's/.*"name"[[:space:]]*:[[:space:]]*"([A-Za-z_][A-Za-z0-9_]*)".*/\1/p
                 s/^[[:space:]]*"([A-Za-z_][A-Za-z0-9_]*)"[[:space:]]*:.*/\1/p' \
      | sort -u
  fi
}

github_provider_keys_plan() {
  gh secret list -R "${repo_slug:-saoki0913/career_compass}" --json name \
    --jq '.[].name' 2>/dev/null \
    || release_die "Could not list GitHub Actions secret keys"
}

supabase_provider_keys_plan() {
  local project_ref="$1" output
  output="$(supabase secrets list --project-ref "$project_ref" 2>/dev/null || true)"
  [[ -n "$output" ]] || release_die "Could not list Supabase secret keys"
  print -r -- "$output" \
    | sed -nE 's/^[[:space:]]*([A-Za-z_][A-Za-z0-9_]*)[[:space:]].*$/\1/p' \
    | sort -u
}

# JSON array builder from newline-separated key names
keys_to_json_array() {
  local keys="$1"
  [[ -n "$keys" ]] || { print -r -- "[]"; return; }
  local out="[" first=1 k
  while IFS= read -r k || [[ -n "$k" ]]; do
    [[ -n "$k" ]] || continue
    k="${k//\\/\\\\}"; k="${k//\"/\\\"}"
    if (( first )); then out+="\"${k}\""; first=0
    else                 out+=",\"${k}\""; fi
  done <<< "$keys"
  out+="]"
  print -r -- "$out"
}

# Core diff: compares sorted bundle key list vs sorted provider key list.
# Outputs a single JSON object to stdout.
# "modified" is always [] — value comparison requires --apply-mode fetch not done here.
compute_plan() {
  local bundle_keys_str="$1" provider_keys_str="$2" target_name="$3"
  local added removed unchanged_count

  added="$(comm -23 \
    <(print -r -- "$bundle_keys_str" | sed '/^$/d' | sort -u) \
    <(print -r -- "$provider_keys_str" | sed '/^$/d' | sort -u) || true)"

  removed="$(comm -13 \
    <(print -r -- "$bundle_keys_str" | sed '/^$/d' | sort -u) \
    <(print -r -- "$provider_keys_str" | sed '/^$/d' | sort -u) || true)"

  unchanged_count="$(comm -12 \
    <(print -r -- "$bundle_keys_str" | sed '/^$/d' | sort -u) \
    <(print -r -- "$provider_keys_str" | sed '/^$/d' | sort -u) \
    | wc -l | tr -d ' ' || echo 0)"

  local added_json removed_json
  added_json="$(keys_to_json_array "$added")"
  removed_json="$(keys_to_json_array "$removed")"

  target_name="${target_name//\\/\\\\}"; target_name="${target_name//\"/\\\"}"
  printf '{"target":"%s","added":%s,"modified":[],"removed":%s,"unchanged":%s}\n' \
    "$target_name" "$added_json" "$removed_json" "$unchanged_count"
}

# Main dispatch
if [[ "$plan_target" == "all" ]]; then
  targets=("${TOPOLOGY_TARGETS_ALL[@]}")
  first=1
  printf '['
  for child_target in "${targets[@]}"; do
    if (( first )); then first=0; else printf ','; fi
    zsh "$0" --target "$child_target" --secret-dir "$secret_dir" --vercel-env "$vercel_env_scope"
  done
  printf ']\n'
  exit 0
fi

validate_shared_env_consistency

bundle_file="$(resolve_bundle_file "$plan_target")"
[[ -f "$bundle_file" ]] || release_die "Bundle file not found for target: ${plan_target}"
validate_target_runtime_contract "$plan_target" "$bundle_file"

case "$plan_target" in
  vercel-staging)
    bundle_keys="$(bundle_keys_sorted "$bundle_file" "CI_E2E_AUTH_SECRET" "CI_E2E_AUTH_ENABLED" "PLAYWRIGHT_BASE_URL")"
    project_id="$(require_env_value "$bundle_file" "VERCEL_PROJECT_ID")"
    team_id="$(require_env_value "$bundle_file" "VERCEL_TEAM_ID")"
    provider_keys="$(vercel_provider_keys_plan "$vercel_env_scope" "$project_id" "$team_id")"
    compute_plan "$bundle_keys" "$provider_keys" "$plan_target"
    ;;
  vercel-production)
    bundle_keys="$(bundle_keys_sorted "$bundle_file")"
    project_id="$(require_env_value "$bundle_file" "VERCEL_PROJECT_ID")"
    team_id="$(require_env_value "$bundle_file" "VERCEL_TEAM_ID")"
    provider_keys="$(vercel_provider_keys_plan "$vercel_env_scope" "$project_id" "$team_id")"
    compute_plan "$bundle_keys" "$provider_keys" "$plan_target"
    ;;
  railway-staging|railway-production)
    bundle_keys="$(bundle_keys_sorted "$bundle_file")"
    project_id="$(require_env_value "$bundle_file" "RAILWAY_PROJECT_ID")"
    service_name="$(require_env_value "$bundle_file" "RAILWAY_SERVICE_NAME")"
    env_name="$(require_env_value "$bundle_file" "RAILWAY_ENVIRONMENT_NAME")"
    provider_keys="$(railway_provider_keys_plan "$project_id" "$service_name" "$env_name")"
    compute_plan "$bundle_keys" "$provider_keys" "$plan_target"
    ;;
  github)
    bundle_keys="$(bundle_keys_sorted "$bundle_file")"
    provider_keys="$(github_provider_keys_plan)"
    compute_plan "$bundle_keys" "$provider_keys" "$plan_target"
    ;;
  supabase-staging)
    bundle_keys="$(bundle_keys_sorted "$bundle_file")"
    assert_no_forbidden_keys_in_list "Supabase staging bundle" "$bundle_keys" "${SHARED_RUNTIME_KEYS[@]}"
    project_ref="$(require_env_value "$bundle_file" "SUPABASE_STAGING_PROJECT_REF")"
    provider_keys="$(supabase_provider_keys_plan "$project_ref")"
    assert_no_forbidden_keys_in_list "Supabase provider secrets" "$provider_keys" "${SHARED_RUNTIME_KEYS[@]}"
    compute_plan "$bundle_keys" "$provider_keys" "$plan_target"
    ;;
  supabase-production|supabase)
    bundle_keys="$(bundle_keys_sorted "$bundle_file")"
    assert_no_forbidden_keys_in_list "Supabase production bundle" "$bundle_keys" "${SHARED_RUNTIME_KEYS[@]}"
    project_ref="$(require_env_value "$bundle_file" "SUPABASE_PRODUCTION_PROJECT_REF")"
    provider_keys="$(supabase_provider_keys_plan "$project_ref")"
    assert_no_forbidden_keys_in_list "Supabase provider secrets" "$provider_keys" "${SHARED_RUNTIME_KEYS[@]}"
    compute_plan "$bundle_keys" "$provider_keys" "$plan_target"
    ;;
  google-oauth)
    bundle_keys="$(bundle_keys_sorted "$bundle_file")"
    # No provider-side key list API — all bundle keys are reported as added
    compute_plan "$bundle_keys" "" "$plan_target"
    ;;
  *)
    release_die "Unsupported target for secret-plan.sh: ${plan_target}"
    ;;
esac
