#!/usr/bin/env bash

set -euo pipefail

script_path="${BASH_SOURCE[0]:-$0}"
script_dir="$(cd "$(dirname "$script_path")" && pwd)"

# shellcheck source=../release/career-compass-secrets-root.sh
source "${script_dir}/../release/career-compass-secrets-root.sh"

github_actions_file="${CAREER_COMPASS_SECRETS_ROOT_EFFECTIVE}/career_compass/github-actions.env"
prefer_bundle="${CI_SECRETS_PREFER_BUNDLE:-0}"

if [[ ! -f "$github_actions_file" ]]; then
  exit 0
fi

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

  printf '%s\n' "$value"
}

load_if_missing() {
  local key="$1"
  local value
  local current_value="${!key:-}"
  value="$(get_env_value "$github_actions_file" "$key" 2>/dev/null || true)"
  [[ -n "$value" ]] || return 0

  if [[ "$prefer_bundle" != "1" && -n "$current_value" ]]; then
    return 0
  fi

  if [[ "$current_value" != "$value" ]]; then
    export "$key=$value"
    if [[ "$prefer_bundle" == "1" && -n "$current_value" ]]; then
      echo "[ci-secrets] replaced ${key} from secrets bundle" >&2
    else
      echo "[ci-secrets] loaded ${key} from secrets bundle" >&2
    fi
  fi
}

load_if_missing "CI_E2E_AUTH_SECRET"
load_if_missing "OPENAI_API_KEY"
load_if_missing "ANTHROPIC_API_KEY"
load_if_missing "GOOGLE_API_KEY"
load_if_missing "FIRECRAWL_API_KEY"
