#!/bin/bash
# PreToolUse (Bash): require Codex post_review checkpoint before large commits.
set -euo pipefail

INPUT=$(cat)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=lib/codex-hook-utils.sh
. "$SCRIPT_DIR/lib/codex-hook-utils.sh"

PROJECT_DIR=$(codex_project_dir "$INPUT")
# shellcheck source=../../.claude/hooks/lib/skill-recommender.sh
. "$PROJECT_DIR/.claude/hooks/lib/skill-recommender.sh"

CMD=$(codex_tool_command "$INPUT")
SESSION_ID=$(printf '%s' "$INPUT" | jq -r '.session_id // empty' 2>/dev/null || true)

if [ -z "$CMD" ]; then
  exit 0
fi

if ! printf '%s' "$CMD" | grep -qE '(^|[^a-zA-Z_])git[[:space:]]+commit'; then
  exit 0
fi

NUMSTAT=$(git -C "$PROJECT_DIR" diff --cached --numstat 2>/dev/null || true)

CHANGED_FILES=$(printf '%s\n' "$NUMSTAT" | grep -cE '.' || true)
TOTAL_FILES=$CHANGED_FILES
TOTAL_LINES=$(printf '%s\n' "$NUMSTAT" | awk '$1 ~ /^[0-9]+$/ && $2 ~ /^[0-9]+$/ {sum += $1 + $2} END {print sum+0}')

HOTSPOT_HIT=""
ALL_PATHS=$(printf '%s\n' "$NUMSTAT" | awk 'NF {print $NF}')
while IFS= read -r changed_path; do
  [ -z "$changed_path" ] && continue
  if is_hotspot_path "$changed_path"; then
    HOTSPOT_HIT="$changed_path"
    break
  fi
done <<< "$ALL_PATHS"

if ! is_codex_post_review_candidate "$TOTAL_FILES" "$TOTAL_LINES" "$HOTSPOT_HIT"; then
  exit 0
fi

if [ -z "$SESSION_ID" ]; then
  echo "Large git commit blocked: session_id is unavailable, so review checkpoint cannot be verified." >&2
  exit 2
fi

STATE_DIR=$(codex_session_state_dir)
COMMIT_DELEG_FLAG="$STATE_DIR/codex-commit-delegation-$SESSION_ID"

if [ ! -f "$COMMIT_DELEG_FLAG" ]; then
  cat >&2 <<EOF
Large git commit blocked by Codex hook.

Detected files=$TOTAL_FILES, lines=$TOTAL_LINES${HOTSPOT_HIT:+, hotspot=$HOTSPOT_HIT}.
Run:
  bash scripts/codex/delegate.sh post_review
Then record one approved decision:
  node scripts/harness/diff-snapshot.mjs checkpoint --kind commit-review --decision reviewed-proceed --project "$PROJECT_DIR" > $COMMIT_DELEG_FLAG
EOF
  exit 2
fi

DECISION=$(jq -r '.decision // empty' "$COMMIT_DELEG_FLAG" 2>/dev/null || echo "")
case "$DECISION" in
  reviewed-proceed|delegate-fixes|fallback-reviewed) ;;
  *)
    cat >&2 <<EOF
Invalid commit review checkpoint: "$DECISION"
Allowed values: reviewed-proceed / delegate-fixes / fallback-reviewed
EOF
    exit 2
    ;;
esac

if ! node "$PROJECT_DIR/scripts/harness/diff-snapshot.mjs" verify --project "$PROJECT_DIR" --file "$COMMIT_DELEG_FLAG" >/dev/null; then
  echo "Large git commit blocked: staged diff changed after checkpoint creation." >&2
  exit 2
fi

exit 0
