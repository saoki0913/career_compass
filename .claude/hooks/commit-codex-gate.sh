#!/bin/bash
# PreToolUse(Bash): `git commit` を検出し、大規模変更時に
# post_review + delegation 確認 (CLAUDE.md §B) を機械的に強制する。
# checkpoint が未設定 / 不正 / stale のいずれかならブロック。
set -euo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
# shellcheck source=lib/skill-recommender.sh
. "$PROJECT_DIR/.claude/hooks/lib/skill-recommender.sh"

INPUT=$(cat)
CMD=$(echo "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null || echo "")
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // empty' 2>/dev/null || echo "")

# Bash 呼び出しでない / command が空 → 素通り
if [ -z "$CMD" ]; then
  exit 0
fi

# `git commit` を含まないコマンドは素通り
if ! echo "$CMD" | grep -qE '(^|[^a-zA-Z_])git[[:space:]]+commit'; then
  exit 0
fi

# --- 変更統計を取得 (tracked diff + untracked) ---
NUMSTAT=$(git -C "$PROJECT_DIR" diff --numstat HEAD 2>/dev/null || true)
UNTRACKED=$(git -C "$PROJECT_DIR" ls-files --others --exclude-standard 2>/dev/null || true)

CHANGED_FILES=$(printf '%s\n' "$NUMSTAT" | grep -cE '.' || true)
UNTRACKED_FILES=$(printf '%s\n' "$UNTRACKED" | grep -cE '.' || true)
TOTAL_FILES=$((CHANGED_FILES + UNTRACKED_FILES))
TOTAL_LINES=$(printf '%s\n' "$NUMSTAT" | awk '$1 ~ /^[0-9]+$/ && $2 ~ /^[0-9]+$/ {sum += $1 + $2} END {print sum+0}')

HOTSPOT_HIT=""
ALL_PATHS=$(printf '%s\n%s\n' "$NUMSTAT" "$UNTRACKED" | awk 'NF {if (NF > 1) print $NF; else print $0}')
while IFS= read -r path; do
  [ -z "$path" ] && continue
  if is_hotspot_path "$path"; then
    HOTSPOT_HIT="$path"
    break
  fi
done <<< "$ALL_PATHS"

# --- 閾値未満なら素通り (SSOT: lib/skill-recommender.sh) ---
if ! is_codex_post_review_candidate "$TOTAL_FILES" "$TOTAL_LINES" "$HOTSPOT_HIT"; then
  exit 0
fi

# --- 閾値以上: checkpoint を検証 ---
if [ -z "$SESSION_ID" ]; then
  cat >&2 <<'EOF'
⛔ git commit をブロックしました。

session_id を取得できず、commit delegation checkpoint を検証できません。
CLAUDE.md §B (大規模変更時の post_review + delegation) に従って
AskUserQuestion で確認し、checkpoint を作成してください。
EOF
  exit 2
fi

STATE_DIR="$HOME/.claude/sessions/career_compass"
mkdir -p "$STATE_DIR"
COMMIT_DELEG_FLAG="$STATE_DIR/codex-commit-delegation-$SESSION_ID"

# --- Check 1: checkpoint 存在確認 ---
if [ ! -f "$COMMIT_DELEG_FLAG" ]; then
  cat >&2 <<EOF
⛔ git commit をブロックしました。

大規模変更 (files=$TOTAL_FILES, lines=$TOTAL_LINES${HOTSPOT_HIT:+, hotspot=$HOTSPOT_HIT}) のため
CLAUDE.md §B の Codex post_review + delegation 確認が必要です。

手順:
  1. bash scripts/codex/delegate.sh post_review を実行
  2. 最新 handoff: ls -td $PROJECT_DIR/.claude/state/codex-handoffs/post_review-*/ | head -1
  3. meta.json の status と result.md を確認
  4. AskUserQuestion で以下を提示:
       - post_review の status / 主要 findings
       - 選択肢: 「commit 続行」「Codex に修正委譲」「Claude fallback」
  5. 回答に応じて checkpoint を作成:
       echo "reviewed-proceed"  > $COMMIT_DELEG_FLAG   # commit 続行
       echo "delegate-fixes"    > $COMMIT_DELEG_FLAG   # Codex に修正委譲してから
       echo "fallback-reviewed" > $COMMIT_DELEG_FLAG   # post_review 失敗 → Claude fallback
  6. 再度 git commit を実行
EOF
  exit 2
fi

# --- Check 2: 内容バリデーション (skip-review は廃止) ---
CONTENT=$(tr -d '[:space:]' < "$COMMIT_DELEG_FLAG" 2>/dev/null || echo "")
case "$CONTENT" in
  reviewed-proceed|delegate-fixes|fallback-reviewed) ;;
  *)
    cat >&2 <<EOF
⛔ git commit をブロックしました。

commit delegation checkpoint の内容が不正: "$CONTENT"
許可値: reviewed-proceed / delegate-fixes / fallback-reviewed
(skip-review は廃止されました)

手順: 削除して AskUserQuestion 経由で作り直してください:
  rm $COMMIT_DELEG_FLAG
  echo "<decision>" > $COMMIT_DELEG_FLAG
EOF
    exit 2
    ;;
esac

# --- Check 3: stale 検出 (最新 post_review handoff より前の checkpoint は拒否) ---
# fallback-reviewed は Codex post_review が失敗した場合用のため stale 照合を免除。
if [ "$CONTENT" != "fallback-reviewed" ]; then
  LATEST_PR=$(ls -td "$PROJECT_DIR"/.claude/state/codex-handoffs/post_review-*/meta.json 2>/dev/null | head -1)
  if [ -n "$LATEST_PR" ]; then
    PR_MTIME=$(stat -f %m "$LATEST_PR" 2>/dev/null || echo 0)
    CP_MTIME=$(stat -f %m "$COMMIT_DELEG_FLAG" 2>/dev/null || echo 0)
    if [ "$CP_MTIME" -le "$PR_MTIME" ]; then
      cat >&2 <<EOF
⛔ git commit をブロックしました (stale checkpoint)。

commit delegation checkpoint が最新の post_review handoff より古いです。
ancient checkpoint の再利用を防止するためブロックします。

latest_post_review=$LATEST_PR
  post_review_mtime=$PR_MTIME
  checkpoint_mtime=$CP_MTIME

手順: 削除して AskUserQuestion 経由で作り直してください:
  rm $COMMIT_DELEG_FLAG
  # AskUserQuestion で commit 続行 or 修正委譲を確認
  echo "<decision>" > $COMMIT_DELEG_FLAG
EOF
      exit 2
    fi
  fi
fi

# All checks passed
exit 0
