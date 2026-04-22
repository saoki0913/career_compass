#!/bin/bash
# PreToolUse (Edit|Write): UI ファイル編集前に ui:preflight リマインダを出す。
# matcher はツール名のみ。パス判定はこのスクリプト内で行う。
set -e
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')
if [ -z "$FILE_PATH" ]; then
  exit 0
fi

# API routes は UI ではない — 除外
if echo "$FILE_PATH" | grep -qE '(^|/)src/app/api/'; then
  exit 0
fi

# UI ファイル判定（任意の深さ、root レベル含む）:
#   src/components/**（skeletons 含む）
#   src/app/**/page.tsx | layout.tsx | loading.tsx
if echo "$FILE_PATH" | grep -qE '(^|/)src/(components/|app/(.*/)?(page|layout|loading)\.tsx$)'; then
  node "$PROJECT_DIR/tools/check-ui-preflight-gate.mjs" "$FILE_PATH"
fi
exit 0
