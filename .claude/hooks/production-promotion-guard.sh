#!/bin/bash
# PreToolUse (Bash): block production promotion without staging verification + approval checkpoint.
set -euo pipefail

INPUT=$(cat)
CMD=$(echo "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null || echo "")
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // empty' 2>/dev/null || echo "")
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
# shellcheck source=../../scripts/harness/guard-core.sh
. "$PROJECT_DIR/scripts/harness/guard-core.sh"

if [ -z "$CMD" ] || ! guard_command_is_production_promotion "$CMD"; then
  exit 0
fi

if [ -z "$SESSION_ID" ]; then
  echo "production promotion blocked: session_id is unavailable." >&2
  exit 2
fi

HEAD_SHA=$(git -C "$PROJECT_DIR" rev-parse HEAD 2>/dev/null || echo "")
STATE_DIR=$(guard_state_dir_for_runtime claude)

# Gate 1: staging must be verified for the current HEAD
STAGING_FLAG="$STATE_DIR/staging-verified-$HEAD_SHA"

if [ ! -f "$STAGING_FLAG" ]; then
  cat >&2 <<EOF
Production promotion blocked: staging verification not found.

Before promoting to production, staging must be deployed and verified for the current HEAD.

Steps:
  1. Run make deploy-staging
  2. Verify staging health (make doctor-check or scripts/release/verify-health.sh staging)
  3. Create staging verification checkpoint:
     node scripts/harness/diff-snapshot.mjs checkpoint --kind staging-verify --decision approved --project "$PROJECT_DIR" > "$STAGING_FLAG"
  4. Re-run the production promotion command
EOF
  exit 2
fi

# Gate 2: explicit production promotion approval
PROMO_FLAG="$STATE_DIR/production-promotion-approved-$SESSION_ID"

if [ ! -f "$PROMO_FLAG" ]; then
  COMMIT_SUMMARY=$(git -C "$PROJECT_DIR" log --oneline -10 2>/dev/null || echo "(unavailable)")
  cat >&2 <<EOF
Production promotion blocked: explicit approval required.

Staging has been verified. Now approve the production promotion.

Recent commits:
$COMMIT_SUMMARY

Action: Use AskUserQuestion to confirm production deployment, then create checkpoint:
  node scripts/harness/diff-snapshot.mjs checkpoint --kind production-promotion --decision approved --release-mode production --project "$PROJECT_DIR" > "$PROMO_FLAG"
EOF
  exit 2
fi

APPROVED_HEAD=$(jq -r '.headSha // empty' "$PROMO_FLAG" 2>/dev/null || echo "")
DECISION=$(jq -r '.decision // empty' "$PROMO_FLAG" 2>/dev/null || echo "")
if [ "$DECISION" != "approved" ] || [ "$APPROVED_HEAD" != "$HEAD_SHA" ]; then
  echo "production promotion blocked: approval checkpoint does not match current HEAD." >&2
  exit 2
fi

if ! node "$PROJECT_DIR/scripts/harness/diff-snapshot.mjs" verify --project "$PROJECT_DIR" --file "$PROMO_FLAG" >/dev/null; then
  echo "production promotion blocked: working tree changed after approval checkpoint creation." >&2
  exit 2
fi

exit 0
