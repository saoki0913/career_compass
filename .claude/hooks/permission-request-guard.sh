#!/bin/bash
# PermissionRequest: deny clearly unsafe requests before the user sees a vague prompt.
set -euo pipefail

INPUT=$(cat)
TOOL=$(echo "$INPUT" | jq -r '.tool_name // empty')

deny() {
  local message="$1"
  jq -n --arg msg "$message" '{
    hookSpecificOutput: {
      hookEventName: "PermissionRequest",
      decision: {
        behavior: "deny",
        message: $msg,
        interrupt: true
      }
    }
  }'
}

if [ "$TOOL" = "Read" ]; then
  FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')
  if [ -n "$FILE_PATH" ] && echo "$FILE_PATH" | grep -q 'codex-company/\.secrets/'; then
    deny "codex-company/.secrets/ の実ファイル直接参照は許可していません。inventory 確認は sync-career-compass-secrets.sh --check を使ってください。"
    exit 0
  fi
fi

if [ "$TOOL" = "Bash" ]; then
  CMD=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

  if [ -n "$CMD" ] && echo "$CMD" | grep -qE 'git[[:space:]]+push([[:space:]].*)?(--force|--force-with-lease|[[:space:]]-f([[:space:]]|$))'; then
    deny "git push --force 系は repo policy で禁止です。追加コミットか承認済みの限定操作へ切り替えてください。"
    exit 0
  fi

  if [ -n "$CMD" ] && echo "$CMD" | grep -qE '(^|[^a-zA-Z_])(cat|head|tail|less|more|bat|sed|awk|grep|rg)([[:space:]].*)?codex-company/\.secrets/'; then
    deny "codex-company/.secrets/ を読むコマンドは許可していません。sync-career-compass-secrets.sh --check を使ってください。"
    exit 0
  fi
fi

exit 0
