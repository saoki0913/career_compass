#!/bin/bash
# PreToolUse(Bash): delegate.sh plan_review の実行前に
# AskUserQuestion での確認を機械的に強制する。
# checkpoint が未設定ならブロック（exit 2）。
set -euo pipefail

INPUT=$(cat)
CMD=$(printf '%s' "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null || echo "")
SESSION_ID=$(printf '%s' "$INPUT" | jq -r '.session_id // empty' 2>/dev/null || echo "")

if [ -z "$CMD" ]; then
  exit 0
fi

# git commit のメッセージ内に delegate.sh が含まれる場合の false positive を回避
if printf '%s' "$CMD" | grep -qE '^[[:space:]]*git[[:space:]]'; then
  exit 0
fi

# delegate.sh のモードを抽出
MODE=""
if printf '%s' "$CMD" | grep -qE 'delegate\.sh[[:space:]]+plan_review'; then
  MODE="plan_review"
fi

if [ -z "$MODE" ]; then
  exit 0
fi

if [ -z "$SESSION_ID" ]; then
  echo "delegate.sh $MODE blocked: session_id not available for checkpoint verification." >&2
  exit 2
fi

STATE_DIR="$HOME/.claude/sessions/career_compass"
mkdir -p "$STATE_DIR"
CHECKPOINT="$STATE_DIR/codex-${MODE//_/-}-approved-$SESSION_ID"

if [ -f "$CHECKPOINT" ]; then
  exit 0
fi

case "$MODE" in
  plan_review)
    cat >&2 <<EOF
⛔ delegate.sh plan_review をブロックしました。

CLAUDE.md §A に従い、Codex plan review の実行前に AskUserQuestion で
ユーザー確認が必要です。

手順:
  1. AskUserQuestion で「Codex plan review を実行しますか？」と確認
     - プラン内容のサマリを提示
     - 選択肢: 「実行する」「スキップ」
  2. ユーザーが承認したら:
     echo "approved" > $CHECKPOINT
  3. delegate.sh plan_review を再実行
EOF
    ;;
esac

exit 2
