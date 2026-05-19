#!/bin/bash
# PreToolUse (apply_patch/Edit/Write): keep prompt/LLM edit debt visible without blocking Codex.
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
PENDING_JSON="$STATE_DIR/prompt-review-pending-$SESSION_ID.json"
CONFIRMED_FLAG="$STATE_DIR/prompt-review-confirmed-$SESSION_ID"
CONFIRMED_JSON="$STATE_DIR/prompt-review-confirmed-$SESSION_ID.json"
QUALITY_FLAG="$STATE_DIR/prompt-quality-verification-$SESSION_ID"

if [ ! -f "$PENDING_JSON" ] && [ ! -f "$PENDING_FLAG" ]; then
  exit 0
fi

if [ -f "$QUALITY_FLAG" ]; then
  exit 0
fi

if [ -f "$CONFIRMED_JSON" ] || [ -f "$CONFIRMED_FLAG" ]; then
  exit 0
fi

if [ -f "$PENDING_JSON" ]; then
  EDITED_FILE=$(jq -r '.changedFiles[0] // "(unknown)"' "$PENDING_JSON" 2>/dev/null || echo "(unknown)")
else
  EDITED_FILE=$(head -1 "$PENDING_FLAG" 2>/dev/null || echo "(unknown)")
fi

PROJECT_DIR=$(codex_project_dir "$INPUT")
# shellcheck source=../../scripts/harness/guard-runtime.sh
. "$PROJECT_DIR/scripts/harness/guard-runtime.sh"
GR_HOOK=prompt-edit-confirm-guard
gr_init "$INPUT" codex
gr_enforce high "Codex prompt/LLM verification debt is pending.
$EDITED_FILE was changed. Continue fixing if needed, but record deterministic prompt checks and AI writing quality review before commit.
Expected final record:
  $STATE_DIR/prompt-quality-verification-$SESSION_ID"
