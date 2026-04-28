#!/bin/bash
# PreToolUse (Bash): require an explicit test category checkpoint.
set -euo pipefail

INPUT=$(cat)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=lib/codex-hook-utils.sh
. "$SCRIPT_DIR/lib/codex-hook-utils.sh"

CMD=$(codex_tool_command "$INPUT")
SESSION_ID=$(printf '%s' "$INPUT" | jq -r '.session_id // empty' 2>/dev/null || true)

if [ -z "$CMD" ]; then
  exit 0
fi

COMMAND_CATEGORY=""
if printf '%s' "$CMD" | grep -qE '(^|[;&|])\s*make\s+(test-e2e-functional-local|ai-live-local)\b' || printf '%s' "$CMD" | grep -qE '(^|[;&|])\s*(bash\s+)?scripts/dev/run-ai-live-local\.sh\b'; then
  COMMAND_CATEGORY="e2e-functional"
elif printf '%s' "$CMD" | grep -qE '(^|[;&|])\s*make\s+test-quality-' || printf '%s' "$CMD" | grep -qE '(^|[;&|])\s*bash\s+scripts/ci/run-ai-live\.sh\b'; then
  COMMAND_CATEGORY="quality"
elif printf '%s' "$CMD" | grep -qE '(^|[;&|])\s*make\s+security-scan\b' || printf '%s' "$CMD" | grep -qE '(^|[;&|])\s*(bash\s+)?security/scan/run-lightweight-scan\.sh\b'; then
  COMMAND_CATEGORY="security"
fi

if [ -z "$COMMAND_CATEGORY" ]; then
  exit 0
fi

if [ -z "$SESSION_ID" ]; then
  echo "Test category gate blocked: session_id is unavailable." >&2
  exit 2
fi

STATE_DIR=$(codex_session_state_dir)
FLAG="$STATE_DIR/test-categories-$SESSION_ID"

if [ ! -f "$FLAG" ]; then
  cat >&2 <<EOF
Test command blocked by Codex hook. Choose categories first and record:
  node scripts/harness/diff-snapshot.mjs checkpoint --kind test-categories --decision approved --project "$(pwd)" \
    --categories "e2e-functional=run:<features>,quality=skip,static=run,security=run" > $FLAG
EOF
  exit 2
fi

if ! jq -e . "$FLAG" >/dev/null 2>&1; then
  echo "Test category checkpoint must be JSON: $FLAG" >&2
  exit 2
fi

PROJECT_DIR=$(codex_project_dir "$INPUT")
if ! node "$PROJECT_DIR/scripts/harness/diff-snapshot.mjs" verify --project "$PROJECT_DIR" --file "$FLAG" >/dev/null; then
  echo "Test category checkpoint is stale for the current staged diff." >&2
  exit 2
fi

category_value="$(jq -r --arg key "$COMMAND_CATEGORY" '.categories[$key] // .[$key] // empty' "$FLAG" 2>/dev/null || echo "")"
if [ -z "$category_value" ]; then
  echo "$COMMAND_CATEGORY is missing from test category checkpoint: $FLAG" >&2
  exit 2
fi

case "$category_value" in
  run|run:*|partial:*) ;;
  skip|skip:*)
    echo "$COMMAND_CATEGORY is marked skip in checkpoint: $FLAG" >&2
    exit 2
    ;;
  *)
    echo "Invalid $COMMAND_CATEGORY checkpoint value: $category_value" >&2
    exit 2
    ;;
esac

exit 0
