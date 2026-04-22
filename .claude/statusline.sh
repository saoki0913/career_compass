#!/bin/bash
# Claude Code status line for career_compass: git + cost + context.
set -euo pipefail

INPUT=$(cat)
MODEL=$(echo "$INPUT" | jq -r '.model.display_name // .model // "unknown"')
DIR=$(echo "$INPUT" | jq -r '.workspace.current_dir // .cwd // ""')
PCT=$(echo "$INPUT" | jq -r '.context_window.used_percentage // 0' | cut -d. -f1)
COST=$(echo "$INPUT" | jq -r '.cost.total_cost_usd // 0')
DURATION_MS=$(echo "$INPUT" | jq -r '.cost.total_duration_ms // 0')

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-${DIR:-$(pwd)}}"
BRANCH=$(git -C "$PROJECT_DIR" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "no-git")
DIRTY_COUNT=$(git -C "$PROJECT_DIR" status --short 2>/dev/null | wc -l | tr -d ' ')

FILLED=$((PCT / 10))
EMPTY=$((10 - FILLED))
printf -v FILL "%${FILLED}s" ""
printf -v PAD "%${EMPTY}s" ""
BAR="${FILL// /#}${PAD// /-}"

MINS=$((DURATION_MS / 60000))
SECS=$(((DURATION_MS % 60000) / 1000))

echo "[$MODEL] ${DIR##*/} | ${BRANCH} | dirty:${DIRTY_COUNT}"
printf "ctx:%s%% [%s] | cost:$%.2f | %dm%02ds\n" "$PCT" "$BAR" "$COST" "$MINS" "$SECS"
