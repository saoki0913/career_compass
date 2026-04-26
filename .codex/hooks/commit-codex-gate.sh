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

NUMSTAT=$(git -C "$PROJECT_DIR" diff --numstat HEAD 2>/dev/null || true)
UNTRACKED=$(git -C "$PROJECT_DIR" ls-files --others --exclude-standard 2>/dev/null || true)

CHANGED_FILES=$(printf '%s\n' "$NUMSTAT" | grep -cE '.' || true)
UNTRACKED_FILES=$(printf '%s\n' "$UNTRACKED" | grep -cE '.' || true)
TOTAL_FILES=$((CHANGED_FILES + UNTRACKED_FILES))
TOTAL_LINES=$(printf '%s\n' "$NUMSTAT" | awk '$1 ~ /^[0-9]+$/ && $2 ~ /^[0-9]+$/ {sum += $1 + $2} END {print sum+0}')

HOTSPOT_HIT=""
ALL_PATHS=$(printf '%s\n%s\n' "$NUMSTAT" "$UNTRACKED" | awk 'NF {if (NF > 1) print $NF; else print $0}')
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
  echo "reviewed-proceed" > $COMMIT_DELEG_FLAG
  echo "delegate-fixes" > $COMMIT_DELEG_FLAG
  echo "fallback-reviewed" > $COMMIT_DELEG_FLAG
EOF
  exit 2
fi

CONTENT=$(tr -d '[:space:]' < "$COMMIT_DELEG_FLAG" 2>/dev/null || echo "")
case "$CONTENT" in
  reviewed-proceed|delegate-fixes|fallback-reviewed) ;;
  *)
    cat >&2 <<EOF
Invalid commit review checkpoint: "$CONTENT"
Allowed values: reviewed-proceed / delegate-fixes / fallback-reviewed
EOF
    exit 2
    ;;
esac

if [ "$CONTENT" != "fallback-reviewed" ]; then
  LATEST_PR=$(ls -td "$PROJECT_DIR"/.claude/state/codex-handoffs/post_review-*/meta.json 2>/dev/null | head -1)
  if [ -n "$LATEST_PR" ]; then
    PR_MTIME=$(stat -f %m "$LATEST_PR" 2>/dev/null || stat -c %Y "$LATEST_PR" 2>/dev/null || echo 0)
    CP_MTIME=$(stat -f %m "$COMMIT_DELEG_FLAG" 2>/dev/null || stat -c %Y "$COMMIT_DELEG_FLAG" 2>/dev/null || echo 0)
    if [ "$CP_MTIME" -le "$PR_MTIME" ]; then
      echo "Large git commit blocked: review checkpoint is older than the latest post_review handoff." >&2
      exit 2
    fi
  fi
fi

exit 0
