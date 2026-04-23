#!/bin/bash
# Shared AI functional E2E reminder helper for Claude/Codex post-edit dispatchers.
set -euo pipefail

if [ -n "${__E2E_FUNCTIONAL_REMINDER_SOURCED:-}" ]; then
  return 0 2>/dev/null || exit 0
fi
__E2E_FUNCTIONAL_REMINDER_SOURCED=1

e2e_functional_state_dir() {
  local home_dir="${1:-$HOME}"
  local platform="${2:-claude}"
  local dir="${home_dir}/.${platform}/sessions/career_compass"
  mkdir -p "$dir"
  printf '%s\n' "$dir"
}

e2e_functional_query_path() {
  local file_path="${1:-}"
  local environment="${2:-local}"
  local script_dir
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
  node "${script_dir}/../../../scripts/ci/e2e-functional-query.mjs" --path "$file_path" --environment "$environment"
}

maybe_emit_e2e_functional_reminder() {
  local file_path="${1:-}"
  local session_id="${2:-unknown}"
  local platform="${3:-claude}"
  local home_dir="${4:-$HOME}"
  local query_json feature command
  query_json="$(e2e_functional_query_path "$file_path" "local" 2>/dev/null || true)"
  feature="$(printf '%s' "$query_json" | jq -r '.feature // empty')"
  if [ -z "$feature" ]; then
    return 0
  fi

  command="$(printf '%s' "$query_json" | jq -r '.command // empty')"
  if [ -z "$command" ]; then
    return 0
  fi

  local state_dir
  state_dir="$(e2e_functional_state_dir "$home_dir" "$platform")"
  local flag_file="${state_dir}/e2e-functional-${feature}-${session_id}"
  if [ -f "$flag_file" ]; then
    return 0
  fi

  : > "$flag_file"
  cat >&2 <<EOF
🧪 AI 機能ファイルを編集しました。commit 前に E2E 実行を必須にしてください:
  ${command}
EOF
}
