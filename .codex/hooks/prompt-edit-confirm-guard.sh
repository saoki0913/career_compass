#!/bin/bash
# PreToolUse (apply_patch/Edit/Write): enforce prompt/LLM edit confirmation.
set -euo pipefail

INPUT=$(cat)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=lib/codex-hook-utils.sh
. "$SCRIPT_DIR/lib/codex-hook-utils.sh"

SESSION_ID=$(printf '%s' "$INPUT" | jq -r '.session_id // empty' 2>/dev/null || true)
if [ -z "$SESSION_ID" ]; then
  exit 0
fi

STATE_DIR=$(codex_session_state_dir)
PENDING_FLAG="$STATE_DIR/prompt-review-pending-$SESSION_ID"
CONFIRMED_FLAG="$STATE_DIR/prompt-review-confirmed-$SESSION_ID"

if [ ! -f "$PENDING_FLAG" ]; then
  exit 0
fi

if [ -f "$CONFIRMED_FLAG" ]; then
  PENDING_MTIME=$(stat -f %m "$PENDING_FLAG" 2>/dev/null || stat -c %Y "$PENDING_FLAG" 2>/dev/null || echo 0)
  CONFIRMED_MTIME=$(stat -f %m "$CONFIRMED_FLAG" 2>/dev/null || stat -c %Y "$CONFIRMED_FLAG" 2>/dev/null || echo 0)
  if [ "$CONFIRMED_MTIME" -gt "$PENDING_MTIME" ]; then
    exit 0
  fi
fi

EDITED_FILE=$(head -1 "$PENDING_FLAG" 2>/dev/null || echo "(unknown)")

cat >&2 <<EOF
Prompt/LLM edit confirmation is pending.

$EDITED_FILE was changed. Before the next edit, summarize the change, impact, and verification plan for the user.
After confirmation, record:
  touch $CONFIRMED_FLAG
EOF
exit 2
