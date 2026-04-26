#!/bin/bash
# PreToolUse (Bash): テストカテゴリ選択の checkpoint を検証する。
# AskUserQuestion によるカテゴリ選択は Claude orchestration が担当し、
# このhookは checkpoint の存在とフォーマットのみ検証する。
#
# Checkpoint format:
#   e2e-functional=run:<features>,quality=skip,static=run,security=run
#   e2e-functional=skip,quality=run,static=skip,security=skip
#
# 旧 e2e-confirm-guard.sh + e2e-options-guard.sh を統合・置換。
set -euo pipefail

INPUT=$(cat)
CMD=$(echo "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null || echo "")
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // empty' 2>/dev/null || echo "")

if [ -z "$CMD" ]; then exit 0; fi

COMMAND_CATEGORY=""
if echo "$CMD" | grep -qE '(^|[;&|])\s*make\s+(test-e2e-functional-local|ai-live-local)\b' || echo "$CMD" | grep -qE '(^|[;&|])\s*(bash\s+)?scripts/dev/run-ai-live-local\.sh\b'; then
  COMMAND_CATEGORY="e2e-functional"
elif echo "$CMD" | grep -qE '(^|[;&|])\s*make\s+test-quality-' || echo "$CMD" | grep -qE '(^|[;&|])\s*bash\s+scripts/ci/run-ai-live\.sh\b'; then
  COMMAND_CATEGORY="quality"
elif echo "$CMD" | grep -qE '(^|[;&|])\s*npx\s+tsc\s+--noEmit\b' || echo "$CMD" | grep -qE '(^|[;&|])\s*npm\s+run\s+lint\b'; then
  COMMAND_CATEGORY="static"
elif echo "$CMD" | grep -qE '(^|[;&|])\s*make\s+security-scan\b' || echo "$CMD" | grep -qE '(^|[;&|])\s*(bash\s+)?security/scan/run-lightweight-scan\.sh\b'; then
  COMMAND_CATEGORY="security"
fi

if [ -z "$COMMAND_CATEGORY" ]; then exit 0; fi

if [ -z "$SESSION_ID" ]; then
  echo "test-category-gate: session_id unknown. Confirm via AskUserQuestion first." >&2
  exit 2
fi

STATE_DIR="$HOME/.claude/sessions/career_compass"
mkdir -p "$STATE_DIR"
FLAG="$STATE_DIR/test-categories-$SESSION_ID"

# --- 1. Existence check ---
if [ ! -f "$FLAG" ]; then
  cat >&2 <<EOF
test-category-gate: テスト実行をブロック。カテゴリ選択が未完了です。

手順:
  1. 変更ファイルを分析し、推奨テストカテゴリを決定
  2. AskUserQuestion (multiSelect) でカテゴリ選択を提示:
     - E2E Functional (機能確認)
     - Quality Tests (LLM品質)
     - Static Analysis (lint/型チェック)
     - Security Scan (Trace-core/secrets)
  3. 選択結果を checkpoint に記録:
     echo "e2e-functional=run:<features>,quality=skip,static=run,security=run" > $FLAG
  4. テストコマンドを再実行
EOF
  exit 2
fi

# --- 2. Non-empty check ---
CONTENT=$(tr -d '[:space:]' < "$FLAG" 2>/dev/null || echo "")
if [ -z "$CONTENT" ]; then
  echo "test-category-gate: checkpoint is empty. Re-confirm via AskUserQuestion." >&2
  exit 2
fi

# --- 3. Format validation ---
# At least one category must be present
if ! echo "$CONTENT" | grep -qE '(e2e-functional|quality|static|security)=(run|skip|partial)'; then
  cat >&2 <<EOF
test-category-gate: checkpoint format invalid: "$CONTENT"
Expected format: e2e-functional=run:<features>,quality=skip,static=run,security=run
Each category: run / run:<features> / skip / partial:<runFeatures>:<skipFeatures>
EOF
  exit 2
fi

category_value="$(printf '%s' "$CONTENT" | tr ',' '\n' | awk -F= -v key="$COMMAND_CATEGORY" '$1 == key {print $2; exit}')"
if [ -z "$category_value" ]; then
  cat >&2 <<EOF
test-category-gate: $COMMAND_CATEGORY の選択が checkpoint にありません。
checkpoint="$CONTENT"
EOF
  exit 2
fi

case "$category_value" in
  run|run:*|partial:*) ;;
  skip|skip:*)
    cat >&2 <<EOF
test-category-gate: $COMMAND_CATEGORY は checkpoint で skip されています。
AskUserQuestion で run に変更してからコマンドを実行してください。
checkpoint="$CONTENT"
EOF
    exit 2
    ;;
  *)
    cat >&2 <<EOF
test-category-gate: $COMMAND_CATEGORY の選択値が不正です: "$category_value"
許可値: run / run:<features> / partial:<runFeatures>:<skipFeatures> / skip
EOF
    exit 2
    ;;
esac

exit 0
