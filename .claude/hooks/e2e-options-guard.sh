#!/bin/bash
# PreToolUse (Bash): Playwright + LLM Judge のオプション確認を強制。
# playwright-confirm-guard.sh を置き換え、2 つの確認を 1 checkpoint に統合。
set -euo pipefail

INPUT=$(cat)
CMD=$(echo "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null || echo "")
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // empty' 2>/dev/null || echo "")

if [ -z "$CMD" ]; then exit 0; fi

IS_LOCAL_E2E=false
if echo "$CMD" | grep -qE '(^|[;&|])\s*make\s+(test-e2e-functional-local|ai-live-local)\b'; then
  IS_LOCAL_E2E=true
elif echo "$CMD" | grep -qF 'run-ai-live-local.sh'; then
  IS_LOCAL_E2E=true
fi

if [ "$IS_LOCAL_E2E" = false ]; then exit 0; fi

if [ -z "$SESSION_ID" ]; then
  echo "⛔ e2e-options: session_id unknown. Confirm via AskUserQuestion first." >&2
  exit 2
fi

STATE_DIR="$HOME/.claude/sessions/career_compass"
mkdir -p "$STATE_DIR"
OPTIONS_FLAG="$STATE_DIR/e2e-options-$SESSION_ID"
CONFIRM_FLAG="$STATE_DIR/e2e-confirm-$SESSION_ID"

# --- 1. existence ---
if [ ! -f "$OPTIONS_FLAG" ]; then
  cat >&2 <<EOF
⛔ E2E オプション確認をブロック: AskUserQuestion での確認が未完了。

手順:
  1. AskUserQuestion (multiSelect) で Playwright + Judge オプションを確認
  2. echo "playwright=<val>,judge=<val>" > $OPTIONS_FLAG
     playwright: run / run:<features> / skip
     judge: with-judge / without-judge
  3. E2E コマンドを再実行
EOF
  exit 2
fi

# --- 2. non-empty ---
CONTENT=$(tr -d '[:space:]' < "$OPTIONS_FLAG" 2>/dev/null || echo "")
if [ -z "$CONTENT" ]; then
  echo "⛔ e2e-options checkpoint is empty. Re-confirm via AskUserQuestion." >&2
  exit 2
fi

# --- 3. format regex ---
if ! echo "$CONTENT" | grep -qE '^playwright=(run(:[a-z,-]+)?|skip),judge=(with-judge|without-judge)$'; then
  cat >&2 <<EOF
⛔ e2e-options checkpoint format invalid: "$CONTENT"
Expected: playwright=(run|run:<features>|skip),judge=(with-judge|without-judge)
Example:  playwright=run,judge=without-judge
EOF
  exit 2
fi

# --- 4. time-gap: options must be newer than confirm ---
if [ -f "$CONFIRM_FLAG" ]; then
  CONFIRM_MTIME=$(stat -f '%m' "$CONFIRM_FLAG" 2>/dev/null || echo "0")
  OPTIONS_MTIME=$(stat -f '%m' "$OPTIONS_FLAG" 2>/dev/null || echo "0")

  if [ "$OPTIONS_MTIME" -le "$CONFIRM_MTIME" ]; then
    echo "⛔ e2e-options checkpoint is stale (older than e2e-confirm). Re-confirm via AskUserQuestion." >&2
    exit 2
  fi

  # --- 5. minimum 3 second gap ---
  GAP=$((OPTIONS_MTIME - CONFIRM_MTIME))
  if [ "$GAP" -lt 3 ]; then
    echo "⛔ e2e-options checkpoint too close to e2e-confirm (${GAP}s < 3s). Re-confirm properly." >&2
    exit 2
  fi
fi

exit 0
