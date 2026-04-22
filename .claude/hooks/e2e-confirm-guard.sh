#!/bin/bash
# PreToolUse (Bash): local E2E 実行前に AskUserQuestion 確認を強制。
# CLAUDE.md Section B-2 Step 4 を機械的に enforce する。
set -euo pipefail

INPUT=$(cat)
CMD=$(echo "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null || echo "")
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // empty' 2>/dev/null || echo "")

if [ -z "$CMD" ]; then exit 0; fi

IS_LOCAL_E2E=false
if echo "$CMD" | grep -qE '(^|[;&|])\s*make\s+(test-e2e-functional-local|ai-live-local)\b'; then
  IS_LOCAL_E2E=true
elif echo "$CMD" | grep -qF 'run-ai-live-local.sh'; then
  IS_LOCAL_E2E=true
fi

if [ "$IS_LOCAL_E2E" = false ]; then exit 0; fi

if [ -z "$SESSION_ID" ]; then
  echo "⛔ local E2E: session_id 不明。AskUserQuestion で確認してから再実行。" >&2
  exit 2
fi

STATE_DIR="$HOME/.claude/sessions/career_compass"
mkdir -p "$STATE_DIR"
FLAG="$STATE_DIR/e2e-confirm-$SESSION_ID"

if [ ! -f "$FLAG" ]; then
  cat >&2 <<EOF
⛔ local E2E テスト実行をブロック: AskUserQuestion 確認が未完了。

手順:
  1. AskUserQuestion で features / 推定時間 / LLM Judge 有無を提示し確認
  2. echo "<features>" > $FLAG  (all / カンマ区切り / skip)
  3. E2E コマンドを再実行
EOF
  exit 2
fi

CONTENT=$(tr -d '[:space:]' < "$FLAG" 2>/dev/null || echo "")
if [ -z "$CONTENT" ]; then
  echo "⛔ checkpoint が空。AskUserQuestion で確認し直してください。" >&2
  exit 2
fi

if [ "$CONTENT" = "skip" ]; then
  echo "⛔ ユーザーが E2E スキップを選択済み。E2E を実行せず commit に進んでください。" >&2
  exit 2
fi

exit 0
