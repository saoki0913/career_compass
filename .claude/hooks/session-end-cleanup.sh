#!/bin/bash
# SessionEnd: clean session-scoped counter files and emit a terse summary.
set -euo pipefail

INPUT=$(cat)
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // "unknown"')
REASON=$(echo "$INPUT" | jq -r '.reason // "other"')
STATE_DIR="$HOME/.claude/sessions/career_compass"
COUNTER_FILE="$STATE_DIR/edit-count-$SESSION_ID"

if [ -f "$COUNTER_FILE" ]; then
  rm -f "$COUNTER_FILE"
  echo "SessionEnd cleanup: removed $COUNTER_FILE (reason=$REASON)" >&2
else
  echo "SessionEnd cleanup: no counter file for $SESSION_ID (reason=$REASON)" >&2
fi

exit 0
