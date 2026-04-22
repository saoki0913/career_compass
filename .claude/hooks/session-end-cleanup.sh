#!/bin/bash
# SessionEnd: clean session-scoped counter files and emit a terse summary.
set -euo pipefail

INPUT=$(cat)
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // "unknown"')
REASON=$(echo "$INPUT" | jq -r '.reason // "other"')
STATE_DIR="$HOME/.claude/sessions/career_compass"
shopt -s nullglob
files=("$STATE_DIR"/*-"$SESSION_ID")

if [ "${#files[@]}" -gt 0 ]; then
  rm -f "${files[@]}"
  echo "SessionEnd cleanup: removed ${#files[@]} session state files (reason=$REASON)" >&2
else
  echo "SessionEnd cleanup: no session state files for $SESSION_ID (reason=$REASON)" >&2
fi

exit 0
