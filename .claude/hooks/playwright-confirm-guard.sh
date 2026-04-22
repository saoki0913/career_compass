#!/bin/bash
# PreToolUse (Bash): Playwright テスト実行前に AskUserQuestion 確認を強制。
# browserRequired: true の全機能で、Playwright の実行/スキップをユーザーに確認する。
set -euo pipefail

INPUT=$(cat)
CMD=$(echo "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null || echo "")
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // empty' 2>/dev/null || echo "")

if [ -z "$CMD" ]; then exit 0; fi

IS_LOCAL_E2E=false
if echo "$CMD" | grep -qE '(^|[;&|])\s*make\s+(test-e2e-functional-local|ai-live-local)\b'; then
  IS_LOCAL_E2E=true
elif echo "$CMD" | grep -qF 'run-ai-live-local.sh'; then
  IS_LOCAL_E2E=true
fi

if [ "$IS_LOCAL_E2E" = false ]; then exit 0; fi

if [ -z "$SESSION_ID" ]; then
  echo "playwright-confirm: session_id unknown. Confirm via AskUserQuestion first." >&2
  exit 2
fi

STATE_DIR="$HOME/.claude/sessions/career_compass"
mkdir -p "$STATE_DIR"
FLAG="$STATE_DIR/playwright-confirm-$SESSION_ID"

if [ ! -f "$FLAG" ]; then
  cat >&2 <<EOF
Playwright テスト実行をブロック: AskUserQuestion での確認が未完了。

手順:
  1. browserRequired: true の対象 features を一覧表示
  2. 各 feature をトリガーした変更ファイルと変更内容を提示
  3. AskUserQuestion で「Playwright テストを実行しますか？」を確認
  4. echo "<decision>" > $FLAG  (run / run:<features> / skip)
  5. E2E コマンドを再実行

checkpoint に書く値:
  run          全 browserRequired features で Playwright を実行
  run:<csv>    指定 features のみ Playwright を実行
  skip         全 Playwright をスキップ (AI_LIVE_SKIP_ALL_PLAYWRIGHT=1)
EOF
  exit 2
fi

CONTENT=$(tr -d '[:space:]' < "$FLAG" 2>/dev/null || echo "")
if [ -z "$CONTENT" ]; then
  echo "playwright-confirm checkpoint is empty. Re-confirm via AskUserQuestion." >&2
  exit 2
fi

exit 0
