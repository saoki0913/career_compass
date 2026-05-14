#!/bin/bash
# PreToolUse (Edit|Write): defense-in-depth after Plan mode exit.
# plan-exited フラグがなければ (Plan mode 未使用) 素通り。
set -euo pipefail

INPUT=$(cat)
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // empty')
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
HOOK_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=../../.codex/hooks/lib/codex-hook-utils.sh
. "$HOOK_DIR/../../.codex/hooks/lib/codex-hook-utils.sh"
if [ -z "$FILE_PATH" ]; then
  FILE_PATH=$(printf '%s' "$INPUT" | jq -r '[.tool_input.edits[]?.file_path?, .tool_input.edits[]?.path?] | map(select(. != null and . != "")) | .[0] // empty' 2>/dev/null || true)
fi
if [ -z "$FILE_PATH" ]; then
  FILE_PATH=$(codex_primary_file_path "$INPUT")
fi

if [ -z "$SESSION_ID" ] || [ -z "$FILE_PATH" ]; then
  exit 0
fi

case "$FILE_PATH" in
  */.claude/plans/*|*/.claude/state/*|*/codex-handoffs/*)
    exit 0
    ;;
esac

STATE_DIR="$HOME/.claude/sessions/career_compass"
PLAN_FLAG="$STATE_DIR/plan-exited-$SESSION_ID"
DELEGATION_FLAG="$STATE_DIR/codex-delegation-checkpoint-$SESSION_ID"

if [ ! -f "$PLAN_FLAG" ]; then
  exit 0
fi

if [ ! -f "$DELEGATION_FLAG" ]; then
  cat >&2 <<EOF
⛔ 実装開始をブロックしました。

Plan mode が使用されましたが、Codex 委譲判断が未完了です。
CLAUDE.md §A: ExitPlanMode の前に plan review と委譲判断を完了してください。

手順:
  1. AskUserQuestion では、人間が判断しやすい日本語で確認する
     例: 「この実装を別のAI作業者にも担当させますか？」
     以下の情報を提示すること:
       a. どのファイル・範囲を任せるか
       b. 任せる理由と、任せない場合の進め方
       c. 共有する前提情報
       d. 目安時間
       e. 一括で任せるか、一部だけ任せるか
  2. ユーザーの回答をメモに記録
  3. フラグ設定: echo "<decision>" > $DELEGATION_FLAG
     (<decision> = delegate / no-delegate / partial)
  4. 必要なら ExitPlanMode の確認 checkpoint も作成してから再度 Edit|Write を実行
EOF
  exit 2
fi

DELEG_CONTENT=$(tr -d '[:space:]' < "$DELEGATION_FLAG" 2>/dev/null || echo "")
case "$DELEG_CONTENT" in
  delegate|no-delegate|partial) ;;
  *)
    cat >&2 <<EOF
⛔ 実装開始をブロックしました。

delegation checkpoint の内容が不正: "$DELEG_CONTENT"
許可値: delegate / no-delegate / partial

手順:
  echo "<decision>" > $DELEGATION_FLAG
  (<decision> = delegate / no-delegate / partial)
EOF
    exit 2
    ;;
esac

exit 0
