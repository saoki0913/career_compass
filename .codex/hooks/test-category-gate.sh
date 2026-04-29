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

PROJECT_DIR=$(codex_project_dir "$INPUT")
COMMAND_CLASSIFICATION=$(node "$PROJECT_DIR/scripts/harness/command-classifier.mjs" "$CMD")
COMMAND_CATEGORIES=$(printf '%s' "$COMMAND_CLASSIFICATION" | jq -r '.testCategories[]?' 2>/dev/null || true)

if [ -z "$COMMAND_CATEGORIES" ]; then
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
Test command blocked by Codex hook. Ask the user with AskUserQuestion, then record:
  node scripts/harness/diff-snapshot.mjs checkpoint --kind test-categories --decision approved --project "$(pwd)" \
    --categories "e2e-functional=run:<features>,quality=skip,static=run,security=run" > $FLAG
EOF
  exit 2
fi

if ! jq -e . "$FLAG" >/dev/null 2>&1; then
  echo "Test category checkpoint must be JSON: $FLAG" >&2
  exit 2
fi

if ! node "$PROJECT_DIR/scripts/harness/diff-snapshot.mjs" verify --project "$PROJECT_DIR" --file "$FLAG" >/dev/null; then
  echo "Test category checkpoint is stale for the current staged diff." >&2
  exit 2
fi

feature_allowed_by_value() {
  local value="$1"
  local feature="$2"
  local approved=""
  case "$value" in
    run) approved="all" ;;
    run:*) approved="${value#run:}" ;;
    partial:*) approved="${value#partial:}" ;;
    *) approved="" ;;
  esac
  approved="${approved%%:*}"
  [ "$approved" = "all" ] && return 0
  printf ',%s,' "$approved" | grep -q ",$feature,"
}

for command_category in $COMMAND_CATEGORIES; do
  category_value="$(jq -r --arg key "$command_category" '.categories[$key] // .[$key] // empty' "$FLAG" 2>/dev/null || echo "")"
  if [ -z "$category_value" ]; then
    echo "$command_category is missing from test category checkpoint: $FLAG" >&2
    exit 2
  fi

  case "$category_value" in
    run|run:*|partial:*) ;;
    skip|skip:*)
      echo "$command_category is marked skip in checkpoint: $FLAG" >&2
      exit 2
      ;;
    *)
      echo "Invalid $command_category checkpoint value: $category_value" >&2
      exit 2
      ;;
  esac

  command_features="$(printf '%s' "$COMMAND_CLASSIFICATION" | jq -r --arg key "$command_category" '.testCategoryFeatures[$key][]?' 2>/dev/null || true)"
  if { [ "$command_category" = "e2e-functional" ] || [ "$command_category" = "quality" ]; } && [ -n "$command_features" ]; then
    for command_feature in $command_features; do
      if ! feature_allowed_by_value "$category_value" "$command_feature"; then
        echo "$command_category checkpoint ($category_value) does not cover command feature: $command_feature" >&2
        exit 2
      fi
    done
  fi
done

exit 0
