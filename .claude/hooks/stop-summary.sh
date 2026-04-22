#!/bin/bash
# Stop: print a short git status summary and recommend review skills if change is large.
set -euo pipefail

# shellcheck source=lib/skill-recommender.sh
. "$(dirname "$0")/lib/skill-recommender.sh"

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
BRANCH=$(git -C "$PROJECT_DIR" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")
STATUS=$(git -C "$PROJECT_DIR" status --short 2>/dev/null || true)

echo "Stop summary: branch=$BRANCH" >&2
if [ -n "$STATUS" ]; then
  echo "$STATUS" >&2
else
  echo "working tree clean" >&2
  exit 0
fi

# ─────────────────────────────────────────────────────────────
# 大規模変更検出 — maintainability-review 推奨判定
#   トリガー: ファイル数 ≥ 10  /  行数 ≥ 500  /  hotspot 変更
# ─────────────────────────────────────────────────────────────

# untracked + modified を集計（diff --numstat は untracked を含まないため別途加算）
NUMSTAT=$(git -C "$PROJECT_DIR" diff --numstat HEAD 2>/dev/null || true)
UNTRACKED=$(git -C "$PROJECT_DIR" ls-files --others --exclude-standard 2>/dev/null || true)

CHANGED_FILES=$(printf '%s\n' "$NUMSTAT" | grep -cE '.' || true)
UNTRACKED_FILES=$(printf '%s\n' "$UNTRACKED" | grep -cE '.' || true)
TOTAL_FILES=$((CHANGED_FILES + UNTRACKED_FILES))

# 変更行数（追加+削除合算、binary は - になるので除外）
TOTAL_LINES=$(printf '%s\n' "$NUMSTAT" | awk '$1 ~ /^[0-9]+$/ && $2 ~ /^[0-9]+$/ {sum += $1 + $2} END {print sum+0}')

# hotspot 変更検出
HOTSPOT_HIT=""
ALL_PATHS=$(printf '%s\n%s\n' "$NUMSTAT" "$UNTRACKED" | awk 'NF {if (NF > 1) print $NF; else print $0}')
while IFS= read -r path; do
  [ -z "$path" ] && continue
  if is_hotspot_path "$path"; then
    HOTSPOT_HIT="$path"
    break
  fi
done <<< "$ALL_PATHS"

REASONS=()
[ "$TOTAL_FILES" -ge 10 ] && REASONS+=("変更ファイル数 ${TOTAL_FILES} 件 (≥10)")
[ "$TOTAL_LINES" -ge 500 ] && REASONS+=("変更行数 ${TOTAL_LINES} 行 (≥500)")
[ -n "$HOTSPOT_HIT" ] && REASONS+=("hotspot 変更: ${HOTSPOT_HIT}")

if [ ${#REASONS[@]} -gt 0 ]; then
  echo "" >&2
  echo "📊 大規模変更を検出（maintainability-review skill 推奨）:" >&2
  for reason in "${REASONS[@]}"; do
    echo "  - $reason" >&2
  done
  cat >&2 <<'EOF'

  推奨フロー:
    1. maintainability-review skill で保守性厳格レビュー（findings-only）
    2. 重大指摘があれば improvement-plan skill で施策化
    3. hotspot ファイルに継ぎ足したなら refactoring-specialist skill で分離計画

  AI_DEVELOPMENT_PRINCIPLES.md: 「とりあえず動く」より「後から直しやすい」を優先。
EOF
fi

exit 0
