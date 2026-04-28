#!/bin/bash
# PermissionRequest: deny clearly unsafe requests before the user sees a vague prompt.
set -euo pipefail

INPUT=$(cat)
TOOL=$(echo "$INPUT" | jq -r '.tool_name // empty')
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
# shellcheck source=../../scripts/harness/guard-core.sh
. "$PROJECT_DIR/scripts/harness/guard-core.sh"

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
    if [ -n "$FILE_PATH" ] && guard_path_is_sensitive "$FILE_PATH"; then
      deny "secrets / env / key ファイルの直接参照は許可していません。inventory 確認は sync-career-compass-secrets.sh --check を使ってください。"
    exit 0
  fi
fi

if [ "$TOOL" = "Bash" ]; then
  CMD=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

  if [ -n "$CMD" ] && guard_command_is_force_push "$CMD"; then
    deny "git push --force 系は repo policy で禁止です。追加コミットか承認済みの限定操作へ切り替えてください。"
    exit 0
  fi

  if [ -n "$CMD" ] && guard_command_is_git_push "$CMD"; then
    deny "git push は AskUserQuestion 承認 checkpoint 作成後のみ許可します。"
    exit 0
  fi

  if [ -n "$CMD" ] && guard_command_has_destructive_delete "$CMD"; then
    deny "rm -rf 系はホワイトリスト外の対象に対して禁止です。node_modules, .next, dist 等のビルド成果物のみ許可されています。"
    exit 0
  fi

  if [ -n "$CMD" ] && guard_command_is_release_or_provider "$CMD"; then
    deny "release / deploy / provider CLI は release approval checkpoint または release-engineer 経由でのみ許可します。"
    exit 0
  fi

  if [ -n "$CMD" ] && guard_command_reads_sensitive_path "$CMD"; then
    deny "secrets / env / key ファイルを読むコマンドは許可していません。sync-career-compass-secrets.sh --check を使ってください。"
    exit 0
  fi
fi

exit 0
