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

# --- 変更統計を取得 (staged diff only) ---
NUMSTAT=$(git -C "$PROJECT_DIR" diff --cached --numstat 2>/dev/null || true)

CHANGED_FILES=$(printf '%s\n' "$NUMSTAT" | grep -cE '.' || true)
TOTAL_FILES=$CHANGED_FILES
TOTAL_LINES=$(printf '%s\n' "$NUMSTAT" | awk '$1 ~ /^[0-9]+$/ && $2 ~ /^[0-9]+$/ {sum += $1 + $2} END {print sum+0}')

HOTSPOT_HIT=""
ALL_PATHS=$(printf '%s\n' "$NUMSTAT" | awk 'NF {print $NF}')
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
  5. 回答に応じて staged diff に結び付いた checkpoint を作成:
       node scripts/harness/diff-snapshot.mjs checkpoint --kind commit-review --decision reviewed-proceed --project "$PROJECT_DIR" > $COMMIT_DELEG_FLAG
       # decision は delegate-fixes / fallback-reviewed も可
  6. 再度 git commit を実行
EOF
  exit 2
fi

# --- Check 2: JSON checkpoint + staged diff snapshot ---
DECISION=$(jq -r '.decision // empty' "$COMMIT_DELEG_FLAG" 2>/dev/null || echo "")
case "$DECISION" in
  reviewed-proceed|delegate-fixes|fallback-reviewed) ;;
  *)
    cat >&2 <<EOF
⛔ git commit をブロックしました。

commit delegation checkpoint は JSON で、decision は reviewed-proceed / delegate-fixes / fallback-reviewed のいずれかが必要です。

作成例:
  node scripts/harness/diff-snapshot.mjs checkpoint --kind commit-review --decision reviewed-proceed --project "$PROJECT_DIR" > $COMMIT_DELEG_FLAG
EOF
    exit 2
    ;;
esac

CHECKPOINT_KIND=$(jq -r '.kind // empty' "$COMMIT_DELEG_FLAG" 2>/dev/null || echo "")
if [ "$CHECKPOINT_KIND" != "commit-review" ] && [ "$CHECKPOINT_KIND" != "codex-post-review" ]; then
  cat >&2 <<EOF
⛔ git commit をブロックしました。

commit delegation checkpoint の kind は commit-review または codex-post-review である必要があります。
checkpoint=$COMMIT_DELEG_FLAG
EOF
  exit 2
fi

if ! node "$PROJECT_DIR/scripts/harness/diff-snapshot.mjs" verify --project "$PROJECT_DIR" --file "$COMMIT_DELEG_FLAG" >/dev/null; then
  cat >&2 <<EOF
⛔ git commit をブロックしました。

checkpoint 作成後に staged diff が変わりました。post_review / AskUserQuestion 確認をやり直してください。
checkpoint=$COMMIT_DELEG_FLAG
EOF
  exit 2
fi

REVIEW_REQUEST_ID=$(jq -r '.reviewRequestId // empty' "$COMMIT_DELEG_FLAG" 2>/dev/null || echo "")
REVIEW_EXECUTION_STATUS=$(jq -r '.reviewExecutionStatus // empty' "$COMMIT_DELEG_FLAG" 2>/dev/null || echo "")
REVIEW_VERDICT=$(jq -r '.reviewVerdict // empty' "$COMMIT_DELEG_FLAG" 2>/dev/null || echo "")
MAX_SEVERITY=$(jq -r '.maxSeverity // empty' "$COMMIT_DELEG_FLAG" 2>/dev/null || echo "")

if [ "$DECISION" != "fallback-reviewed" ]; then
  if [ -z "$REVIEW_REQUEST_ID" ] || [ -z "$REVIEW_EXECUTION_STATUS" ] || [ -z "$REVIEW_VERDICT" ]; then
    cat >&2 <<EOF
⛔ git commit をブロックしました。

checkpoint に reviewRequestId / reviewExecutionStatus / reviewVerdict がありません。
Codex post_review の review.json を確認し、現在の staged diff に結び付いた checkpoint を作成してください。
EOF
    exit 2
  fi

  REVIEW_DIR="$PROJECT_DIR/.claude/state/codex-handoffs/$REVIEW_REQUEST_ID"
  REVIEW_JSON="$REVIEW_DIR/review.json"
  if [ ! -f "$REVIEW_JSON" ]; then
    echo "git commit blocked: review.json not found for $REVIEW_REQUEST_ID." >&2
    exit 2
  fi

  REVIEW_JSON_EXECUTION=$(jq -r '.executionStatus // empty' "$REVIEW_JSON" 2>/dev/null || echo "")
  REVIEW_JSON_VERDICT=$(jq -r '.reviewStatus // empty' "$REVIEW_JSON" 2>/dev/null || echo "")
  REVIEW_JSON_HASH=$(jq -r '.stagedDiffHash // empty' "$REVIEW_JSON" 2>/dev/null || echo "")
  CHECKPOINT_HASH=$(jq -r '.stagedDiffHash // empty' "$COMMIT_DELEG_FLAG" 2>/dev/null || echo "")

  if [ "$REVIEW_JSON_EXECUTION" != "$REVIEW_EXECUTION_STATUS" ] || [ "$REVIEW_JSON_VERDICT" != "$REVIEW_VERDICT" ] || [ "$REVIEW_JSON_HASH" != "$CHECKPOINT_HASH" ]; then
    echo "git commit blocked: checkpoint does not match post_review artifact." >&2
    exit 2
  fi

  if [ "$REVIEW_EXECUTION_STATUS" != "SUCCESS" ]; then
    echo "git commit blocked: Codex post_review did not complete successfully. Use fallback-reviewed after Claude review." >&2
    exit 2
  fi

  if [ "$REVIEW_VERDICT" = "NEEDS_DISCUSSION" ] || { [ "$REVIEW_VERDICT" = "REQUEST_CHANGES" ] && echo "$MAX_SEVERITY" | grep -qE '^(high|critical)$'; }; then
    echo "git commit blocked: post_review requires changes or discussion before commit." >&2
    exit 2
  fi
fi

# All checks passed
exit 0
