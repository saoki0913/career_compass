#!/bin/bash
# PreToolUse (Bash): block production secret apply without approval checkpoint.
# Staging targets are auto-allowed; production/all targets require explicit approval.
set -euo pipefail

INPUT=$(cat)
CMD=$(echo "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null || echo "")
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // empty' 2>/dev/null || echo "")
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
# shellcheck source=../../scripts/harness/guard-core.sh
. "$PROJECT_DIR/scripts/harness/guard-core.sh"

if [ -z "$CMD" ] || ! guard_command_is_secret_apply_production "$CMD"; then
  exit 0
fi

if [ -z "$SESSION_ID" ]; then
  echo "secret apply (production) blocked: session_id is unavailable." >&2
  exit 2
fi

STATE_DIR=$(guard_state_dir_for_runtime claude)
FLAG="$STATE_DIR/secret-apply-production-approved-$SESSION_ID"
HEAD_SHA=$(git -C "$PROJECT_DIR" rev-parse HEAD 2>/dev/null || echo "")

if [ -f "$FLAG" ]; then
  APPROVED_HEAD=$(jq -r '.headSha // empty' "$FLAG" 2>/dev/null || echo "")
  DECISION=$(jq -r '.decision // empty' "$FLAG" 2>/dev/null || echo "")
  if [ "$DECISION" = "approved" ] && [ "$APPROVED_HEAD" = "$HEAD_SHA" ]; then
    exit 0  # Checkpoint valid
  fi
  echo "secret apply checkpoint HEAD mismatch. Re-approval required." >&2
fi

# Attempt to show changed keys via --check --json
SECRET_PLAN=$(zsh "$PROJECT_DIR/scripts/release/sync-career-compass-secrets.sh" --check --target all --json 2>/dev/null || true)
if [ -n "$SECRET_PLAN" ]; then
  CHANGED_KEYS=$(echo "$SECRET_PLAN" | jq -r '.changedKeys[]? // empty' 2>/dev/null || echo "(unavailable)")
else
  CHANGED_KEYS="(could not retrieve secret plan)"
fi

cat >&2 <<EOF
Secret apply to production targets blocked.

Changed keys:
$CHANGED_KEYS

Action: Use AskUserQuestion to confirm production secret sync, then create checkpoint:
  node scripts/harness/diff-snapshot.mjs checkpoint --kind secret-apply --decision approved --release-mode secret-production --project "$PROJECT_DIR" > "$FLAG"
EOF
exit 2
