#!/bin/bash
# PreToolUse (Bash): git branch creation requires an explicit checkpoint.
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

cat >&2 <<EOF
ブランチ作成はまだ実行できません。

このプロジェクトでは通常 develop ブランチで作業します。
新しいブランチが本当に必要な場合は、用途と理由を確認してから再実行してください。

開発者向けの解除手順:
  echo "approved" > "$APPROVAL_FLAG"
EOF
exit 2
