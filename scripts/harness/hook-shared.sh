#!/bin/bash
# Shared hook helpers for Claude/Codex runtime gates.

if [ -n "${__CAREER_COMPASS_HOOK_SHARED_SOURCED:-}" ]; then
  return 0 2>/dev/null || exit 0
fi
__CAREER_COMPASS_HOOK_SHARED_SOURCED=1

HOTSPOT_FILES=(
  "backend/app/routers/company_info.py"
  "backend/app/routers/es_review.py"
  "backend/app/utils/llm.py"
  "src/components/companies/CorporateInfoSection.tsx"
  "src/components/es/ReviewPanel.tsx"
  "src/hooks/useESReview.ts"
  "src/lib/server/app-loaders.ts"
)

is_hotspot_path() {
  local target="${1:-}"
  [ -z "$target" ] && return 1
  local hotspot
  for hotspot in "${HOTSPOT_FILES[@]}"; do
    case "$target" in
      *"/$hotspot"|"$hotspot") return 0 ;;
    esac
  done
  return 1
}

file_line_count() {
  local target="${1:-}"
  if [ -z "$target" ] || [ ! -f "$target" ]; then
    printf '0\n'
    return 0
  fi
  awk 'END {print NR}' "$target" 2>/dev/null || printf '0\n'
}

is_oversized_file() {
  local target="${1:-}"
  local threshold="${2:-500}"
  [ -z "$target" ] && return 1
  [ ! -f "$target" ] && return 1
  local lines
  lines=$(file_line_count "$target")
  [ "$lines" -gt "$threshold" ]
}

is_codex_post_review_candidate() {
  local total_files="${1:-0}"
  local total_lines="${2:-0}"
  local hotspot_hit="${3:-}"
  [ "$total_files" -ge 10 ] && return 0
  [ "$total_lines" -ge 500 ] && return 0
  [ -n "$hotspot_hit" ] && return 0
  return 1
}

e2e_functional_state_dir() {
  local home_dir="${1:-$HOME}"
  local platform="${2:-codex}"
  local dir="${home_dir}/.${platform}/sessions/career_compass"
  mkdir -p "$dir"
  printf '%s\n' "$dir"
}

e2e_functional_query_path() {
  local file_path="${1:-}"
  local environment="${2:-local}"
  local script_dir
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
  node "${script_dir}/../ci/e2e-functional-query.mjs" --path "$file_path" --environment "$environment"
}

maybe_emit_e2e_functional_reminder() {
  local file_path="${1:-}"
  local session_id="${2:-unknown}"
  local platform="${3:-codex}"
  local home_dir="${4:-$HOME}"
  local query_json feature command
  query_json="$(e2e_functional_query_path "$file_path" "local" 2>/dev/null || true)"
  feature="$(printf '%s' "$query_json" | jq -r '.feature // empty')"
  [ -z "$feature" ] && return 0
  command="$(printf '%s' "$query_json" | jq -r '.command // empty')"
  [ -z "$command" ] && return 0

  local state_dir flag_file
  state_dir="$(e2e_functional_state_dir "$home_dir" "$platform")"
  flag_file="${state_dir}/e2e-functional-${feature}-${session_id}"
  [ -f "$flag_file" ] && return 0

  : > "$flag_file"
  cat >&2 <<EOF
AI functional file changed. Run the matching E2E before commit:
  ${command}
EOF
}
