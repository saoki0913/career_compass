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
  node tools/check-ui-preflight-gate.mjs "$FILE_PATH"
fi
exit 0
