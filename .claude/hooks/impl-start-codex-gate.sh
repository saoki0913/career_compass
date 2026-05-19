#!/bin/bash
# PreToolUse (Edit|Write): defense-in-depth after Plan mode exit.
# plan-exited フラグがなければ (Plan mode 未使用) 素通り。
set -euo pipefail

INPUT=$(cat)
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // empty')
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
HOOK_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=../../.codex/hooks/lib/codex-hook-utils.sh
. "$HOOK_DIR/../../.codex/hooks/lib/codex-hook-utils.sh"
if [ -z "$FILE_PATH" ]; then
  FILE_PATH=$(printf '%s' "$INPUT" | jq -r '[.tool_input.edits[]?.file_path?, .tool_input.edits[]?.path?] | map(select(. != null and . != "")) | .[0] // empty' 2>/dev/null || true)
fi
if [ -z "$FILE_PATH" ]; then
  FILE_PATH=$(codex_primary_file_path "$INPUT")
fi

if [ -z "$SESSION_ID" ] || [ -z "$FILE_PATH" ]; then
  exit 0
fi

case "$FILE_PATH" in
  */.claude/plans/*|*/.claude/state/*|*/codex-handoffs/*)
    exit 0
    ;;
esac

# shellcheck source=../../scripts/harness/guard-runtime.sh
. "$PROJECT_DIR/scripts/harness/guard-runtime.sh"
GR_HOOK=impl-start-codex-gate
gr_init "$INPUT" claude

# The Codex-delegation decision is a main-interactive-agent concern.
# A subagent/headless context cannot AskUserQuestion, so the old hard
# block was a PERMANENT DEADLOCK there -> silent pass (locked decision:
# subagents must never deadlock).
if [ "${GR_IS_SUBAGENT:-0}" = "1" ] || [ "${GR_IS_HEADLESS:-0}" = "1" ]; then
  exit 0
fi

STATE_DIR="$HOME/.claude/sessions/career_compass"
PLAN_FLAG="$STATE_DIR/plan-exited-$SESSION_ID"
DELEGATION_FLAG="$STATE_DIR/codex-delegation-checkpoint-$SESSION_ID"
PROMPTED_FLAG="$STATE_DIR/impl-start-prompted-$SESSION_ID"

if [ ! -f "$PLAN_FLAG" ]; then
  exit 0
fi

if [ -f "$DELEGATION_FLAG" ]; then
  DELEG_CONTENT=$(tr -d '[:space:]' < "$DELEGATION_FLAG" 2>/dev/null || echo "")
  case "$DELEG_CONTENT" in
    delegate|no-delegate|partial)
      exit 0
      ;;
    *)
      gr_enforce advisory "Codex 委譲判断 checkpoint の内容が不正です（非ブロッキングで継続）: \"${DELEG_CONTENT}\"
許可値: delegate / no-delegate / partial。記録: echo \"<decision>\" > $DELEGATION_FLAG"
      ;;
  esac
fi

# locked decision #2 (Claude risk-tiered): the delegation decision is MED
# tier, not the dangerous set. Surface it ONCE per session (not on every
# post-Plan Edit -> the old per-edit hard block was the top deadlock/noise
# source) then proceed; subsequent edits stay silent.
if [ -f "$PROMPTED_FLAG" ]; then
  exit 0
fi
: > "$PROMPTED_FLAG"
gr_enforce advisory "Plan mode 後の Codex 委譲判断が未記録です（非ブロッキングで継続。本セッションで一度のみ通知）。
CLAUDE.md §A: AskUserQuestion で「この実装を Codex/subagent にも委譲するか」を確認し、決定を記録してください:
  echo \"<delegate|no-delegate|partial>\" > $DELEGATION_FLAG"
