#!/bin/bash
# Codex wrapper for agent usage logging.
set -euo pipefail

INPUT=$(cat)
PROJECT_DIR="${PROJECT_DIR:-$(pwd)}"
LOG_FILE="$PROJECT_DIR/docs/ops/agent-usage.log"
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // "unknown"')
AGENT_ID=$(echo "$INPUT" | jq -r '.agent_id // "unknown"')
AGENT_TYPE=$(echo "$INPUT" | jq -r '.agent_type // "unknown"')

mkdir -p "$(dirname "$LOG_FILE")"
printf '%s session=%s agent_type=%s agent_id=%s source=codex\n' "$TIMESTAMP" "$SESSION_ID" "$AGENT_TYPE" "$AGENT_ID" >> "$LOG_FILE"
echo "Codex subagent logged: $AGENT_TYPE ($AGENT_ID)" >&2
exit 0
