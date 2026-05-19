#!/bin/bash
# PreToolUse (Edit|Write): プロンプトファイル変更後の AskUserQuestion 確認を強制する。
# post-edit-dispatcher.sh が prompt-review-pending フラグを作成 → このフックが次の Edit/Write をブロック。
set -euo pipefail

INPUT=$(cat)
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // empty')
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"

if [ -z "$SESSION_ID" ]; then
  exit 0
fi

STATE_DIR="$HOME/.claude/sessions/career_compass"
PENDING_FLAG="$STATE_DIR/prompt-review-pending-$SESSION_ID"
CONFIRMED_FLAG="$STATE_DIR/prompt-review-confirmed-$SESSION_ID"

if [ ! -f "$PENDING_FLAG" ]; then
  exit 0
fi

if [ -f "$CONFIRMED_FLAG" ]; then
  PENDING_MTIME=$(stat -f %m "$PENDING_FLAG" 2>/dev/null || echo 0)
  CONFIRMED_MTIME=$(stat -f %m "$CONFIRMED_FLAG" 2>/dev/null || echo 0)
  if [ "$CONFIRMED_MTIME" -gt "$PENDING_MTIME" ]; then
    exit 0
  fi
fi

EDITED_FILE=$(head -1 "$PENDING_FLAG" 2>/dev/null || echo "(unknown)")

# shellcheck source=../../scripts/harness/guard-runtime.sh
. "$PROJECT_DIR/scripts/harness/guard-runtime.sh"
GR_HOOK=prompt-edit-confirm-guard
gr_init "$INPUT" claude
gr_enforce high "プロンプト/LLM ファイルの変更確認が未完了です。
${EDITED_FILE} が変更されました。コミット前に決定的プロンプトテストと AI 出力品質レビューを記録してください。
推奨: AskUserQuestion で変更点・理由・出力影響を提示し、確認後 touch $CONFIRMED_FLAG。
commit 時の prompt-quality ゲート / /codex:review / CI が最終ゲートです。"
