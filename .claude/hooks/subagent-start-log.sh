#!/bin/bash
# SubagentStart: append a lightweight usage log for cost / routing review.
set -euo pipefail

INPUT=$(cat)
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
LOG_FILE="$PROJECT_DIR/docs/ops/agent-usage.log"
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // "unknown"')
AGENT_ID=$(echo "$INPUT" | jq -r '.agent_id // "unknown"')
AGENT_TYPE=$(echo "$INPUT" | jq -r '.agent_type // "unknown"')

mkdir -p "$(dirname "$LOG_FILE")"
printf '%s session=%s agent_type=%s agent_id=%s\n' "$TIMESTAMP" "$SESSION_ID" "$AGENT_TYPE" "$AGENT_ID" >> "$LOG_FILE"

echo "SubagentStart logged: $AGENT_TYPE ($AGENT_ID)" >&2
exit 0
