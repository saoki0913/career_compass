#!/bin/bash
# PreToolUse (apply_patch/Edit/Write): block newly introduced band-aid patterns.
set -euo pipefail

INPUT=$(cat)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=lib/codex-hook-utils.sh
. "$SCRIPT_DIR/lib/codex-hook-utils.sh"

SESSION_ID=$(printf '%s' "$INPUT" | jq -r '.session_id // empty' 2>/dev/null || true)
PROJECT_DIR=$(codex_project_dir "$INPUT")
FILE_PATH=$(codex_primary_file_path "$INPUT")

if [ -z "$SESSION_ID" ] || [ -z "$FILE_PATH" ]; then
  exit 0
fi

REL_PATH=$(codex_rel_path "$PROJECT_DIR" "$FILE_PATH")

case "$REL_PATH" in
  *.md|*.txt|*.json|*.yml|*.yaml|*.toml|*.csv|*.svg|*.html|*.css|*.lock)
    exit 0
    ;;
esac

STATE_DIR=$(codex_session_state_dir)
APPROVED_FILE="$STATE_DIR/bandaid-approved-$SESSION_ID"
if [ -f "$APPROVED_FILE" ] && grep -qxF "$REL_PATH" "$APPROVED_FILE" 2>/dev/null; then
  exit 0
fi

IS_TEST_FILE=false
case "$REL_PATH" in
  *.test.*|*.spec.*|e2e/*|backend/tests/*) IS_TEST_FILE=true ;;
esac

NEW_TEXT=$(codex_added_patch_text "$INPUT")
OLD_TEXT=$(codex_old_patch_text "$INPUT")

if [ -z "$NEW_TEXT" ]; then
  exit 0
fi

FOUND=()

check_pattern() {
  local label="$1"
  local regex="$2"
  local test_exempt="$3"

  if [ "$test_exempt" = "yes" ] && [ "$IS_TEST_FILE" = "true" ]; then
    return
  fi

  if printf '%s' "$NEW_TEXT" | grep -qE "$regex"; then
    if [ -z "$OLD_TEXT" ] || ! printf '%s' "$OLD_TEXT" | grep -qE "$regex"; then
      FOUND+=("$label")
    fi
  fi
}

check_pattern "@ts-ignore" "@ts-ignore" "no"
check_pattern "@ts-expect-error" "@ts-expect-error" "yes"
check_pattern "as any" '\bas[[:space:]]+any\b' "no"
check_pattern "as unknown" '\bas[[:space:]]+unknown\b' "no"
check_pattern "empty catch block" 'catch[[:space:]]*\([^)]*\)[[:space:]]*\{[[:space:]]*\}' "no"
check_pattern "jest.mock / vi.mock outside tests" '(jest|vi)\.mock\(' "yes"
check_pattern ".skip / .only" '\.(skip|only)\(' "no"
check_pattern "xit / xdescribe" '\bx(it|describe)\(' "no"
check_pattern "TODO/FIXME/HACK comment" '//[[:space:]]*(TODO|FIXME|HACK)' "no"
check_pattern "console output" 'console\.(log|warn|error|debug)\(' "no"

if [ ${#FOUND[@]} -eq 0 ]; then
  exit 0
fi

PATTERN_LIST=""
for pattern in "${FOUND[@]}"; do
  PATTERN_LIST="$PATTERN_LIST  - $pattern
"
done

cat >&2 <<EOF
Band-aid pattern detected by Codex hook.

File: $REL_PATH
Patterns:
$PATTERN_LIST
Use a root-cause fix, or explicitly approve this file by recording:
  echo "$REL_PATH" >> $APPROVED_FILE
EOF
exit 2
