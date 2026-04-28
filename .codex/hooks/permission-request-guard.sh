#!/bin/bash
# PermissionRequest: deny clearly unsafe approval prompts before they reach the user.
set -euo pipefail

INPUT=$(cat)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=lib/codex-hook-utils.sh
. "$SCRIPT_DIR/lib/codex-hook-utils.sh"
PROJECT_DIR=$(codex_project_dir "$INPUT")
# shellcheck source=../../scripts/harness/guard-core.sh
. "$PROJECT_DIR/scripts/harness/guard-core.sh"

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
    if [ -n "$FILE_PATH" ] && guard_path_is_sensitive "$FILE_PATH"; then
      deny "secrets / env / key direct reads are blocked. Use scripts/release/sync-career-compass-secrets.sh --check."
      exit 0
    fi
    ;;
esac

if [ "$TOOL" = "Bash" ]; then
  CMD=$(codex_tool_command "$INPUT")

  if [ -n "$CMD" ] && guard_command_is_force_push "$CMD"; then
    deny "git push --force is blocked by repository policy."
    exit 0
  fi

  if [ -n "$CMD" ] && guard_command_is_git_push "$CMD"; then
    deny "git push requires an explicit approval checkpoint."
    exit 0
  fi

  if [ -n "$CMD" ] && guard_command_has_destructive_delete "$CMD"; then
    deny "Escalated destructive delete approvals are blocked. Non-escalated build/cache cleanup may run only when PreToolUse classifies every target as safe."
    exit 0
  fi

  if [ -n "$CMD" ] && guard_command_is_release_or_provider "$CMD"; then
    deny "release / deploy / provider CLI commands require an explicit release approval checkpoint."
    exit 0
  fi

  if [ -n "$CMD" ] && guard_command_reads_sensitive_path "$CMD"; then
    deny "Commands that read secrets / env / key files are blocked. Use sync-career-compass-secrets.sh --check."
    exit 0
  fi
fi

exit 0
