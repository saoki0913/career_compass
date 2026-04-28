#!/bin/bash
# PreToolUse dispatcher: keep runtime hook status concise and invoke only relevant guards.
set -euo pipefail

INPUT=$(cat)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=lib/codex-hook-utils.sh
. "$SCRIPT_DIR/lib/codex-hook-utils.sh"

TOOL=$(printf '%s' "$INPUT" | jq -r '.tool_name // empty' 2>/dev/null || true)
CMD=$(codex_tool_command "$INPUT")
FILE_PATH=$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // .tool_input.path // .file_path // empty' 2>/dev/null || true)
PROJECT_DIR=$(codex_project_dir "$INPUT")
# shellcheck source=../../scripts/harness/guard-core.sh
. "$PROJECT_DIR/scripts/harness/guard-core.sh"

run_hook() {
  local hook_name="$1"
  printf '%s' "$INPUT" | bash "$SCRIPT_DIR/$hook_name"
}

case "$TOOL" in
  Bash|"")
    if [ -z "$CMD" ]; then
      exit 0
    fi

    if guard_command_reads_sensitive_path "$CMD"; then
      run_hook "secrets-guard.sh"
    fi

    if guard_command_is_git_push "$CMD"; then
      run_hook "git-push-guard.sh"
    fi

    if guard_command_has_destructive_delete "$CMD"; then
      run_hook "destructive-rm-guard.sh"
    fi

    if guard_command_is_release_or_provider "$CMD"; then
      run_hook "release-provider-guard.sh"
    fi

    if guard_command_is_git_commit "$CMD"; then
      run_hook "commit-codex-gate.sh"
    fi

    if printf '%s' "$CMD" | grep -qE '(^|[;&|])\s*(make\s+(test-e2e-functional-local|ai-live-local|test-quality-)|bash\s+(scripts/dev/run-ai-live-local\.sh|scripts/ci/run-ai-live\.sh|security/scan/run-lightweight-scan\.sh))'; then
      run_hook "test-category-gate.sh"
    fi
    ;;

  Read|mcp__filesystem__*)
    if [ -n "$FILE_PATH" ] && guard_path_is_sensitive "$FILE_PATH"; then
      run_hook "secrets-guard.sh"
    fi
    ;;

  apply_patch|Edit|Write)
    run_hook "prompt-edit-confirm-guard.sh"
    run_hook "bandaid-guard.sh"
    ;;
esac

exit 0
