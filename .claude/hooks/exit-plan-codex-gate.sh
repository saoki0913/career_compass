#!/bin/bash
# PreToolUse (ExitPlanMode): プランモード終了を記録し、常に許可する。
# 委譲判断は impl-start-codex-gate.sh (Edit|Write) で enforce する。
set -euo pipefail

INPUT=$(cat)
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // empty')

if [ -z "$SESSION_ID" ]; then
  exit 0
fi

STATE_DIR="$HOME/.claude/sessions/career_compass"
mkdir -p "$STATE_DIR"
: > "$STATE_DIR/plan-exited-$SESSION_ID"

exit 0
