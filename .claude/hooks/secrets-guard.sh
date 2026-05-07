#!/bin/bash
# PreToolUse (Read|Bash): sensitive file direct access を block。
set -e
INPUT=$(cat)
TOOL=$(echo "$INPUT" | jq -r '.tool_name // empty')
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
# shellcheck source=../../scripts/harness/guard-core.sh
. "$PROJECT_DIR/scripts/harness/guard-core.sh"

if [ "$TOOL" = "Read" ]; then
  FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')
  if [ -n "$FILE_PATH" ] && guard_path_is_sensitive "$FILE_PATH"; then
    cat >&2 <<'EOF'
⛔ secrets / env / key ファイルの直接 Read は禁止されています（CLAUDE.md ルール）。

許可される操作:
  - zsh scripts/release/sync-career-compass-secrets.sh --check
  - 個別インベントリ確認のみ（実値は読まない）

env テンプレの確認は docs/release/ENV_REFERENCE.md を参照してください。
EOF
    exit 2
  fi
elif [ "$TOOL" = "Bash" ]; then
  CMD=$(echo "$INPUT" | jq -r '.tool_input.command // empty')
  if [ -n "$CMD" ] && guard_command_reads_sensitive_path "$CMD"; then
    cat >&2 <<'EOF'
⛔ secrets / env / key ファイルを cat/head/tail/less/grep 等で読むのは禁止です。

許可される操作:
  - zsh scripts/release/sync-career-compass-secrets.sh --check
EOF
    exit 2
  fi
fi
exit 0
