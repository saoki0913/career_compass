#!/bin/bash
# PreToolUse (Bash): git branch creation requires AskUserQuestion approval.
set -euo pipefail
INPUT=$(cat)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=lib/codex-hook-utils.sh
. "$SCRIPT_DIR/lib/codex-hook-utils.sh"

CMD=$(codex_tool_command "$INPUT")
SESSION_ID=$(printf '%s' "$INPUT" | jq -r '.session_id // empty' 2>/dev/null || echo "")
PROJECT_DIR=$(codex_project_dir "$INPUT")
# shellcheck source=../../scripts/harness/guard-core.sh
. "$PROJECT_DIR/scripts/harness/guard-core.sh"

if [ -z "$CMD" ]; then exit 0; fi
if ! guard_command_is_git_branch_create "$CMD"; then exit 0; fi

STATE_DIR="$(guard_state_dir_for_runtime codex)"
APPROVAL_FLAG="$STATE_DIR/branch-creation-approved-$SESSION_ID"
if [ -f "$APPROVAL_FLAG" ]; then rm -f "$APPROVAL_FLAG"; exit 0; fi

cat >&2 <<'EOF'
⛔ ブランチ作成をブロックしました。

開発は develop ブランチで行ってください。
ブランチを新規作成する場合は AskUserQuestion でユーザーに確認してください。
承認後: echo "approved" > "<state_dir>/branch-creation-approved-<session_id>"
EOF
exit 2
