#!/bin/bash
# PreToolUse (Bash): テストカテゴリ選択の checkpoint を検証する。
# AskUserQuestion によるカテゴリ選択は Claude orchestration が担当し、
# このhookは checkpoint の存在とフォーマットのみ検証する。
#
# Checkpoint format: JSON generated from scripts/harness/diff-snapshot.mjs checkpoint,
# plus a categories object, bound to the staged diff hash.
#
# 旧 e2e-confirm-guard.sh + e2e-options-guard.sh を統合・置換。
set -euo pipefail

INPUT=$(cat)
CMD=$(echo "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null || echo "")
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // empty' 2>/dev/null || echo "")
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"

if [ -z "$CMD" ]; then exit 0; fi

COMMAND_CLASSIFICATION=$(node "$PROJECT_DIR/scripts/harness/command-classifier.mjs" "$CMD")
COMMAND_CATEGORIES=$(printf '%s' "$COMMAND_CLASSIFICATION" | jq -r '.testCategories[]?' 2>/dev/null || true)

if [ -z "$COMMAND_CATEGORIES" ]; then exit 0; fi

# Category selection is a high-severity gate: the selected checks must be
# bound to the staged diff before important test commands are run.
# shellcheck source=../../scripts/harness/guard-runtime.sh
. "$PROJECT_DIR/scripts/harness/guard-runtime.sh"
GR_HOOK=test-category-gate
gr_init "$INPUT" claude

if [ -z "$SESSION_ID" ]; then
  gr_enforce high "test-category-gate: session_id unknown; category selection cannot be verified."
fi

STATE_DIR="$HOME/.claude/sessions/career_compass"
mkdir -p "$STATE_DIR"
FLAG="$STATE_DIR/test-categories-$SESSION_ID"

# --- 1. Existence check ---
if [ ! -f "$FLAG" ]; then
  gr_enforce high "test-category-gate: テストカテゴリ未選択のまま実行しようとしています。
推奨: 変更ファイルを分析し、AskUserQuestion で確認項目（動作確認 / AI出力品質 / 型・lint / セキュリティ）を提示し、選択を staged diff に結び付けて記録:
  node scripts/harness/diff-snapshot.mjs checkpoint --kind test-categories --decision approved --project \"$PROJECT_DIR\" \\
    --categories \"e2e-functional=run:<features>,quality=skip,static=run,security=run\" > $FLAG
CI / pre-commit と同じ staged diff に結び付けてください。"
fi

# --- 2. JSON + staged diff validation (advisory, non-blocking) ---
if ! jq -e . "$FLAG" >/dev/null 2>&1; then
  gr_enforce high "test-category-gate: checkpoint が JSON ではありません。再記録してください。"
fi

if ! node "$PROJECT_DIR/scripts/harness/diff-snapshot.mjs" verify --project "$PROJECT_DIR" --file "$FLAG" >/dev/null; then
  gr_enforce high "test-category-gate: checkpoint 作成後に staged diff が変わりました。カテゴリを選び直してください。checkpoint=$FLAG"
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
    gr_enforce high "test-category-gate: '$command_category' の選択が checkpoint にありません。checkpoint=$FLAG"
  fi

  case "$category_value" in
    run|run:*|partial:*) ;;
    skip|skip:*)
      gr_enforce high "test-category-gate: '$command_category' は checkpoint で skip 設定です。実行する場合は run に選び直してください。checkpoint=$FLAG"
      ;;
    *)
      gr_enforce high "test-category-gate: '$command_category' の選択値が不正です: \"$category_value\"。許可値: run / run:<features> / partial:<runFeatures>:<skipFeatures> / skip"
      ;;
  esac

  command_features="$(printf '%s' "$COMMAND_CLASSIFICATION" | jq -r --arg key "$command_category" '.testCategoryFeatures[$key][]?' 2>/dev/null || true)"
  if { [ "$command_category" = "e2e-functional" ] || [ "$command_category" = "quality" ]; } && [ -n "$command_features" ]; then
    for command_feature in $command_features; do
      if ! feature_allowed_by_value "$category_value" "$command_feature"; then
        gr_enforce high "test-category-gate: '$command_category' checkpoint ($category_value) が変更範囲の機能 '$command_feature' を網羅していません。"
      fi
    done
  fi
done

exit 0
