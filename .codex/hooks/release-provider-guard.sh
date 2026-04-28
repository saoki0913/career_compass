#!/bin/bash
# PreToolUse (Bash): block release/deploy/provider CLI without approval checkpoint.
set -euo pipefail

INPUT=$(cat)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=lib/codex-hook-utils.sh
. "$SCRIPT_DIR/lib/codex-hook-utils.sh"
CMD=$(codex_tool_command "$INPUT")
SESSION_ID=$(printf '%s' "$INPUT" | jq -r '.session_id // empty' 2>/dev/null || true)
PROJECT_DIR=$(codex_project_dir "$INPUT")
# shellcheck source=../../scripts/harness/guard-core.sh
. "$PROJECT_DIR/scripts/harness/guard-core.sh"

if [ -z "$CMD" ] || ! guard_command_is_release_or_provider "$CMD"; then
  exit 0
fi

RELEASE_MODE=$(guard_command_release_modes "$CMD" | head -1)
RELEASE_MODE="${RELEASE_MODE:-provider}"

if [ -z "$SESSION_ID" ]; then
  echo "release/provider command blocked: session_id is unavailable." >&2
  exit 2
fi

STATE_DIR=$(guard_state_dir_for_runtime codex)
FLAG="$STATE_DIR/release-approved-$SESSION_ID"
HEAD_SHA=$(git -C "$PROJECT_DIR" rev-parse HEAD 2>/dev/null || echo "")

if [ ! -f "$FLAG" ]; then
  cat >&2 <<EOF
release / deploy / provider CLI blocked by Codex hook.

Create an explicit approval checkpoint before running it:
  node scripts/harness/diff-snapshot.mjs checkpoint --kind release --decision approved --release-mode "$RELEASE_MODE" --project "$PROJECT_DIR" > "$FLAG"
EOF
  exit 2
fi

APPROVED_HEAD=$(jq -r '.headSha // empty' "$FLAG" 2>/dev/null || echo "")
DECISION=$(jq -r '.decision // empty' "$FLAG" 2>/dev/null || echo "")
KIND=$(jq -r '.kind // empty' "$FLAG" 2>/dev/null || echo "")
APPROVED_RELEASE_MODE=$(jq -r '.releaseMode // empty' "$FLAG" 2>/dev/null || echo "")
if [ "$KIND" != "release" ] || [ "$DECISION" != "approved" ] || [ "$APPROVED_HEAD" != "$HEAD_SHA" ] || [ "$APPROVED_RELEASE_MODE" != "$RELEASE_MODE" ]; then
  echo "release/provider command blocked: approval checkpoint does not match current HEAD." >&2
  exit 2
fi

if ! node "$PROJECT_DIR/scripts/harness/diff-snapshot.mjs" verify --project "$PROJECT_DIR" --file "$FLAG" >/dev/null; then
  echo "release/provider command blocked: working tree changed after approval checkpoint creation." >&2
  exit 2
fi

exit 0
