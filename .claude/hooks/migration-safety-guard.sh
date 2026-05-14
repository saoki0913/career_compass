#!/bin/bash
# PreToolUse (Bash): block risky/contract DB migrations without approval checkpoint.
set -euo pipefail

INPUT=$(cat)
CMD=$(echo "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null || echo "")
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // empty' 2>/dev/null || echo "")
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
# shellcheck source=../../scripts/harness/guard-core.sh
. "$PROJECT_DIR/scripts/harness/guard-core.sh"

if [ -z "$CMD" ] || ! guard_command_is_migration_apply "$CMD"; then
  exit 0
fi

if [ -z "$SESSION_ID" ]; then
  echo "migration command blocked: session_id is unavailable." >&2
  exit 2
fi

# Attempt dry-run classification to detect risky/contract migrations
DRY_RUN=$(node "$PROJECT_DIR/scripts/release/run-migrations.mjs" --env production --dry-run --json 2>/dev/null || true)

if [ -z "$DRY_RUN" ]; then
  # Cannot classify (e.g., no DB connection for dry-run) -- let release-provider-guard handle
  exit 0
fi

PENDING=$(echo "$DRY_RUN" | jq -r '.pending // 0' 2>/dev/null || echo "0")
BLOCKER_COUNT=$(echo "$DRY_RUN" | jq -r '.blockers | length' 2>/dev/null || echo "0")

if [ "$PENDING" = "0" ]; then
  exit 0  # Nothing pending
fi

if [ "$BLOCKER_COUNT" = "0" ]; then
  exit 0  # All expand-auto, safe
fi

# Risky/contract detected -- check checkpoint
STATE_DIR=$(guard_state_dir_for_runtime claude)
FLAG="$STATE_DIR/migration-approved-$SESSION_ID"
HEAD_SHA=$(git -C "$PROJECT_DIR" rev-parse HEAD 2>/dev/null || echo "")

if [ -f "$FLAG" ]; then
  APPROVED_HEAD=$(jq -r '.headSha // empty' "$FLAG" 2>/dev/null || echo "")
  DECISION=$(jq -r '.decision // empty' "$FLAG" 2>/dev/null || echo "")
  if [ "$DECISION" = "approved" ] && [ "$APPROVED_HEAD" = "$HEAD_SHA" ]; then
    exit 0  # Checkpoint valid
  fi
  echo "Migration checkpoint HEAD mismatch. Re-approval required." >&2
fi

# Block with details
CLASSIFICATIONS=$(echo "$DRY_RUN" | jq -r '.classifications[]? | "\(.tag) -> \(.classification)"' 2>/dev/null || echo "(unavailable)")
BLOCKERS=$(echo "$DRY_RUN" | jq -r '.blockers[]? | "\(.tag): \(.type)"' 2>/dev/null || echo "(unavailable)")

cat >&2 <<EOF
DB migration includes risky/contract changes.

Classifications:
$CLASSIFICATIONS

Blockers:
$BLOCKERS

Action: Use AskUserQuestion to confirm, then create checkpoint:
  node scripts/harness/diff-snapshot.mjs checkpoint --kind migration --decision approved --release-mode migration-risky --project "$PROJECT_DIR" > "$FLAG"
EOF
exit 2
