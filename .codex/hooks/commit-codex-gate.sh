#!/bin/bash
# PreToolUse (Bash): require Codex post_review checkpoint before large commits.
set -euo pipefail

INPUT=$(cat)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=lib/codex-hook-utils.sh
. "$SCRIPT_DIR/lib/codex-hook-utils.sh"

PROJECT_DIR=$(codex_project_dir "$INPUT")
# shellcheck source=../../scripts/harness/hook-shared.sh
. "$PROJECT_DIR/scripts/harness/hook-shared.sh"
# shellcheck source=../../scripts/harness/guard-core.sh
. "$PROJECT_DIR/scripts/harness/guard-core.sh"

CMD=$(codex_tool_command "$INPUT")
SESSION_ID=$(printf '%s' "$INPUT" | jq -r '.session_id // empty' 2>/dev/null || true)

if [ -z "$CMD" ]; then
  exit 0
fi

if ! guard_command_is_git_commit "$CMD"; then
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
  node scripts/harness/diff-snapshot.mjs checkpoint --kind commit-review --decision reviewed-proceed --project "$PROJECT_DIR" \
    --review-request-id "<review.json requestId>" --review-execution-status SUCCESS \
    --review-verdict "<APPROVE|REQUEST_CHANGES>" --max-severity "<low|medium|high|critical>" > $COMMIT_DELEG_FLAG
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

KIND=$(jq -r '.kind // empty' "$COMMIT_DELEG_FLAG" 2>/dev/null || echo "")
if [ "$KIND" != "commit-review" ]; then
  echo "Large git commit blocked: checkpoint kind must be commit-review." >&2
  exit 2
fi

if [ "$DECISION" != "fallback-reviewed" ]; then
  REVIEW_REQUEST_ID=$(jq -r '.reviewRequestId // empty' "$COMMIT_DELEG_FLAG" 2>/dev/null || echo "")
  REVIEW_EXECUTION_STATUS=$(jq -r '.reviewExecutionStatus // empty' "$COMMIT_DELEG_FLAG" 2>/dev/null || echo "")
  REVIEW_VERDICT=$(jq -r '.reviewVerdict // empty' "$COMMIT_DELEG_FLAG" 2>/dev/null || echo "")
  MAX_SEVERITY=$(jq -r '.maxSeverity // empty' "$COMMIT_DELEG_FLAG" 2>/dev/null || echo "")

  if [ -z "$REVIEW_REQUEST_ID" ] || [ "$REVIEW_EXECUTION_STATUS" != "SUCCESS" ]; then
    echo "Large git commit blocked: commit-review checkpoint must include a successful Codex review request." >&2
    exit 2
  fi

  case "$REVIEW_VERDICT" in
    APPROVE) ;;
    REQUEST_CHANGES)
      case "$MAX_SEVERITY" in
        low|medium) ;;
        *)
          echo "Large git commit blocked: Codex review requested high/critical changes." >&2
          exit 2
          ;;
      esac
      ;;
    *)
      echo "Large git commit blocked: Codex review verdict must be APPROVE or low/medium REQUEST_CHANGES." >&2
      exit 2
      ;;
  esac

  REVIEW_JSON=""
  for dir in "$PROJECT_DIR/.codex/state/handoffs/$REVIEW_REQUEST_ID" "$PROJECT_DIR/.claude/state/codex-handoffs/$REVIEW_REQUEST_ID"; do
    if [ -f "$dir/review.json" ]; then
      REVIEW_JSON="$dir/review.json"
      break
    fi
  done

  if [ -z "$REVIEW_JSON" ]; then
    echo "Large git commit blocked: matching Codex review.json was not found." >&2
    exit 2
  fi

  CHECKPOINT_HASH=$(jq -r '.stagedDiffHash // empty' "$COMMIT_DELEG_FLAG" 2>/dev/null || echo "")
  REVIEW_HASH=$(jq -r '.stagedDiffHash // empty' "$REVIEW_JSON" 2>/dev/null || echo "")
  REVIEW_ID=$(jq -r '.requestId // empty' "$REVIEW_JSON" 2>/dev/null || echo "")
  if [ "$REVIEW_ID" != "$REVIEW_REQUEST_ID" ] || [ -z "$CHECKPOINT_HASH" ] || [ "$REVIEW_HASH" != "$CHECKPOINT_HASH" ]; then
    echo "Large git commit blocked: commit-review checkpoint does not match Codex review.json." >&2
    exit 2
  fi
fi

exit 0
