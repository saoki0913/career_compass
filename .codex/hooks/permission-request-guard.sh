#!/bin/bash
# PermissionRequest: deny clearly unsafe approval prompts before they reach the user.
set -euo pipefail

INPUT=$(cat)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=lib/codex-hook-utils.sh
. "$SCRIPT_DIR/lib/codex-hook-utils.sh"

TOOL=$(printf '%s' "$INPUT" | jq -r '.tool_name // empty' 2>/dev/null || true)

deny() {
  local message="$1"
  jq -n --arg msg "$message" '{
    hookSpecificOutput: {
      hookEventName: "PermissionRequest",
      decision: {
        behavior: "deny",
        message: $msg
      }
    }
  }'
}

case "$TOOL" in
  Read|mcp__filesystem__read_file)
    FILE_PATH=$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // .tool_input.path // empty' 2>/dev/null || true)
    if [ -n "$FILE_PATH" ] && printf '%s' "$FILE_PATH" | grep -q 'codex-company/\.secrets/'; then
      deny "codex-company/.secrets/ direct reads are blocked. Use scripts/release/sync-career-compass-secrets.sh --check."
      exit 0
    fi
    ;;
esac

if [ "$TOOL" = "Bash" ]; then
  CMD=$(codex_tool_command "$INPUT")

  if [ -n "$CMD" ] && printf '%s' "$CMD" | grep -qE 'git[[:space:]]+push([[:space:]].*)?(--force|--force-with-lease|[[:space:]]-f([[:space:]]|$))'; then
    deny "git push --force is blocked by repository policy."
    exit 0
  fi

  if [ -n "$CMD" ] && printf '%s' "$CMD" | grep -qE '(^|[;&|])\s*rm\s+(-[a-zA-Z]*r[a-zA-Z]*f|-[a-zA-Z]*f[a-zA-Z]*r|-r\s+-f|-f\s+-r)'; then
    deny "rm -rf approvals are blocked except for explicitly safe build/cache targets."
    exit 0
  fi

  if [ -n "$CMD" ] && printf '%s' "$CMD" | grep -qE '(^|[^a-zA-Z_])(cat|head|tail|less|more|bat|sed|awk|grep|rg)([[:space:]].*)?codex-company/\.secrets/'; then
    deny "Commands that read codex-company/.secrets/ are blocked. Use sync-career-compass-secrets.sh --check."
    exit 0
  fi
fi

exit 0
