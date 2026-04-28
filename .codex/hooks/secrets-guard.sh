#!/bin/bash
# Codex wrapper for guarding direct sensitive file reads.
set -e
INPUT=$(cat)
TOOL=$(echo "$INPUT" | jq -r '.tool_name // empty')
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=lib/codex-hook-utils.sh
. "$SCRIPT_DIR/lib/codex-hook-utils.sh"
PROJECT_DIR=$(codex_project_dir "$INPUT")
# shellcheck source=../../scripts/harness/guard-core.sh
. "$PROJECT_DIR/scripts/harness/guard-core.sh"

if [ "$TOOL" = "Read" ] || echo "$TOOL" | grep -qE '^mcp__filesystem__'; then
  FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // .tool_input.path // .file_path // empty')
  if [ -n "$FILE_PATH" ] && guard_path_is_sensitive "$FILE_PATH"; then
    cat >&2 <<'EOF'
⛔ secrets / env / key ファイルの直接 Read は禁止です。`zsh scripts/release/sync-career-compass-secrets.sh --check` を使ってください。
EOF
    exit 2
  fi
elif [ "$TOOL" = "Bash" ] || [ "$TOOL" = "" ]; then
  CMD=$(codex_tool_command "$INPUT")
  if [ -n "$CMD" ] && guard_command_reads_sensitive_path "$CMD"; then
    cat >&2 <<'EOF'
⛔ secrets / env / key ファイルを読む Bash コマンドは禁止です。`zsh scripts/release/sync-career-compass-secrets.sh --check` を使ってください。
EOF
    exit 2
  fi
fi
exit 0
