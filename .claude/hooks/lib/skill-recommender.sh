#!/bin/bash
# Shared helpers for hooks that recommend review/refactor skills.
# 各 hook から `source` して使う。stdout は汚さない（呼び出し側で stderr に出す）。
#
# 提供するもの:
#   - HOTSPOT_FILES (array): docs/ops/AI_DEVELOPMENT_PRINCIPLES.md と同期
#   - is_hotspot_path "<path>"           — path が hotspot なら 0
#   - file_line_count "<path>"           — 行数を stdout に
#   - is_oversized_file "<path>" [thresh] — 既存ファイルが thresh 行超なら 0（既定 500）
#   - skill_session_state_dir            — セッション状態の保存先 dir を mkdir + 出力
#   - skill_state_file <session> <name>  — 状態ファイルパスを出力
#   - skill_increment_counter <file>     — counter file を +1 し新値を出力
#   - skill_touch_flag <file>            — 空 flag ファイルを作成

# guard against double-source
if [ -n "${__SKILL_RECOMMENDER_SOURCED:-}" ]; then
  return 0 2>/dev/null || exit 0
fi
__SKILL_RECOMMENDER_SOURCED=1

# Hotspot files (docs/ops/AI_DEVELOPMENT_PRINCIPLES.md と一致させる)
HOTSPOT_FILES=(
  "backend/app/routers/company_info.py"
  "backend/app/routers/es_review.py"
  "backend/app/utils/llm.py"
  "src/components/companies/CorporateInfoSection.tsx"
  "src/components/es/ReviewPanel.tsx"
  "src/hooks/useESReview.ts"
  "src/lib/server/app-loaders.ts"
)

# is_hotspot_path "<absolute or relative path>"
# path のサフィックスが HOTSPOT_FILES のいずれかと一致すれば 0
is_hotspot_path() {
  local target="${1:-}"
  [ -z "$target" ] && return 1
  local hotspot
  for hotspot in "${HOTSPOT_FILES[@]}"; do
    case "$target" in
      *"/$hotspot"|"$hotspot")
        return 0
        ;;
    esac
  done
  return 1
}

# file_line_count "<path>" — 行数を出力。読めなければ 0
file_line_count() {
  local target="${1:-}"
  if [ -z "$target" ] || [ ! -f "$target" ]; then
    printf '0\n'
    return 0
  fi
  awk 'END {print NR}' "$target" 2>/dev/null || printf '0\n'
}

# is_oversized_file "<path>" [threshold]
# 既定 500 行。既存ファイルが threshold 超なら 0
is_oversized_file() {
  local target="${1:-}"
  local threshold="${2:-500}"
  [ -z "$target" ] && return 1
  [ ! -f "$target" ] && return 1
  local lines
  lines=$(file_line_count "$target")
  [ "$lines" -gt "$threshold" ]
}

# skill_session_state_dir — career_compass セッション状態 dir を mkdir & 出力
skill_session_state_dir() {
  local dir="$HOME/.claude/sessions/career_compass"
  mkdir -p "$dir"
  printf '%s\n' "$dir"
}

# skill_state_file <session_id> <state_name>
skill_state_file() {
  local session="${1:-unknown}"
  local name="${2:-state}"
  local dir
  dir=$(skill_session_state_dir)
  printf '%s/%s-%s\n' "$dir" "$name" "$session"
}

# skill_increment_counter <file> — +1 して新値を出力
skill_increment_counter() {
  local file="${1:-}"
  [ -z "$file" ] && return 1
  local current=0
  if [ -f "$file" ]; then
    current=$(awk 'NR==1 {print int($0)}' "$file" 2>/dev/null || printf '0')
    [ -z "$current" ] && current=0
  fi
  current=$((current + 1))
  printf '%s\n' "$current" > "$file"
  printf '%s\n' "$current"
}

# skill_touch_flag <file>
skill_touch_flag() {
  local file="${1:-}"
  [ -z "$file" ] && return 1
  : > "$file"
}
