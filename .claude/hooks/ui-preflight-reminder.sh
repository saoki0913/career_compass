#!/bin/bash
# PreToolUse (Edit|Write): UI ファイル編集前に ui:preflight リマインダを出す。
# matcher はツール名のみ。パス判定はこのスクリプト内で行う。
set -e
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
  cat >&2 <<'EOF'
⚠ UI ファイル編集を検知しました。

UI 変更の事前/事後チェック（CLAUDE.md の hard rules）:
  1. 事前: npm run ui:preflight -- <route> --surface=marketing|product [--auth=none|guest]
     → Markdown 出力を会話 / PR 本文 / 作業ログのいずれかに残してから実装開始
  2. 変更中: npm run lint:ui:guardrails
  3. 事後: npm run test:ui:review -- <route>

Visual / UX 変更は ui-designer agent へ委譲することを推奨します。
EOF
fi
exit 0
