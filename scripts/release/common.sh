#!/bin/zsh

set -euo pipefail

release_log() {
  printf '[release] %s\n' "$1" >&2
}

release_warn() {
  printf '[release][warn] %s\n' "$1" >&2
}

release_die() {
  printf '[release][error] %s\n' "$1" >&2
  exit 1
}

find_real_binary() {
  local target="$1"
  local cleaned=""
  local part

  IFS=':' read -r -A path_parts <<< "${PATH:-}"
  for part in "${path_parts[@]}"; do
    if [[ -z "$part" || "$part" == *"/tools/cli-safe/bin" ]]; then
      continue
    fi
    if [[ -n "$cleaned" ]]; then
      cleaned="${cleaned}:"
    fi
    cleaned="${cleaned}${part}"
  done

  PATH="$cleaned" command -v "$target" 2>/dev/null || true
}

require_real_binary() {
  local target="$1"
  local real_bin

  real_bin="$(find_real_binary "$target")"
  [[ -n "$real_bin" ]] || release_die "Missing command: ${target}"
}

run_real() {
  local target="$1"
  shift
  local real_bin

  real_bin="$(find_real_binary "$target")"
  [[ -n "$real_bin" ]] || release_die "Missing command: ${target}"
  release_log "exec: ${target} $*"
  "$real_bin" "$@"
}

release_repo_root() {
  local script_path="$1"
  cd "$(dirname "$script_path")/../.." && pwd
}

wait_for_http_ok() {
  local url="$1"
  local attempts="${2:-30}"
  local delay="${3:-10}"
  local http_code=""
  local idx

  for idx in $(seq 1 "$attempts"); do
    http_code="$(run_real curl -s -o /dev/null -w '%{http_code}' --max-time 15 "$url" || true)"
    if [[ "$http_code" == 2* || "$http_code" == 3* ]]; then
      return 0
    fi
    if [[ "$idx" -lt "$attempts" ]]; then
      sleep "$delay"
    fi
  done

  release_die "HTTP check failed for ${url}. Last status: ${http_code:-unknown}"
}

assert_url_contains() {
  local url="$1"
  local pattern="$2"
  local body

  body="$(run_real curl -sL --max-time 20 "$url" || true)"
  print -r -- "$body" | rg -Fq "$pattern" || release_die "Expected '${pattern}' in ${url}"
}

wait_for_github_workflow_success() {
  local repo_slug="$1"
  local workflow_name="$2"
  local branch_name="$3"
  local expected_sha="$4"
  local run_id=""
  local idx

  for idx in $(seq 1 30); do
    run_id="$(
      run_real gh run list \
        --repo "$repo_slug" \
        --workflow "$workflow_name" \
        --branch "$branch_name" \
        --limit 20 \
        --json databaseId,headSha \
        --jq ".[] | select(.headSha == \"${expected_sha}\") | .databaseId" | head -n 1
    )"

    if [[ -n "$run_id" ]]; then
      run_real gh run watch "$run_id" --repo "$repo_slug" --exit-status
      return 0
    fi

    sleep 10
  done

  release_die "Could not find workflow '${workflow_name}' for ${expected_sha}"
}

wait_for_pr_merge() {
  local pr_number="$1"
  local state=""

  while true; do
    state="$(run_real gh pr view "$pr_number" --json state --jq '.state')"
    if [[ "$state" == "MERGED" ]]; then
      return 0
    fi
    sleep 5
  done
}

has_npm_script() {
  local script_name="$1"
  npm run | rg -q "^[[:space:]]+${script_name}$|^[[:space:]]+${script_name}[[:space:]]"
}
