#!/bin/bash
# Codex wrapper for the Claude UI preflight reminder.
set -e
INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // .file_path // empty')
if [ -z "$FILE_PATH" ]; then
  exit 0
fi

if echo "$FILE_PATH" | grep -qE '(^|/)src/app/api/'; then
  exit 0
fi

if echo "$FILE_PATH" | grep -qE '(^|/)src/(components/|app/(.*/)?(page|layout|loading)\.tsx$)'; then
  cat >&2 <<'EOF'
⚠ UI ファイル編集を検知しました。

Codex の標準導線:
  1. /codex-start または /ui-start
  2. npm run ui:preflight -- <route> --surface=marketing|product [--auth=none|guest]
  3. npm run lint:ui:guardrails
  4. npm run test:ui:review -- <route>
EOF
fi
exit 0
