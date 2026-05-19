#!/bin/bash
# PreToolUse (Bash): require an explicit test category checkpoint.
set -euo pipefail

INPUT=$(cat)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=lib/codex-hook-utils.sh
. "$SCRIPT_DIR/lib/codex-hook-utils.sh"
# shellcheck source=lib/autonomy.sh
. "$SCRIPT_DIR/lib/autonomy.sh"

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

# Test execution itself is reversible, but running the wrong category can
# invalidate the commit manifest. Codex may still auto-create a test-only
# autonomy manifest; otherwise category mismatch is a high-severity gate.
# shellcheck source=../../scripts/harness/guard-runtime.sh
. "$PROJECT_DIR/scripts/harness/guard-runtime.sh"
GR_HOOK=test-category-gate
gr_init "$INPUT" codex

if [ -z "$SESSION_ID" ]; then
  gr_enforce high "テストカテゴリの記録先（session_id）が無いため選択を検証できません。"
fi

STATE_DIR=$(codex_session_state_dir)
FLAG="$STATE_DIR/test-categories-$SESSION_ID"

if [ ! -f "$FLAG" ]; then
  if codex_autonomy_allows_action "$PROJECT_DIR" "$STATE_DIR" "$SESSION_ID" "test" "$CMD"; then
    exit 0
  fi
  gr_enforce high "テストカテゴリ未選択のまま実行しようとしています。
変更範囲に応じた確認を明示する場合の記録手順:
  node scripts/harness/diff-snapshot.mjs checkpoint --kind test-categories --decision approved --project \"$PROJECT_DIR\" \\
    --categories \"e2e-functional=run:<features>,quality=skip,static=run,security=run\" > $FLAG
CI / pre-commit と同じ staged diff に結び付けてください。"
fi

if ! jq -e . "$FLAG" >/dev/null 2>&1; then
  gr_enforce high "テストカテゴリ記録を読み取れません。再記録してください。"
fi

if ! node "$PROJECT_DIR/scripts/harness/diff-snapshot.mjs" verify --project "$PROJECT_DIR" --file "$FLAG" >/dev/null; then
  gr_enforce high "記録後に差分が変わりました。カテゴリを選び直してください。"
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
    gr_enforce high "確認項目 '$command_category' が未選択です。"
  fi

  case "$category_value" in
    run|run:*|partial:*) ;;
    skip|skip:*)
      gr_enforce high "確認項目 '$command_category' は skip 設定です。実行する場合は run に選び直してください。"
      ;;
    *)
      gr_enforce high "確認項目 '$command_category' の記録形式が想定外です。再記録してください。"
      ;;
  esac

  command_features="$(printf '%s' "$COMMAND_CLASSIFICATION" | jq -r --arg key "$command_category" '.testCategoryFeatures[$key][]?' 2>/dev/null || true)"
  if { [ "$command_category" = "e2e-functional" ] || [ "$command_category" = "quality" ]; } && [ -n "$command_features" ]; then
    for command_feature in $command_features; do
      if ! feature_allowed_by_value "$category_value" "$command_feature"; then
        gr_enforce high "変更範囲の機能 '$command_feature' が確認対象に未選択です。"
      fi
    done
  fi
done

exit 0
