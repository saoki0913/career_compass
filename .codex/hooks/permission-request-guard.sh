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
# shellcheck source=lib/autonomy.sh
. "$SCRIPT_DIR/lib/autonomy.sh"

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
      deny "秘密情報を直接読む操作はできません。必要な場合は、安全な確認用スクリプトだけを使ってください。"
      exit 0
    fi
    ;;
esac

if [ "$TOOL" = "Bash" ]; then
  CMD=$(codex_tool_command "$INPUT")

  # unsafe-shell-expansion pre-dialog deny removed (top false-positive
  # noise source). force-push / secrets / destructive-rm / release arms
  # below remain HARD deny on the literal command text.
  if [ -n "$CMD" ] && guard_command_is_force_push "$CMD"; then
    deny "強制 push は実行できません。追加コミットなど、履歴を書き換えない方法に切り替えてください。"
    exit 0
  fi

  if [ -n "$CMD" ] && guard_command_is_git_push "$CMD"; then
    STATE_DIR=$(guard_state_dir_for_runtime codex)
    SESSION_ID=$(printf '%s' "$INPUT" | jq -r '.session_id // empty' 2>/dev/null || true)
    if codex_autonomy_allows_action "$PROJECT_DIR" "$STATE_DIR" "$SESSION_ID" "push" "$CMD"; then
      exit 0
    fi
    deny "push の前に、対象コミットと影響を確認してください。"
    exit 0
  fi

  if [ -n "$CMD" ] && guard_command_has_destructive_delete "$CMD"; then
    deny "広い範囲を削除する操作は実行できません。削除対象を限定し、安全な一時ファイルだけにしてください。"
    exit 0
  fi

  if [ -n "$CMD" ] && guard_command_is_release_or_provider "$CMD"; then
    STATE_DIR=$(guard_state_dir_for_runtime codex)
    SESSION_ID=$(printf '%s' "$INPUT" | jq -r '.session_id // empty' 2>/dev/null || true)
    RELEASE_MODE=$(guard_command_release_modes "$CMD" | head -1)
    RELEASE_MODE="${RELEASE_MODE:-provider}"
    if codex_autonomy_allows_action "$PROJECT_DIR" "$STATE_DIR" "$SESSION_ID" "release" "$CMD" "$RELEASE_MODE"; then
      exit 0
    fi
    deny "リリースや外部サービス操作の前に、対象環境と影響範囲を確認してください。"
    exit 0
  fi

  if [ -n "$CMD" ] && guard_command_reads_sensitive_path "$CMD"; then
    deny "秘密情報を読むコマンドは実行できません。必要な確認は安全な確認用スクリプトで行ってください。"
    exit 0
  fi
fi

exit 0
