#!/bin/bash
# Codex wrapper for session cleanup.
set -euo pipefail

INPUT=$(cat)
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // "unknown"')
REASON=$(echo "$INPUT" | jq -r '.reason // "other"')
STATE_DIR="$HOME/.codex/sessions/career_compass"
COUNTER_FILE="$STATE_DIR/edit-count-$SESSION_ID"

if [ -f "$COUNTER_FILE" ]; then
  rm -f "$COUNTER_FILE"
  echo "Codex SessionEnd cleanup: removed $COUNTER_FILE (reason=$REASON)" >&2
else
  echo "Codex SessionEnd cleanup: no counter file for $SESSION_ID (reason=$REASON)" >&2
fi
exit 0
