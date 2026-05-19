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

# Argument parsing
plan_target=""
cli_secret_dir=""
vercel_env_scope="production"

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
[[ "$vercel_env_scope" == "production" ]] || release_die "Invalid --vercel-env: ${vercel_env_scope}. Expected production."

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
        "${secret_dir}/staging/shared.env" \
        "${secret_dir}/staging/supabase.env"
      ;;
    supabase-production|supabase)
      merge_env_files "$tmp" \
        "${secret_dir}/production/shared.env" \
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

is_meta_key() {
  [[ "$1" == VERCEL_* || "$1" == RAILWAY_* || "$1" == GITHUB_* || "$1" == TARGET_* \
    || "$1" == SUPABASE_STAGING_PROJECT_REF || "$1" == SUPABASE_PRODUCTION_PROJECT_REF || "$1" == SUPABASE_ACCESS_TOKEN \
    || "$1" == SUPABASE_ORG_ID ]]
}

bundle_keys_sorted() {
  local file="$1"
  local key
  while IFS= read -r key || [[ -n "$key" ]]; do
    [[ -n "$key" ]] || continue
    is_meta_key "$key" && continue
    print -r -- "$key"
  done < <(iter_env_keys "$file" | sort -u)
}

require_env_value() {
  local file="$1" key="$2" value
  value="$(sed -nE "s/^[[:space:]]*(export[[:space:]]+)?(${key})[[:space:]]*=(.*)$/\3/p" "$file" | tail -n 1)" || return 1
  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"
  if [[ "$value" == \"*\" && "$value" == *\" ]]; then value="${value:1:${#value}-2}"; fi
  if [[ "$value" == \'*\' && "$value" == *\' ]]; then value="${value:1:${#value}-2}"; fi
  [[ -n "$value" ]] || release_die "${key} missing in $(basename "$file")"
  print -r -- "$value"
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
  targets=(vercel-staging vercel-production railway-staging railway-production github supabase-staging supabase-production)
  first=1
  printf '['
  for child_target in "${targets[@]}"; do
    if (( first )); then first=0; else printf ','; fi
    zsh "$0" --target "$child_target" --secret-dir "$secret_dir" --vercel-env "$vercel_env_scope"
  done
  printf ']\n'
  exit 0
fi

bundle_file="$(resolve_bundle_file "$plan_target")"
[[ -f "$bundle_file" ]] || release_die "Bundle file not found for target: ${plan_target}"
bundle_keys="$(bundle_keys_sorted "$bundle_file")"

case "$plan_target" in
  vercel-staging|vercel-production)
    project_id="$(require_env_value "$bundle_file" "VERCEL_PROJECT_ID")"
    team_id="$(require_env_value "$bundle_file" "VERCEL_TEAM_ID")"
    provider_keys="$(vercel_provider_keys_plan "$vercel_env_scope" "$project_id" "$team_id")"
    compute_plan "$bundle_keys" "$provider_keys" "$plan_target"
    ;;
  railway-staging|railway-production)
    project_id="$(require_env_value "$bundle_file" "RAILWAY_PROJECT_ID")"
    service_name="$(require_env_value "$bundle_file" "RAILWAY_SERVICE_NAME")"
    env_name="$(require_env_value "$bundle_file" "RAILWAY_ENVIRONMENT_NAME")"
    provider_keys="$(railway_provider_keys_plan "$project_id" "$service_name" "$env_name")"
    compute_plan "$bundle_keys" "$provider_keys" "$plan_target"
    ;;
  github)
    provider_keys="$(github_provider_keys_plan)"
    compute_plan "$bundle_keys" "$provider_keys" "$plan_target"
    ;;
  supabase-staging)
    project_ref="$(require_env_value "$bundle_file" "SUPABASE_STAGING_PROJECT_REF")"
    provider_keys="$(supabase_provider_keys_plan "$project_ref")"
    compute_plan "$bundle_keys" "$provider_keys" "$plan_target"
    ;;
  supabase-production|supabase)
    project_ref="$(require_env_value "$bundle_file" "SUPABASE_PRODUCTION_PROJECT_REF")"
    provider_keys="$(supabase_provider_keys_plan "$project_ref")"
    compute_plan "$bundle_keys" "$provider_keys" "$plan_target"
    ;;
  google-oauth)
    # No provider-side key list API — all bundle keys are reported as added
    compute_plan "$bundle_keys" "" "$plan_target"
    ;;
  *)
    release_die "Unsupported target for secret-plan.sh: ${plan_target}"
    ;;
esac
