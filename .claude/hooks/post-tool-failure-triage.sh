#!/bin/bash
# PostToolUseFailure: add lightweight next-step hints after failed tools.
set -euo pipefail

INPUT=$(cat)
TOOL=$(echo "$INPUT" | jq -r '.tool_name // empty')
ERROR_TEXT=$(echo "$INPUT" | jq -r '.error // empty')

if [ -z "$TOOL" ] || [ -z "$ERROR_TEXT" ]; then
  exit 0
fi

CONTEXT=""

if [ "$TOOL" = "Bash" ]; then
  CMD=$(echo "$INPUT" | jq -r '.tool_input.command // empty')
  if printf '%s' "$ERROR_TEXT" | grep -qiE 'sandbox|permission|operation not permitted|not permitted'; then
    CONTEXT="この Bash 失敗は sandbox / permission 起因の可能性があります。同じコマンドを無限に再試行せず、必要なら escalated permissions を要求してください。"
  elif printf '%s' "$ERROR_TEXT" | grep -qiE 'ENOTFOUND|EAI_AGAIN|network|temporary failure'; then
    CONTEXT="この Bash 失敗は network 起因の可能性があります。依存取得や remote access が必要なら escalated permissions を検討してください。"
  elif printf '%s' "$CMD" | grep -qiE 'npm run test|pytest|vitest|playwright'; then
    CONTEXT="これは検証コマンドの実失敗です。環境問題と決めつけず、テスト出力を読んで failing assertion と root cause を確認してください。"
  fi
fi

if [ "$TOOL" = "Read" ] && printf '%s' "$ERROR_TEXT" | grep -qiE 'no such file|not found'; then
  CONTEXT="Read 失敗です。パスの typo か対象ファイルの移動が疑われます。rg --files で現在位置を確認してください。"
fi

if [ "$TOOL" = "WebFetch" ] && printf '%s' "$ERROR_TEXT" | grep -qiE '403|401|forbidden|unauthorized'; then
  CONTEXT="WebFetch 失敗です。認証付き URL や bot block の可能性があります。Playwright / project MCP / shareable URL を検討してください。"
fi

if [ -z "$CONTEXT" ]; then
  exit 0
fi

jq -n --arg ctx "$CONTEXT" '{
  hookSpecificOutput: {
    hookEventName: "PostToolUseFailure",
    additionalContext: $ctx
  }
}'
