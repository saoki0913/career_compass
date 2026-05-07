#!/bin/bash
# Codex wrapper for guarding git push commands.
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
if [ -z "$CMD" ]; then
  exit 0
fi

if ! guard_command_is_git_push "$CMD"; then
  exit 0
fi

if guard_command_is_force_push "$CMD"; then
  cat >&2 <<'EOF'
⛔ git push --force 系は Codex でも禁止です。追加コミットか、明示承認つきの限定的な操作に切り替えてください。
EOF
  exit 2
fi

if [ -z "$SESSION_ID" ]; then
  echo "git push blocked: session_id is unavailable, so push approval cannot be verified." >&2
  exit 2
fi

STATE_DIR=$(guard_state_dir_for_runtime codex)
PUSH_FLAG="$STATE_DIR/push-approved-$SESSION_ID"
HEAD_SHA=$(git -C "$PROJECT_DIR" rev-parse HEAD 2>/dev/null || echo "")

if [ ! -f "$PUSH_FLAG" ]; then
  cat >&2 <<EOF
git push blocked by Codex hook.

Create an explicit approval checkpoint before pushing:
  node scripts/harness/diff-snapshot.mjs checkpoint --kind push --decision approved --project "$PROJECT_DIR" > "$PUSH_FLAG"
EOF
  exit 2
fi

APPROVED_HEAD=$(jq -r '.headSha // empty' "$PUSH_FLAG" 2>/dev/null || echo "")
DECISION=$(jq -r '.decision // empty' "$PUSH_FLAG" 2>/dev/null || echo "")
KIND=$(jq -r '.kind // empty' "$PUSH_FLAG" 2>/dev/null || echo "")
if [ "$KIND" != "push" ] || [ "$DECISION" != "approved" ] || [ -z "$HEAD_SHA" ] || [ "$APPROVED_HEAD" != "$HEAD_SHA" ]; then
  echo "git push blocked: approval checkpoint does not match current HEAD." >&2
  exit 2
fi

if ! node "$PROJECT_DIR/scripts/harness/diff-snapshot.mjs" verify --project "$PROJECT_DIR" --file "$PUSH_FLAG" >/dev/null; then
  echo "git push blocked: working tree changed after approval checkpoint creation." >&2
  exit 2
fi

exit 0
