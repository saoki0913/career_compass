#!/bin/bash
# PreToolUse (Bash): block release/deploy/provider CLI without approval checkpoint.
set -euo pipefail

INPUT=$(cat)
CMD=$(echo "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null || echo "")
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // empty' 2>/dev/null || echo "")
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
# shellcheck source=../../scripts/harness/guard-core.sh
. "$PROJECT_DIR/scripts/harness/guard-core.sh"

if [ -z "$CMD" ] || ! guard_command_is_release_or_provider "$CMD"; then
  exit 0
fi

if [ -z "$SESSION_ID" ]; then
  echo "release/provider command blocked: session_id is unavailable." >&2
  exit 2
fi

STATE_DIR=$(guard_state_dir_for_runtime claude)
FLAG="$STATE_DIR/release-approved-$SESSION_ID"
HEAD_SHA=$(git -C "$PROJECT_DIR" rev-parse HEAD 2>/dev/null || echo "")

if [ ! -f "$FLAG" ]; then
  cat >&2 <<EOF
⛔ release / deploy / provider CLI をブロックしました。

release-engineer 経由、またはユーザー承認 checkpoint が必要です。

承認後:
  node scripts/harness/diff-snapshot.mjs checkpoint --kind release --decision approved --project "$PROJECT_DIR" > "$FLAG"
EOF
  exit 2
fi

APPROVED_HEAD=$(jq -r '.headSha // empty' "$FLAG" 2>/dev/null || echo "")
DECISION=$(jq -r '.decision // empty' "$FLAG" 2>/dev/null || echo "")
if [ "$DECISION" != "approved" ] || [ "$APPROVED_HEAD" != "$HEAD_SHA" ]; then
  echo "release/provider command blocked: approval checkpoint does not match current HEAD." >&2
  exit 2
fi

exit 0
